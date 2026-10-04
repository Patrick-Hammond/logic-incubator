"use strict";

/**
 * What the in-game sprite editor talks to while `npm start` runs: reading a sprite's source PNGs and saving edited ones
 * back into the game's asset folders. The webpack plugin mounts it on the dev server (never in a production build), and
 * saving just writes files - the watching build packs them and updates the manifest like any other art change.
 *
 *   GET  /list                      the editable bundles, their sprite sheets and every asset name in them
 *   GET  /sprite?bundle=&name=      one sprite or animation: where it lives and how many frames
 *   GET  /frame?bundle=&name=&index=   a frame's source PNG
 *   POST /save                      { bundle, name, mode: "overwrite" | "create", sheet?, category?, copyMetaFrom?, frames: [base64 PNG...] }
 *
 * It writes files on the developer's disk, so it's guarded: loopback clients only, the Host must be localhost (against
 * DNS rebinding), any Origin must be the page's own, and every request needs the `X-Sprite-Editor` header - which a
 * cross-origin page can't send without a CORS preflight this server never allows. A save is planned in full before
 * anything is written: the bundle is re-classified as it would be afterwards, and if that adds an error (a name clash, a
 * gap in an animation) nothing is touched. The editor never names a path - it names a bundle and a sprite.
 *
 * Plain Node (see the other modules here); the planning functions take the loaded config so the tests can run them on a
 * temp folder with no server.
 */

const fs = require("fs");
const path = require("path");
const { ScanAndClassify } = require("./build");
const { ClassifyBundle } = require("./classify");
const { LoadConfig } = require("./config");
const { FrameFileNames, IsValidLocalName, NormalizeLocalName, SpriteNameProblem } = require("./ids");
const { ReadPng } = require("./png");

const MAX_FRAMES = 100;
const MAX_SIZE = 512;
const MAX_SHEET_NAME = 32;
const MAX_BODY_BYTES = 48 * 1024 * 1024;
const DEFAULT_SHEET = "user";
const HEADER = "x-sprite-editor";

class ApiError extends Error {
    constructor(status, message, details) {
        super(message);
        this.status = status;
        this.details = details;
    }
}

const IsSprite = asset => asset.kind === "sprite" || asset.kind === "animation";

function LoadModels(config) {
    const diagnostics = [];
    return ScanAndClassify(config, diagnostics);
}

function FindBundle(models, name) {
    const model = typeof name === "string" ? models.find(m => m.name === name) : undefined;
    if (!model) {
        throw new ApiError(404, `There's no bundle called "${name}".`);
    }
    return model;
}

function RequireEditable(model) {
    if (model.devOnly) {
        throw new ApiError(403, `"${model.name}" is part of the editor's own assets, so it can't be changed here.`);
    }
}

/** Where a sprite's frames are: `{ asset, frames: [{ local, rel, sheet, packed }] }`, or null if the bundle has no sprite or animation of that name. */
function LocateSprite(model, name) {
    const asset = model.assets.find(a => IsSprite(a) && a.local === name);
    if (!asset) {
        return null;
    }
    const frames = asset.frames.map(local => {
        for (let i = 0; i < model.sheets.length; i++) {
            const sheet = model.sheets[i];
            const loose = sheet.frames.find(f => f.local === local);
            if (loose) {
                return { local, rel: loose.rel, sheet: sheet.name, packed: false };
            }
            if (sheet.prepacked && sheet.prepacked.frames && sheet.prepacked.frames.some(f => f.local === local)) {
                return { local, rel: null, sheet: sheet.name, packed: true };
            }
        }
        return { local, rel: null, sheet: null, packed: true };
    });
    return { asset, frames };
}

// ---------------------------------------------------------------------------------------------- reading

/** The bundles that can be edited: their sheets (folders under `sprites/`) and every asset name, so the editor can offer places to save and spot clashes. */
function ListBundles(config) {
    return {
        bundles: LoadModels(config)
            .filter(m => !m.devOnly)
            .map(m => ({
                name: m.name,
                sheets: m.sheets.filter(s => !s.prepacked).map(s => s.name),
                packedSheets: m.sheets.filter(s => s.prepacked).map(s => s.name),
                names: m.assets.map(a => a.local)
            }))
    };
}

