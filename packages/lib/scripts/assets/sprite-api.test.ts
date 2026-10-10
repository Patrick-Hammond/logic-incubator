import * as fs from "fs";
import * as http from "http";
import * as os from "os";
import * as path from "path";
import { AddressInfo } from "net";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EncodeIndexedPng } from "@logic-incubator/editor/sprite/Png";

const require = createRequire(import.meta.url);
const { BuildAssets } = require("./build.js");
const { LoadConfig } = require("./config.js");
const { NewImage } = require("./image.js");
const { WritePng } = require("./png.js");
const api = require("./sprite-api.js");
const AssetsWebpackPlugin = require("./webpack-plugin.js");

const META_PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../engine/scripts/asset-meta-plugin.js");

let dir: string;
const abs = (rel: string) => path.join(dir, rel);
const exists = (rel: string) => fs.existsSync(abs(rel));

/** A frame PNG: w*h with an opaque box, so each shade is a different picture. */
function png(w: number, h: number, shade: number): Buffer {
    const img = NewImage(w, h);
    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
            img.data.set([shade, 0, 0, 255], (y * w + x) * 4);
        }
    }
    return WritePng(img);
}

function write(rel: string, data: string | Buffer): void {
    const file = abs(rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, data);
}

const config = () => LoadConfig(abs("assets.config.json"));
const b64 = (...buffers: Buffer[]) => buffers.map(b => b.toString("base64"));
const save = (body: object) => api.SaveSprite(config(), body);
const failure = (fn: () => unknown): { status: number; message: string; details?: string[] } => {
    try {
        fn();
    } catch (error) {
        return { status: (error as { status: number }).status, message: (error as Error).message, details: (error as { details?: string[] }).details };
    }
    throw new Error("expected it to throw");
};
/** Every file under the assets folders, as relative posix paths - to check that a refused save wrote nothing. */
function snapshot(): string[] {
    const out: string[] = [];
    const walk = (d: string, prefix: string) => {
        fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
            const rel = prefix ? prefix + "/" + e.name : e.name;
            if (e.isDirectory()) {
                walk(path.join(d, e.name), rel);
            } else {
                out.push(rel + ":" + fs.statSync(path.join(d, e.name)).size);
            }
        });
    };
    ["assets", "editor"].forEach(root => walk(abs(root), root));
    return out.sort();
}
const meta = () => JSON.parse(fs.readFileSync(abs("assets/global/data/assets-meta.json"), "utf8"));

beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "sprite-api-"));
    write("assets.config.json", JSON.stringify({ roots: ["assets", { dir: "editor", devOnly: true }], out: ".assets", dts: "gen/assets.d.ts", plugins: [META_PLUGIN] }));
    write("assets/global/sprites/dungeon/bomb_f0.png", png(16, 16, 10));
    write("assets/global/sprites/dungeon/bomb_f1.png", png(16, 16, 20));
    write("assets/global/sprites/dungeon/crate.png", png(16, 16, 30));
    write("assets/global/images/title.png", png(8, 8, 40));
    write("assets/global/sounds/click.ogg", "ogg-bytes");
    write("assets/global/data/assets-meta.json", JSON.stringify({ bomb: {}, crate: { category: "items", collidable: true } }, null, "\t") + "\n");
    write("assets/level1/bundle.json", JSON.stringify({ dependsOn: ["global"] }));
    write("assets/level1/data/level.json", JSON.stringify({ tiles: [] }));
    write("assets/packed/sprites/atlas.json", JSON.stringify({ frames: { "pk_a.png": { frame: { x: 0, y: 0, w: 4, h: 4 } }, "pk_b.png": { frame: { x: 4, y: 0, w: 4, h: 4 } } }, meta: { image: "atlas.png" } }));
    write("assets/packed/sprites/atlas.png", png(8, 4, 50));
    write("editor/editor/sprites/ui/square.png", png(8, 8, 60));
});

afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
});

describe("ListBundles", () => {
    it("lists the editable bundles with their sheets and every asset name, leaving out the editor's own", () => {
        const { bundles } = api.ListBundles(config());
        expect(bundles.map((b: { name: string }) => b.name)).toEqual(["global", "level1", "packed"]);
        const global = bundles[0];
        expect(global.sheets).toEqual(["dungeon"]);
        expect(global.packedSheets).toEqual([]);
        expect(global.names).toEqual(["assets_meta", "bomb", "click", "crate", "title"]);
        expect(bundles[2].sheets).toEqual([]);
        expect(bundles[2].packedSheets).toEqual(["atlas"]);
    });
});