function DescribeSprite(config, bundle, name) {
    const model = FindBundle(LoadModels(config), bundle);
    const located = LocateSprite(model, name);
    if (!located) {
        throw new ApiError(404, `"${bundle}" has no sprite or animation called "${name}".`);
    }
    const packed = located.frames.some(f => f.packed);
    const reason = model.devOnly
        ? "It's one of the editor's own assets."
        : packed
        ? "It's in a pre-packed sheet, which has no source frames to edit - change the art and pack it again."
        : null;
    const first = located.frames[0];
    return {
        bundle,
        name,
        kind: located.asset.kind,
        frames: located.frames.length,
        sheet: first.sheet,
        dir: first.rel ? first.rel.slice(0, first.rel.lastIndexOf("/")) : null,
        editable: !reason,
        reason
    };
}

/** The source PNG of one frame of a sprite. */
function ReadFrame(config, bundle, name, index) {
    const model = FindBundle(LoadModels(config), bundle);
    RequireEditable(model);
    const located = LocateSprite(model, name);
    if (!located) {
        throw new ApiError(404, `"${bundle}" has no sprite or animation called "${name}".`);
    }
    const frame = located.frames[index];
    if (!frame || index !== Math.floor(index)) {
        throw new ApiError(404, `"${name}" has ${located.frames.length} frame(s), so there's no frame ${index}.`);
    }
    if (frame.packed) {
        throw new ApiError(422, `"${name}" is in a pre-packed sheet, so there are no source frames to read.`);
    }
    return fs.readFileSync(path.join(model.dir, frame.rel));
}

// ---------------------------------------------------------------------------------------------- saving

/** The request checked and its PNGs decoded; throws a 400 describing the first problem. */
function ParseSaveRequest(body) {
    const bad = message => new ApiError(400, message);
    if (!body || typeof body !== "object") {
        throw bad("The request has no body.");
    }
    if (typeof body.bundle !== "string" || !body.bundle) {
        throw bad("Say which bundle to save into.");
    }
    const problem = SpriteNameProblem(body.name);
    if (problem) {
        throw bad(`"${body.name}": ${problem}.`);
    }
    if (body.mode !== "overwrite" && body.mode !== "create") {
        throw bad('The mode is "overwrite" (change the sprite that\'s there) or "create" (a new one).');
    }
    if (!Array.isArray(body.frames) || !body.frames.length) {
        throw bad("A sprite needs at least one frame.");
    }
    if (body.frames.length > MAX_FRAMES) {
        throw bad(`That's ${body.frames.length} frames; the most is ${MAX_FRAMES}.`);
    }
    let width = 0;
    let height = 0;
    const frames = body.frames.map((text, i) => {
        if (typeof text !== "string" || !text) {
            throw bad(`Frame ${i} is empty.`);
        }
        const data = Buffer.from(text, "base64");
        let image;
        try {
            image = ReadPng(data);
        } catch (error) {
            throw bad(`Frame ${i} isn't a valid PNG (${error.message}).`);
        }
        if (image.width < 1 || image.height < 1 || image.width > MAX_SIZE || image.height > MAX_SIZE) {
            throw bad(`Frame ${i} is ${image.width}x${image.height}; sprites are between 1x1 and ${MAX_SIZE}x${MAX_SIZE}.`);
        }
        if (i === 0) {
            width = image.width;
            height = image.height;
        } else if (image.width !== width || image.height !== height) {
            throw bad(`Frame ${i} is ${image.width}x${image.height} but frame 0 is ${width}x${height} - every frame has to be the same size.`);
        }
        return data;
    });
    if (body.sheet !== undefined && typeof body.sheet !== "string") {
        throw bad("The sheet name has to be text.");
    }
    return {
        bundle: body.bundle,
        name: body.name,
        mode: body.mode,
        sheet: body.sheet === undefined || body.sheet === "" ? DEFAULT_SHEET : body.sheet,
        category: typeof body.category === "string" ? body.category : undefined,
        copyMetaFrom: typeof body.copyMetaFrom === "string" ? body.copyMetaFrom : undefined,
        frames,
        width,
        height
    };
}

/**
 * Works out what saving would do - which files are written, which removed - and checks the bundle would still be sound
 * afterwards. Writes nothing. Returns `{ model, dir, files: [{ rel, data }], remove: [rel], isNew, kind }`.
 */