describe("DescribeSprite", () => {
    it("says where a sprite and an animation are", () => {
        expect(api.DescribeSprite(config(), "global", "crate")).toEqual({ bundle: "global", name: "crate", kind: "sprite", frames: 1, sheet: "dungeon", dir: "sprites/dungeon", editable: true, reason: null });
        expect(api.DescribeSprite(config(), "global", "bomb")).toMatchObject({ kind: "animation", frames: 2, editable: true });
    });

    it("says a sprite in a pre-packed sheet can't be edited, and why", () => {
        const info = api.DescribeSprite(config(), "packed", "pk_a");
        expect(info.editable).toBe(false);
        expect(info.reason).toMatch(/pre-packed/);
        expect(info.dir).toBeNull();
    });

    it("says the editor's own assets can't be edited", () => {
        const info = api.DescribeSprite(config(), "editor", "square");
        expect(info.editable).toBe(false);
        expect(info.reason).toMatch(/editor's own/);
    });

    it("404s for a bundle or sprite that isn't there, including names that aren't sprites", () => {
        expect(failure(() => api.DescribeSprite(config(), "nope", "crate")).status).toBe(404);
        expect(failure(() => api.DescribeSprite(config(), "global", "nope")).status).toBe(404);
        expect(failure(() => api.DescribeSprite(config(), "global", "title")).status).toBe(404);
        expect(failure(() => api.DescribeSprite(config(), undefined, undefined)).status).toBe(404);
    });
});

describe("ReadFrame", () => {
    it("returns the source PNG of each frame", () => {
        expect(api.ReadFrame(config(), "global", "bomb", 0).equals(fs.readFileSync(abs("assets/global/sprites/dungeon/bomb_f0.png")))).toBe(true);
        expect(api.ReadFrame(config(), "global", "bomb", 1).equals(fs.readFileSync(abs("assets/global/sprites/dungeon/bomb_f1.png")))).toBe(true);
        expect(api.ReadFrame(config(), "global", "crate", 0).equals(fs.readFileSync(abs("assets/global/sprites/dungeon/crate.png")))).toBe(true);
    });

    it("refuses a frame that isn't there, a packed sprite and the editor's bundle", () => {
        expect(failure(() => api.ReadFrame(config(), "global", "bomb", 2)).status).toBe(404);
        expect(failure(() => api.ReadFrame(config(), "global", "bomb", -1)).status).toBe(404);
        expect(failure(() => api.ReadFrame(config(), "global", "bomb", 0.5)).status).toBe(404);
        expect(failure(() => api.ReadFrame(config(), "global", "bomb", NaN)).status).toBe(404);
        expect(failure(() => api.ReadFrame(config(), "packed", "pk_a", 0)).status).toBe(422);
        expect(failure(() => api.ReadFrame(config(), "editor", "square", 0)).status).toBe(403);
    });
});

describe("ParseSaveRequest", () => {
    const good = () => ({ bundle: "global", name: "thing", mode: "create", frames: b64(png(4, 4, 1)) });

    it("accepts a good request, defaulting the sheet to user", () => {
        const request = api.ParseSaveRequest(good());
        expect(request).toMatchObject({ bundle: "global", name: "thing", mode: "create", sheet: "user", width: 4, height: 4 });
        expect(request.frames[0]).toBeInstanceOf(Buffer);
        expect(api.ParseSaveRequest({ ...good(), sheet: "walls", category: "items", copyMetaFrom: "crate" })).toMatchObject({ sheet: "walls", category: "items", copyMetaFrom: "crate" });
    });

    it("refuses what it can't make sense of, each with a 400 and the reason", () => {
        const cases: Array<[object | null, RegExp]> = [
            [null, /no body/],
            [{ ...good(), bundle: "" }, /which bundle/],
            [{ ...good(), name: "Bad Name" }, /lowercase/],
            [{ ...good(), name: "run_f2" }, /can't end in "_f"/],
            [{ ...good(), name: "a".repeat(49) }, /up to 48/],
            [{ ...good(), mode: "append" }, /mode is/],
            [{ ...good(), frames: [] }, /at least one frame/],
            [{ ...good(), frames: "x" }, /at least one frame/],
            [{ ...good(), frames: Array(api.MAX_FRAMES + 1).fill(b64(png(2, 2, 1))[0]) }, /most is 100/],
            [{ ...good(), frames: [""] }, /Frame 0 is empty/],
            [{ ...good(), frames: [123] }, /Frame 0 is empty/],
            [{ ...good(), frames: [Buffer.from("not a png").toString("base64")] }, /isn't a valid PNG/],
            [{ ...good(), frames: b64(png(4, 4, 1), png(5, 4, 1)) }, /Frame 1 is 5x4 but frame 0 is 4x4/],
            [{ ...good(), frames: b64(png(513, 2, 1)) }, /between 1x1 and 512x512/],
            [{ ...good(), sheet: 5 }, /sheet name/]
        ];
        cases.forEach(([body, pattern]) => {
            const error = failure(() => api.ParseSaveRequest(body));
            expect(error.status, String(pattern)).toBe(400);
            expect(error.message).toMatch(pattern);
        });
    });
});

describe("saving a new sprite", () => {
    it("writes sprites/<sheet>/<name>.png, building cleanly and adding it to the manifest", () => {
        const before = snapshot();
        const result = save({ bundle: "global", name: "gem", mode: "create", sheet: "user", frames: b64(png(16, 16, 77)) });
        expect(result).toMatchObject({ ok: true, bundle: "global", name: "gem", kind: "sprite", frames: 1, width: 16, height: 16, written: ["sprites/user/gem.png"], removed: [], changed: true });
        expect(fs.readFileSync(abs("assets/global/sprites/user/gem.png")).equals(png(16, 16, 77))).toBe(true);
        expect(snapshot().length).toBe(before.length + 1); // gem.png (assets-meta.json grew, but it was already there)

        const build = BuildAssets({ configPath: abs("assets.config.json") });
        expect(build.diagnostics.filter((d: { level: string }) => d.level === "error")).toEqual([]);
        expect(build.manifest.bundles.global.assets["global.gem"]).toEqual({ kind: "sprite", frames: ["global.gem"] });
    });

    it("writes numbered frames for an animation", () => {
        const result = save({ bundle: "global", name: "flame", mode: "create", sheet: "fx", frames: b64(png(8, 8, 1), png(8, 8, 2), png(8, 8, 3)) });
        expect(result.kind).toBe("animation");
        expect(result.written).toEqual(["sprites/fx/flame_f0.png", "sprites/fx/flame_f1.png", "sprites/fx/flame_f2.png"]);
        const build = BuildAssets({ configPath: abs("assets.config.json") });
        expect(build.ok).toBe(true);
        expect(build.manifest.bundles.global.assets["global.flame"].frames).toEqual(["global.flame_f0", "global.flame_f1", "global.flame_f2"]);
    });

    it("puts it in an existing sheet's own folder, whatever that folder's spelling", () => {
        write("assets/global/sprites/My Sheet/old.png", png(8, 8, 5));
        const result = save({ bundle: "global", name: "fresh", mode: "create", sheet: "my_sheet", frames: b64(png(8, 8, 1)) });
        expect(result.written).toEqual(["sprites/My Sheet/fresh.png"]);
        expect(BuildAssets({ configPath: abs("assets.config.json") }).ok).toBe(true);
    });

    it("refuses a name that's taken by any kind of asset, writing nothing", () => {
        const before = snapshot();
        ["crate", "bomb", "title", "click", "assets_meta"].forEach(name => {
            const error = failure(() => save({ bundle: "global", name, mode: "create", frames: b64(png(8, 8, 1)) }));
            expect(error.status, name).toBe(409);
            expect(error.message).toContain(`global.${name}`);
        });
        expect(snapshot()).toEqual(before);
    });

    it("allows a name another bundle has, since names are per bundle", () => {
        const result = save({ bundle: "level1", name: "crate", mode: "create", frames: b64(png(8, 8, 1)) });
        expect(result.written).toEqual(["sprites/user/crate.png"]);
    });

    it("refuses a bad sheet name and a pre-packed sheet", () => {
        expect(failure(() => save({ bundle: "global", name: "x", mode: "create", sheet: "../escape", frames: b64(png(8, 8, 1)) })).status).toBe(400);
        expect(failure(() => save({ bundle: "global", name: "x", mode: "create", sheet: "a/b", frames: b64(png(8, 8, 1)) })).status).toBe(400);
        expect(failure(() => save({ bundle: "global", name: "x", mode: "create", sheet: "x".repeat(33), frames: b64(png(8, 8, 1)) })).status).toBe(400);
        expect(failure(() => save({ bundle: "packed", name: "x", mode: "create", sheet: "atlas", frames: b64(png(8, 8, 1)) })).status).toBe(422);
        expect(snapshot().some(f => f.indexOf("escape") >= 0)).toBe(false);
    });

    it("refuses an unknown bundle (404) and the editor's own (403), writing nothing", () => {
        const before = snapshot();
        expect(failure(() => save({ bundle: "nope", name: "x", mode: "create", frames: b64(png(8, 8, 1)) })).status).toBe(404);
        expect(failure(() => save({ bundle: "editor", name: "x", mode: "create", frames: b64(png(8, 8, 1)) })).status).toBe(403);
        expect(snapshot()).toEqual(before);
    });

    it("stops a save that would leave the bundle with a new error, and says what", () => {
        // bundle.json gives the name a tier, which is an error for a sprite - the build would fail on it.
        write("assets/global/bundle.json", JSON.stringify({ assets: { gem: { tier: "lazy" } } }));
        // The bundle already fails: "gem" doesn't match any asset yet.
        const before = snapshot();
        const error = failure(() => save({ bundle: "global", name: "gem", mode: "create", frames: b64(png(8, 8, 1)) }));
        expect(error.status).toBe(422);
        expect(error.message).toMatch(/nothing was saved/);
        expect(error.message).toMatch(/no tier/);
        expect(error.details).toHaveLength(1);
        expect(snapshot()).toEqual(before);
    });

    it("leaves no temporary files behind", () => {
        save({ bundle: "global", name: "gem", mode: "create", frames: b64(png(8, 8, 1)) });
        expect(snapshot().filter(f => /saving/.test(f))).toEqual([]);
    });
});

describe("saving over an existing sprite", () => {
    it("replaces the frames in place, and says nothing changed if they're identical", () => {
        const same = save({ bundle: "global", name: "bomb", mode: "overwrite", frames: b64(fs.readFileSync(abs("assets/global/sprites/dungeon/bomb_f0.png")), fs.readFileSync(abs("assets/global/sprites/dungeon/bomb_f1.png"))) });
        expect(same).toMatchObject({ written: [], removed: [], changed: false });

        const result = save({ bundle: "global", name: "bomb", mode: "overwrite", frames: b64(png(16, 16, 99), png(16, 16, 98)) });
        expect(result.written).toEqual(["sprites/dungeon/bomb_f0.png", "sprites/dungeon/bomb_f1.png"]);
        expect(result.changed).toBe(true);
        expect(fs.readFileSync(abs("assets/global/sprites/dungeon/bomb_f0.png")).equals(png(16, 16, 99))).toBe(true);
    });

    it("writes only the frames that differ", () => {
        const result = save({ bundle: "global", name: "bomb", mode: "overwrite", frames: b64(fs.readFileSync(abs("assets/global/sprites/dungeon/bomb_f0.png")), png(16, 16, 98)) });
        expect(result.written).toEqual(["sprites/dungeon/bomb_f1.png"]);
    });

    it("adds frames to an animation", () => {
        const result = save({ bundle: "global", name: "bomb", mode: "overwrite", frames: b64(png(16, 16, 1), png(16, 16, 2), png(16, 16, 3), png(16, 16, 4)) });
        expect(result.kind).toBe("animation");
        expect(exists("assets/global/sprites/dungeon/bomb_f3.png")).toBe(true);
        expect(BuildAssets({ configPath: abs("assets.config.json") }).manifest.bundles.global.assets["global.bomb"].frames).toHaveLength(4);
    });

    it("removes the frames an animation no longer has", () => {
        write("assets/global/sprites/dungeon/bomb_f2.png", png(16, 16, 30));
        const result = save({ bundle: "global", name: "bomb", mode: "overwrite", frames: b64(png(16, 16, 1), png(16, 16, 2)) });
        expect(result.removed).toEqual(["sprites/dungeon/bomb_f2.png"]);
        expect(exists("assets/global/sprites/dungeon/bomb_f2.png")).toBe(false);
        expect(BuildAssets({ configPath: abs("assets.config.json") }).ok).toBe(true);
    });

    it("turns a one-frame sprite into an animation, and back", () => {
        const toAnim = save({ bundle: "global", name: "crate", mode: "overwrite", frames: b64(png(16, 16, 1), png(16, 16, 2)) });
        expect(toAnim.kind).toBe("animation");
        expect(toAnim.removed).toEqual(["sprites/dungeon/crate.png"]);
        expect(exists("assets/global/sprites/dungeon/crate.png")).toBe(false);
        expect(exists("assets/global/sprites/dungeon/crate_f1.png")).toBe(true);
        expect(BuildAssets({ configPath: abs("assets.config.json") }).ok).toBe(true);

        const toSprite = save({ bundle: "global", name: "crate", mode: "overwrite", frames: b64(png(16, 16, 3)) });
        expect(toSprite.kind).toBe("sprite");
        expect(toSprite.removed).toEqual(["sprites/dungeon/crate_f0.png", "sprites/dungeon/crate_f1.png"]);
        expect(exists("assets/global/sprites/dungeon/crate.png")).toBe(true);
        expect(BuildAssets({ configPath: abs("assets.config.json") }).manifest.bundles.global.assets["global.crate"].kind).toBe("sprite");
    });

    it("replaces a lone _f0 with the plain name", () => {
        write("assets/global/sprites/dungeon/hit_f0.png", png(16, 16, 5));
        const result = save({ bundle: "global", name: "hit", mode: "overwrite", frames: b64(png(16, 16, 6)) });
        expect(result.written).toEqual(["sprites/dungeon/hit.png"]);
        expect(result.removed).toEqual(["sprites/dungeon/hit_f0.png"]);
    });

    it("can change the size", () => {
        const result = save({ bundle: "global", name: "crate", mode: "overwrite", frames: b64(png(32, 24, 1)) });
        expect(result).toMatchObject({ width: 32, height: 24, changed: true });
        expect(BuildAssets({ configPath: abs("assets.config.json") }).ok).toBe(true);
    });

    it("refuses a sprite that isn't there (404) or is in a packed sheet (422)", () => {
        const before = snapshot();
        expect(failure(() => save({ bundle: "global", name: "nope", mode: "overwrite", frames: b64(png(8, 8, 1)) })).status).toBe(404);
        expect(failure(() => save({ bundle: "global", name: "title", mode: "overwrite", frames: b64(png(8, 8, 1)) })).status).toBe(404);
        expect(failure(() => save({ bundle: "packed", name: "pk_a", mode: "overwrite", frames: b64(png(8, 8, 1)) })).status).toBe(422);
        expect(snapshot()).toEqual(before);
    });
});

describe("keeping assets-meta.json in step", () => {
    it("adds a new sprite's entry with the category it was made under", () => {
        const result = save({ bundle: "global", name: "gem", mode: "create", category: "items", frames: b64(png(8, 8, 1)) });
        expect(result.notes).toEqual([]);
        expect(meta().gem).toEqual({ category: "items" });
        expect(Object.keys(meta())).toEqual(["bomb", "crate", "gem"]);
        expect(meta().crate).toEqual({ category: "items", collidable: true });
    });

    it("copies another sprite's entry for a 'save as', letting the chosen category win", () => {
        save({ bundle: "global", name: "crate2", mode: "create", copyMetaFrom: "crate", frames: b64(png(16, 16, 1)) });
        expect(meta().crate2).toEqual({ category: "items", collidable: true });
        save({ bundle: "global", name: "crate3", mode: "create", copyMetaFrom: "crate", category: "user", frames: b64(png(16, 16, 1)) });
        expect(meta().crate3).toEqual({ category: "user", collidable: true });
        expect(meta().crate).toEqual({ category: "items", collidable: true });
    });

    it("leaves the entry alone when overwriting, and gives a new sprite no entry if nothing was asked", () => {
        save({ bundle: "global", name: "crate", mode: "overwrite", category: "weapons", frames: b64(png(16, 16, 9)) });
        expect(meta().crate).toEqual({ category: "items", collidable: true });
        save({ bundle: "global", name: "plain", mode: "create", frames: b64(png(8, 8, 1)) });
        expect(meta().plain).toEqual({});
    });

    it("warns about a category it doesn't know, and saves the sprite anyway", () => {
        const result = save({ bundle: "global", name: "gem", mode: "create", category: "nonsense", frames: b64(png(8, 8, 1)) });
        expect(result.notes).toHaveLength(1);
        expect(result.notes[0].level).toBe("warning");
        expect(meta().gem).toEqual({});
        expect(exists("assets/global/sprites/user/gem.png")).toBe(true);
    });

    it("doesn't touch a bundle that has no assets-meta.json", () => {
        const result = save({ bundle: "level1", name: "gem", mode: "create", category: "items", frames: b64(png(8, 8, 1)) });
        expect(result.notes).toEqual([]);
        expect(exists("assets/level1/data/assets-meta.json")).toBe(false);
    });

    it("keeps the build in step: a sprite saved with its entry means the next build changes nothing in assets-meta.json", () => {
        save({ bundle: "global", name: "gem", mode: "create", category: "items", frames: b64(png(8, 8, 1)) });
        const before = fs.readFileSync(abs("assets/global/data/assets-meta.json"), "utf8");
        const build = BuildAssets({ configPath: abs("assets.config.json") });
        expect(build.ok).toBe(true);
        expect(fs.readFileSync(abs("assets/global/data/assets-meta.json"), "utf8")).toBe(before);
    });
});

describe("what the editor itself writes", () => {
    it("is accepted by the server and the asset build: an indexed PNG with a palette and alpha", async () => {
        const palette = [
            { r: 0, g: 0, b: 0, a: 0 },
            { r: 255, g: 0, b: 0, a: 255 },
            { r: 0, g: 0, b: 255, a: 128 }
        ];
        const indices = Uint8Array.from([0, 1, 1, 0, 1, 2, 2, 1, 1, 2, 2, 1, 0, 1, 1, 0]);
        const bytes = await EncodeIndexedPng(4, 4, indices, palette);
        const result = save({ bundle: "global", name: "indexed", mode: "create", frames: [Buffer.from(bytes).toString("base64")] });
        expect(result.written).toEqual(["sprites/user/indexed.png"]);
        expect(Buffer.from(bytes).equals(fs.readFileSync(abs("assets/global/sprites/user/indexed.png")))).toBe(true);
        const build = BuildAssets({ configPath: abs("assets.config.json") });
        expect(build.diagnostics.filter((d: { level: string }) => d.level === "error")).toEqual([]);
        expect(api.ReadFrame(config(), "global", "indexed", 0).equals(Buffer.from(bytes))).toBe(true);
    });
});

describe("RefuseRequest", () => {
    const request = (overrides: { address?: string; headers?: { [k: string]: string } } = {}) => ({
        socket: { remoteAddress: overrides.address || "127.0.0.1" },
        headers: { host: "localhost:4202", "x-sprite-editor": "1", ...overrides.headers }
    });

    it("lets through a same-machine request with the header, however it's addressed", () => {
        expect(api.RefuseRequest(request())).toBeNull();
        expect(api.RefuseRequest(request({ address: "::1", headers: { host: "[::1]:4202" } }))).toBeNull();
        expect(api.RefuseRequest(request({ address: "::ffff:127.0.0.1", headers: { host: "127.0.0.1:4202" } }))).toBeNull();
        expect(api.RefuseRequest(request({ headers: { host: "LOCALHOST" } }))).toBeNull();
        expect(api.RefuseRequest(request({ headers: { origin: "http://localhost:4202" } }))).toBeNull();
    });

    it("refuses another machine, another host name, another site and a missing header", () => {
        expect(api.RefuseRequest(request({ address: "192.168.1.20" }))).toMatch(/this machine/);
        expect(api.RefuseRequest(request({ headers: { host: "evil.example:4202" } }))).toMatch(/localhost/);
        expect(api.RefuseRequest(request({ headers: { host: "localhost.evil.example" } }))).toMatch(/localhost/);
        expect(api.RefuseRequest(request({ headers: { host: "" } }))).toMatch(/localhost/);
        expect(api.RefuseRequest(request({ headers: { origin: "http://evil.example" } }))).toMatch(/other sites/);
        expect(api.RefuseRequest(request({ headers: { origin: "http://localhost:9999" } }))).toMatch(/other sites/);
        expect(api.RefuseRequest(request({ headers: { origin: "not a url" } }))).toMatch(/Origin/);
        expect(api.RefuseRequest(request({ headers: { "x-sprite-editor": "" } }))).toMatch(/header/);
        expect(api.RefuseRequest({ socket: {}, headers: { host: "localhost", "x-sprite-editor": "1" } })).toMatch(/this machine/);
    });
});

describe("the http api", () => {
    let server: http.Server;
    let base: string;
    const headers = { "x-sprite-editor": "1" };

    beforeEach(async () => {
        server = http.createServer(api.CreateSpriteApi({ configPath: abs("assets.config.json") }));
        await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
        base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/__sprite-api`;
    });
    afterEach(async () => {
        await new Promise(resolve => server.close(resolve));
    });

    /** A raw request, for the headers fetch won't let a script set. */
    const raw = (pathname: string, requestHeaders: { [k: string]: string }, method = "GET", body?: string) =>
        new Promise<{ status: number; text: string }>((resolve, reject) => {
            const url = new URL(base);
            const req = http.request({ host: "127.0.0.1", port: url.port, path: "/__sprite-api" + pathname, method, headers: requestHeaders }, res => {
                const chunks: Buffer[] = [];
                res.on("data", c => chunks.push(c));
                res.on("end", () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString("utf8") }));
            });
            req.on("error", reject);
            req.end(body);
        });

    it("answers /list, /sprite and /frame", async () => {
        const list = await (await fetch(base + "/list", { headers })).json();
        expect(list.bundles.map((b: { name: string }) => b.name)).toEqual(["global", "level1", "packed"]);

        const sprite = await (await fetch(base + "/sprite?bundle=global&name=bomb", { headers })).json();
        expect(sprite).toMatchObject({ kind: "animation", frames: 2, editable: true });

        const frame = await fetch(base + "/frame?bundle=global&name=bomb&index=1", { headers });
        expect(frame.status).toBe(200);
        expect(frame.headers.get("content-type")).toBe("image/png");
        expect(frame.headers.get("cache-control")).toBe("no-store");
        expect(Buffer.from(await frame.arrayBuffer()).equals(fs.readFileSync(abs("assets/global/sprites/dungeon/bomb_f1.png")))).toBe(true);
    });

    it("saves with POST /save and reports what it wrote", async () => {
        const response = await fetch(base + "/save", { method: "POST", headers, body: JSON.stringify({ bundle: "global", name: "gem", mode: "create", category: "items", frames: b64(png(8, 8, 1)) }) });
        expect(response.status).toBe(200);
        const result = await response.json();
        expect(result).toMatchObject({ ok: true, written: ["sprites/user/gem.png"], changed: true });
        expect(exists("assets/global/sprites/user/gem.png")).toBe(true);
        expect(meta().gem).toEqual({ category: "items" });
    });

    it("answers a refused or failed request with JSON and the right status", async () => {
        const post = (body: string) => fetch(base + "/save", { method: "POST", headers, body });
        const clash = await post(JSON.stringify({ bundle: "global", name: "crate", mode: "create", frames: b64(png(8, 8, 1)) }));
        expect(clash.status).toBe(409);
        expect((await clash.json()).error).toMatch(/already exists/);
        expect((await post("{ not json")).status).toBe(400);
        expect((await fetch(base + "/sprite?bundle=global&name=nope", { headers })).status).toBe(404);
        expect((await fetch(base + "/nothing", { headers })).status).toBe(404);
        expect((await fetch(base + "/list", { method: "POST", headers })).status).toBe(404);
        expect((await fetch(base + "/save", { headers })).status).toBe(404);
    });

    it("refuses requests without the header, with a foreign Host or Origin - and never allows a cross-origin preflight", async () => {
        expect((await fetch(base + "/list")).status).toBe(403);
        expect((await raw("/list", { host: "evil.example", ...headers })).status).toBe(403);
        expect((await raw("/list", { origin: "http://evil.example", ...headers })).status).toBe(403);
        const preflight = await raw("/save", { origin: "http://evil.example", "access-control-request-method": "POST", "access-control-request-headers": "x-sprite-editor" }, "OPTIONS");
        expect(preflight.status).toBe(403);
        const list = await fetch(base + "/list", { headers });
        expect(list.headers.get("access-control-allow-origin")).toBeNull();
        expect(snapshot().filter(f => f.indexOf("gem") >= 0)).toEqual([]);
    });
});

describe("AssetsWebpackPlugin's dev server hook", () => {
    function fakeCompiler(options: object) {
        const taps: string[] = [];
        return {
            taps,
            options,
            hooks: {
                beforeRun: { tapAsync: () => taps.push("beforeRun") },
                watchRun: { tapAsync: () => taps.push("watchRun") },
                afterCompile: { tap: () => taps.push("afterCompile") }
            },
            getInfrastructureLogger: () => ({ warn() {}, error() {}, info() {} })
        };
    }
    const configPath = () => abs("assets.config.json");

    it("mounts the sprite api first on the dev server in development", () => {
        const compiler: any = fakeCompiler({ mode: "development", devServer: { port: 1 } });
        new AssetsWebpackPlugin({ configPath: configPath() }).apply(compiler);
        const existing = { name: "existing", middleware() {} };
        const list = compiler.options.devServer.setupMiddlewares([existing], {});
        expect(list.map((m: { name: string }) => m.name)).toEqual(["sprite-api", "existing"]);
        expect(list[0].path).toBe("/__sprite-api");
        expect(typeof list[0].middleware).toBe("function");
        expect(compiler.options.devServer.port).toBe(1);
    });

    it("runs the game's own setupMiddlewares too, and keeps what it returns", () => {
        const added = { name: "game", middleware() {} };
        const compiler: any = fakeCompiler({ mode: "development", devServer: { setupMiddlewares: (m: unknown[]) => [...m, added] } });
        new AssetsWebpackPlugin({ configPath: configPath() }).apply(compiler);
        const list = compiler.options.devServer.setupMiddlewares([], {});
        expect(list.map((m: { name: string }) => m.name)).toEqual(["sprite-api", "game"]);
    });

    it("creates the devServer options if the game has none", () => {
        const compiler: any = fakeCompiler({ mode: "development" });
        new AssetsWebpackPlugin({ configPath: configPath() }).apply(compiler);
        expect(compiler.options.devServer.setupMiddlewares([], {})).toHaveLength(1);
    });

    it("leaves it out of a production build, and when switched off", () => {
        const production: any = fakeCompiler({ mode: "production", devServer: {} });
        new AssetsWebpackPlugin({ configPath: configPath() }).apply(production);
        expect(production.options.devServer.setupMiddlewares).toBeUndefined();
        const off: any = fakeCompiler({ mode: "development", devServer: {} });
        new AssetsWebpackPlugin({ configPath: configPath(), spriteApi: false }).apply(off);
        expect(off.options.devServer.setupMiddlewares).toBeUndefined();
        const noServer: any = fakeCompiler({ mode: "production" });
        new AssetsWebpackPlugin({ configPath: configPath() }).apply(noServer);
        expect(noServer.options.devServer).toBeUndefined();
    });

    describe("when a file is gone for a moment during a build", () => {
        const ok = { ok: true, diagnostics: [], written: [] };
        const transient = (code: string) => Object.assign(new Error(code + ": gone"), { code, path: "assets/x.json" });
        /** Runs the plugin's watchRun hook with a build that behaves as `outcomes` says (a throw, or a result), one per call. */
        function runWatch(outcomes: Array<Error | typeof ok>, retryDelayMs = 1) {
            const calls: number[] = [];
            const compiler: any = fakeCompiler({ mode: "development" });
            let hook: (c: unknown, cb: (e?: Error) => void) => void = () => undefined;
            compiler.hooks.watchRun.tapAsync = (_name: string, fn: typeof hook) => (hook = fn);
            const build = () => {
                const outcome = outcomes[Math.min(calls.length, outcomes.length - 1)];
                calls.push(1);
                if (outcome instanceof Error) {
                    throw outcome;
                }
                return outcome;
            };
            new AssetsWebpackPlugin({ configPath: configPath(), build, retryDelayMs, spriteApi: false }).apply(compiler);
            return new Promise<{ error?: Error; builds: number }>(resolve => hook(compiler, error => resolve({ error, builds: calls.length })));
        }

        it("tries again, and carries on when the file is back", async () => {
            expect(await runWatch([transient("ENOENT"), ok])).toEqual({ error: undefined, builds: 2 });
            expect(await runWatch([transient("EBUSY"), transient("EPERM"), ok])).toEqual({ error: undefined, builds: 3 });
        });

        it("gives up after a few tries and reports the error", async () => {
            const { error, builds } = await runWatch([transient("ENOENT")]);
            expect(error).toMatchObject({ code: "ENOENT" });
            expect(builds).toBe(4);
        });

        it("doesn't retry an error that isn't about a file going missing", async () => {
            const { error, builds } = await runWatch([new Error("bad config"), ok]);
            expect(error).toMatchObject({ message: "bad config" });
            expect(builds).toBe(1);
        });

        it("fails the compile, as before, when the build has errors", async () => {
            const { error } = await runWatch([{ ok: false, diagnostics: [{ level: "error", message: "boom" }], written: [] } as any]);
            expect(error).toMatchObject({ message: expect.stringContaining("asset build failed") });
        });
    });

    it("still hooks the build the way it did", () => {
        const compiler: any = fakeCompiler({ mode: "development" });
        new AssetsWebpackPlugin({ configPath: configPath() }).apply(compiler);
        expect(compiler.taps).toEqual(["beforeRun", "watchRun", "afterCompile"]);
    });
});