function PlanSave(config, request) {
    const model = FindBundle(LoadModels(config), request.bundle);
    RequireEditable(model);
    const existing = LocateSprite(model, request.name);
    const isNew = request.mode === "create";

    let dir;
    if (isNew) {
        const clash = model.assets.find(a => a.local === request.name);
        if (clash) {
            throw new ApiError(409, `"${request.bundle}.${request.name}" already exists (a ${clash.kind}) - choose another name.`);
        }
        const sheetName = NormalizeLocalName(request.sheet);
        if (!IsValidLocalName(sheetName) || sheetName.length > MAX_SHEET_NAME) {
            throw new ApiError(400, `"${request.sheet}" can't be a sheet name - use lowercase letters, digits and underscores.`);
        }
        const sheet = model.sheets.find(s => s.name === sheetName);
        if (sheet && sheet.prepacked) {
            throw new ApiError(422, `The sheet "${sheetName}" is a pre-packed atlas, so new frames can't go in it.`);
        }
        // An existing folder keeps its own spelling (the build only compares the normalised name).
        const folder = sheet && sheet.frames.length ? sheet.frames[0].rel.split("/")[1] : sheetName;
        dir = `sprites/${folder}`;
    } else {
        if (!existing) {
            throw new ApiError(404, `"${request.bundle}" has no sprite or animation called "${request.name}" to overwrite.`);
        }
        if (existing.frames.some(f => f.packed)) {
            throw new ApiError(422, `"${request.name}" is in a pre-packed sheet, which has no source frames to overwrite.`);
        }
        dir = existing.frames[0].rel.slice(0, existing.frames[0].rel.lastIndexOf("/"));
    }

    const names = FrameFileNames(request.name, request.frames.length);
    const files = names.map((file, i) => ({ rel: `${dir}/${file}`, data: request.frames[i] }));
    const keep = new Set(files.map(f => f.rel));
    const remove = existing ? existing.frames.map(f => f.rel).filter(rel => !keep.has(rel)) : [];

    // The bundle as it'll be once the files are written and the old ones removed: anything that would now be an error stops the save.
    const gone = new Set(remove);
    const planned = model.files.filter(f => !gone.has(f.rel));
    files.forEach(f => {
        if (!planned.some(p => p.rel === f.rel)) {
            planned.push({ rel: f.rel, bytes: f.data.length });
        }
    });
    const after = ClassifyBundle({
        name: model.name,
        files: planned,
        config: model.rawConfig,
        soundFormats: config.soundFormats,
        readText: rel => fs.readFileSync(path.join(model.dir, rel), "utf8")
    });
    const known = new Set(model.diagnostics.filter(d => d.level === "error").map(d => d.message));
    const introduced = after.diagnostics.filter(d => d.level === "error" && !known.has(d.message)).map(d => d.message);
    if (introduced.length) {
        throw new ApiError(422, `That would leave "${model.name}" with ${introduced.length === 1 ? "an error" : "errors"}, so nothing was saved: ${introduced.join(" ")}`, introduced);
    }
    const kind = request.frames.length > 1 ? "animation" : "sprite";
    const result = after.assets.find(a => IsSprite(a) && a.local === request.name);
    if (!result || result.kind !== kind || result.frames.length !== request.frames.length) {
        throw new ApiError(422, `Saving "${request.name}" wouldn't give a ${kind} of ${request.frames.length} frame(s), so nothing was saved.`);
    }
    return { model, dir, files, remove, isNew, kind };
}

/** Writes a plan: files first (each through a dot-named temp file, which the scan skips, so a build never reads half of one), the old ones removed last. */
function ApplySave(plan) {
    const written = [];
    plan.files.forEach(f => {
        const abs = path.join(plan.model.dir, f.rel);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        if (fs.existsSync(abs) && fs.readFileSync(abs).equals(f.data)) {
            return;
        }
        const temp = path.join(path.dirname(abs), "." + path.basename(abs) + ".saving");
        try {
            fs.writeFileSync(temp, f.data);
            fs.renameSync(temp, abs);
        } catch (error) {
            fs.rmSync(temp, { force: true });
            throw error;
        }
        written.push(f.rel);
    });
    const removed = [];
    plan.remove.forEach(rel => {
        fs.rmSync(path.join(plan.model.dir, rel), { force: true });
        removed.push(rel);
    });
    return { written, removed };
}

/** Plans, writes, then tells the build plugins (`onSpriteSaved`) so they can keep their own files in step (the asset-meta plugin adds the new sprite's entry). */
function SaveSprite(config, body) {
    const request = ParseSaveRequest(body);
    const plan = PlanSave(config, request);
    const { written, removed } = ApplySave(plan);
    const notes = [];
    config.plugins.forEach(file => {
        const plugin = require(file);
        if (typeof plugin.onSpriteSaved === "function") {
            plugin.onSpriteSaved({
                bundle: plan.model,
                name: request.name,
                isNew: plan.isNew,
                category: request.category,
                copyMetaFrom: request.copyMetaFrom,
                config,
                Report: (level, message) => notes.push({ level, message })
            });
        }
    });
    return {
        ok: true,
        bundle: request.bundle,
        name: request.name,
        kind: plan.kind,
        frames: request.frames.length,
        width: request.width,
        height: request.height,
        written,
        removed,
        changed: written.length > 0 || removed.length > 0,
        notes
    };
}

// ---------------------------------------------------------------------------------------------- http

const LOOPBACK = ["127.0.0.1", "::1", "::ffff:127.0.0.1"];
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

/** Why a request must be refused, or null. Exported for the tests. */
function RefuseRequest(req) {
    const address = req.socket && req.socket.remoteAddress;
    if (LOOPBACK.indexOf(address) < 0) {
        return "The sprite editor only answers requests from this machine.";
    }
    const host = req.headers.host;
    if (!host || !LOCAL_HOST.test(host)) {
        return "The sprite editor only answers requests to localhost.";
    }
    const origin = req.headers.origin;
    if (origin) {
        let originHost;
        try {
            originHost = new URL(origin).host;
        } catch {
            return "Bad Origin.";
        }
        if (originHost !== host) {
            return "The sprite editor doesn't answer other sites.";
        }
    }
    if (req.headers[HEADER] !== "1") {
        return `Requests need the "${HEADER}: 1" header.`;
    }
    return null;
}

function SendJson(res, status, value) {
    const text = JSON.stringify(value);
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Length", Buffer.byteLength(text));
    res.end(text);
}

/** The request body as text. One that's over `limit` is read to the end and thrown away - so the 413 can still be sent - rather than kept. */
function ReadBody(req, limit) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on("data", chunk => {
            size += chunk.length;
            if (size <= limit) {
                chunks.push(chunk);
            }
        });
        req.on("end", () => {
            if (size > limit) {
                reject(new ApiError(413, `That's more than ${Math.floor(limit / 1048576)} MB - too much to save in one go.`));
            } else {
                resolve(Buffer.concat(chunks).toString("utf8"));
            }
        });
        req.on("error", reject);
    });
}

/**
 * A connect-style middleware for the dev server. `base` is the path it's mounted at (Express strips it before the
 * handler sees the URL; it's stripped here too, for a server that doesn't).
 */
function CreateSpriteApi(options) {
    const config = LoadConfig(options.configPath);
    const base = options.base || "/__sprite-api";

    return function SpriteApi(req, res) {
        let pathname = req.url || "/";
        if (pathname.indexOf(base) === 0) {
            pathname = pathname.slice(base.length) || "/";
        }
        const url = new URL(pathname, "http://localhost");
        const route = url.pathname;

        const fail = error => {
            if (error instanceof ApiError) {
                SendJson(res, error.status, { error: error.message, details: error.details });
            } else {
                SendJson(res, 500, { error: `The sprite editor's server hit a problem: ${error.message}` });
            }
        };
        const refusal = RefuseRequest(req);
        if (refusal) {
            SendJson(res, 403, { error: refusal });
            return;
        }
        try {
            if (req.method === "GET" && route === "/list") {
                SendJson(res, 200, ListBundles(config));
            } else if (req.method === "GET" && route === "/sprite") {
                SendJson(res, 200, DescribeSprite(config, url.searchParams.get("bundle"), url.searchParams.get("name")));
            } else if (req.method === "GET" && route === "/frame") {
                const data = ReadFrame(config, url.searchParams.get("bundle"), url.searchParams.get("name"), Number(url.searchParams.get("index")));
                res.statusCode = 200;
                res.setHeader("Content-Type", "image/png");
                res.setHeader("Cache-Control", "no-store");
                res.setHeader("Content-Length", data.length);
                res.end(data);
            } else if (req.method === "POST" && route === "/save") {
                ReadBody(req, MAX_BODY_BYTES)
                    .then(text => {
                        let body;
                        try {
                            body = JSON.parse(text);
                        } catch {
                            throw new ApiError(400, "The request isn't valid JSON.");
                        }
                        SendJson(res, 200, SaveSprite(config, body));
                    })
                    .catch(fail);
            } else {
                // Not passed on to the dev server: its fallback would answer an unknown path with the game's page.
                throw new ApiError(404, `There's nothing at ${route}.`);
            }
        } catch (error) {
            fail(error);
        }
    };
}

module.exports = {
    ApiError,
    MAX_FRAMES,
    MAX_SIZE,
    DEFAULT_SHEET,
    ListBundles,
    DescribeSprite,
    ReadFrame,
    ParseSaveRequest,
    PlanSave,
    ApplySave,
    SaveSprite,
    RefuseRequest,
    CreateSpriteApi
};
