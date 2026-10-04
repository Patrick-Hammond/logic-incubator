"use strict";

/**
 * Turns one bundle folder's file list into a model of the assets it defines: atlas sheets, and
 * every sprite, animation, image, sound, data file, binary and font with its id. Pure - the
 * files arrive as `{ rel, bytes }` (posix paths relative to the bundle) and the few it needs to
 * read (JSON, `.fnt`) through `readText(rel)` - so each rule tests without a disk.
 *
 * Kind comes from the extension, apart from `sprites/`: a folder there is one atlas sheet whose
 * PNGs are its frames, and a `<sheet>.json` + `<sheet>.png` pair is an already-packed atlas.
 * Other folders (images/, sounds/ ...) are for the artist's own organisation and don't change
 * an id - which is why two files with the same base name are an error, not a silent overwrite.
 */

const { DEFAULT_ANIM_PATTERN, CompareKeys, GroupFrames, IsValidBundleName, IsValidLocalName, KindOfExtension, MakeId, NormalizeLocalName, Suggest } = require("./ids");
const { ParseFnt } = require("./fnt");
const { DEFAULT_ATLAS_OPTIONS } = require("./atlas");

const TIERS = ["boot", "background", "lazy"];
const BUNDLE_KEYS = ["dependsOn", "preload", "ignore", "overrides", "animPattern", "atlas", "assets"];
const ATLAS_KEYS = ["maxSize", "padding", "extrude", "trim", "alphaThreshold", "pot", "scaleMode", "sheets"];
/** Source files and tool droppings that are never assets - skipped without a warning. */
const BUILT_IN_IGNORE = ["*.sbx", "*.psd", "*.ase", "*.aseprite", "*.kra", "*.xcf", "*.md", "*.txt", "Thumbs.db", ".DS_Store", ".gitkeep"];
const DEFAULT_SOUND_FORMATS = ["ogg", "m4a", "mp3", "wav"];

/** A gitignore-ish glob as a RegExp over a posix relative path. Without a "/" it matches the file name at any depth. */
function GlobToRegExp(glob) {
    const anywhere = glob.indexOf("/") < 0;
    let source = "";
    for (let i = 0; i < glob.length; i++) {
        const c = glob[i];
        if (c === "*") {
            if (glob[i + 1] === "*") {
                i++;
                if (glob[i + 1] === "/") {
                    i++;
                    source += "(?:.*/)?";
                } else {
                    source += ".*";
                }
            } else {
                source += "[^/]*";
            }
        } else if (c === "?") {
            source += "[^/]";
        } else {
            source += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
        }
    }
    return new RegExp("^" + (anywhere ? "(?:.*/)?" : "") + source + "$");
}

function ExtensionOf(rel) {
    const base = rel.slice(rel.lastIndexOf("/") + 1);
    const dot = base.lastIndexOf(".");
    return dot < 0 ? "" : base.slice(dot + 1).toLowerCase();
}

function BaseNameOf(rel) {
    const base = rel.slice(rel.lastIndexOf("/") + 1);
    const dot = base.lastIndexOf(".");
    return dot < 0 ? base : base.slice(0, dot);
}

function JoinPosix(dir, file) {
    const parts = (dir ? dir.split("/") : []).concat(file.split("/"));
    const out = [];
    parts.forEach(p => {
        if (p === "..") {
            out.pop();
        } else if (p !== "." && p !== "") {
            out.push(p);
        }
    });
    return out.join("/");
}

/** The bundle's atlas options: the defaults plus its overrides, without the per-sheet table. */
function AtlasOptionsOf(atlas) {
    const options = Object.assign({}, DEFAULT_ATLAS_OPTIONS, atlas);
    delete options.sheets;
    return options;
}

/** Checks a bundle.json's shape, reporting problems to `diag`, and fills in defaults. */
function NormalizeBundleConfig(name, raw, diag) {
    const config = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    Object.keys(config).forEach(key => {
        if (BUNDLE_KEYS.indexOf(key) < 0) {
            const hint = Suggest(key, BUNDLE_KEYS);
            diag("error", `bundle.json: unknown key "${key}"${hint ? ` - did you mean "${hint}"?` : ""}`, "bundle.json");
        }
    });
    const atlas = Object.assign({}, config.atlas);
    Object.keys(atlas).forEach(key => {
        if (ATLAS_KEYS.indexOf(key) < 0) {
            const hint = Suggest(key, ATLAS_KEYS);
            diag("error", `bundle.json: unknown atlas key "${key}"${hint ? ` - did you mean "${hint}"?` : ""}`, "bundle.json");
        }
    });
    const preload = config.preload === undefined ? (name === "global" ? "boot" : "manual") : config.preload;
    if (preload !== "boot" && preload !== "manual") {
        diag("error", `bundle.json: "preload" must be "boot" or "manual", not ${JSON.stringify(preload)}`, "bundle.json");
    }
    const list = (value, key) => {
        if (value === undefined) {
            return [];
        }
        if (!Array.isArray(value) || value.some(v => typeof v !== "string")) {
            diag("error", `bundle.json: "${key}" must be a list of strings`, "bundle.json");
            return [];
        }
        return value.slice();
    };
    return {
        dependsOn: list(config.dependsOn, "dependsOn"),
        preload,
        ignore: list(config.ignore, "ignore"),
        overrides: list(config.overrides, "overrides"),
        animPattern: typeof config.animPattern === "string" ? config.animPattern : DEFAULT_ANIM_PATTERN,
        atlas,
        assets: config.assets && typeof config.assets === "object" ? config.assets : {}
    };
}

/**
 * @param {object} args
 * @param {string} args.name the bundle's folder name
 * @param {{ rel: string, bytes: number }[]} args.files every file in the bundle, posix paths relative to it
 * @param {object | null} args.config the parsed bundle.json, if there is one
 * @param {(rel: string) => string} args.readText
 * @param {string[]} [args.soundFormats] accepted sound extensions, most preferred first
 */
function ClassifyBundle(args) {
    const { name, files, readText } = args;
    const soundFormats = args.soundFormats || DEFAULT_SOUND_FORMATS;
    const diagnostics = [];
    const diag = (level, message, file) => diagnostics.push({ level, bundle: name, file, message });

    if (!IsValidBundleName(name)) {
        diag("error", `"${name}" isn't a valid bundle name - use lowercase letters, digits and "_", starting with a letter.`);
    }
    const config = NormalizeBundleConfig(name, args.config, diag);
    const ignored = BUILT_IN_IGNORE.concat(config.ignore).map(GlobToRegExp);
    const fileSet = new Set(files.map(f => f.rel));
    const bytesOf = new Map(files.map(f => [f.rel, f.bytes]));

    const sheets = new Map();
    const loose = [];
    const owned = new Set();
    const fonts = [];

    const sheet = sheetName => {
        if (!sheets.has(sheetName)) {
            sheets.set(sheetName, { name: sheetName, frames: [], prepacked: null });
        }
        return sheets.get(sheetName);
    };

    // Fonts first: their page images belong to them, not to the images below.
    files.forEach(f => {
        if (ExtensionOf(f.rel) === "fnt" && !ignored.some(re => re.test(f.rel))) {
            const parsed = ParseFnt(readText(f.rel));
            const dir = f.rel.indexOf("/") < 0 ? "" : f.rel.slice(0, f.rel.lastIndexOf("/"));
            const pages = parsed.pages.map(file => ({ file, rel: JoinPosix(dir, file) }));
            pages.forEach(p => {
                if (fileSet.has(p.rel)) {
                    owned.add(p.rel);
                } else {
                    diag("error", `font "${f.rel}" needs the page image "${p.file}", which isn't there.`, f.rel);
                }
            });
            if (!parsed.face) {
                diag("error", `font "${f.rel}" has no <info face="..."> - pixi names a bitmap font by it.`, f.rel);
            }
            fonts.push({ rel: f.rel, face: parsed.face, pages });
        }
    });

    files.forEach(f => {
        const rel = f.rel;
        if (rel === "bundle.json" || owned.has(rel) || ignored.some(re => re.test(rel))) {
            return;
        }
        const ext = ExtensionOf(rel);
        const segs = rel.split("/");

        if (segs[0] === "sprites") {
            if (segs.length >= 3 && ext === "png") {
                const local = NormalizeLocalName(BaseNameOf(rel));
                if (!IsValidLocalName(local)) {
                    diag("error", `frame name "${BaseNameOf(rel)}" can only use letters, digits, "_", "-" and spaces.`, rel);
                    return;
                }
                sheet(NormalizeLocalName(segs[1])).frames.push({ local, rel });
                return;
            }
            if (segs.length === 2 && (ext === "json" || ext === "png")) {
                const base = BaseNameOf(rel);
                const partner = "sprites/" + base + (ext === "json" ? ".png" : ".json");
                if (fileSet.has(partner)) {
                    // The pair is one packed sheet: the .json creates it, the .png is just its image.
                    if (ext === "json") {
                        sheet(NormalizeLocalName(base)).prepacked = { json: rel, png: "sprites/" + base + ".png" };
                    }
                    return;
                }
            }
            diag("warning", `"${rel}" isn't copied: sprite frames go in a folder per sheet (sprites/<sheet>/<frame>.png), or a packed sheet as <sheet>.json + <sheet>.png.`, rel);
            return;
        }

        const kind = KindOfExtension(ext);
        if (!kind || kind === "font" || (kind === "sound" && soundFormats.indexOf(ext) < 0)) {
            if (kind !== "font") {
                diag("warning", `"${rel}" isn't copied: the pipeline doesn't know what a ".${ext}" file is.`, rel);
            }
            return;
        }
        loose.push({ rel, ext, kind, local: NormalizeLocalName(BaseNameOf(rel)) });
    });

    // Prepacked sheets: their frame names come from the JSON, minus any extension.
    sheets.forEach(s => {
        if (!s.prepacked) {
            return;
        }
        let parsed;
        try {
            parsed = JSON.parse(readText(s.prepacked.json));
        } catch (error) {
            diag("error", `"${s.prepacked.json}" isn't valid JSON: ${error.message}`, s.prepacked.json);
            return;
        }
        if (!parsed.frames || Array.isArray(parsed.frames) || typeof parsed.frames !== "object") {
            diag("error", `"${s.prepacked.json}" has no "frames" map - it must be a pixi / TexturePacker JSON (hash) sheet.`, s.prepacked.json);
            return;
        }
        s.prepacked.frames = Object.keys(parsed.frames).sort(CompareKeys).map(raw => ({ raw, local: NormalizeLocalName(raw.replace(/\.[A-Za-z0-9]+$/, "")) }));
        s.prepacked.frames.forEach(fr => {
            if (!IsValidLocalName(fr.local)) {
                diag("error", `frame name "${fr.raw}" in "${s.prepacked.json}" can only use letters, digits, "_", "-" and spaces.`, s.prepacked.json);
            }
        });
        if (s.frames.length) {
            diag("error", `sheet "${s.name}" is both a folder of frames and a packed ${s.prepacked.json}.`);
        }
    });

    // Frames: one namespace per bundle - each becomes a TextureCache key "<bundle>.<frame>".
    const frameOwners = new Map();
    const sheetList = Array.from(sheets.values()).sort((a, b) => CompareKeys(a.name, b.name));
    sheetList.forEach(s => {
        s.frames.sort((a, b) => CompareKeys(a.rel, b.rel));
        const members = s.prepacked && s.prepacked.frames ? s.prepacked.frames.map(fr => ({ local: fr.local, rel: s.prepacked.json })) : s.frames;
        members.forEach(fr => {
            if (frameOwners.has(fr.local)) {
                diag("error", `frame "${fr.local}" is defined twice: ${frameOwners.get(fr.local)} and ${fr.rel}. Frame names must be unique within a bundle.`, fr.rel);
            } else {
                frameOwners.set(fr.local, fr.rel);
            }
        });
    });

    const grouped = GroupFrames(Array.from(frameOwners.keys()), config.animPattern);
    grouped.diagnostics.forEach(d => diag(d.level, d.message));

    const assets = [];
    const byLocal = new Map();
    const add = (asset, where) => {
        if (byLocal.has(asset.local)) {
            const other = byLocal.get(asset.local);
            diag("error", `"${MakeId(name, asset.local)}" is defined twice: ${other.where} (${other.kind}) and ${where} (${asset.kind}). Rename one - ids are the base name without the extension.`, where);
            return;
        }
        byLocal.set(asset.local, { kind: asset.kind, where });
        assets.push(Object.assign({ id: MakeId(name, asset.local), tier: "boot" }, asset));
    };

    grouped.sprites.forEach(s => add({ local: s.name, kind: "sprite", frames: s.frames }, `sprite "${s.name}"`));
    grouped.animations.forEach(a => add({ local: a.name, kind: "animation", frames: a.frames }, `animation "${a.name}"`));

    const sounds = new Map();
    loose.forEach(f => {
        if (!IsValidLocalName(f.local)) {
            diag("error", `"${f.rel}": file names can only use letters, digits, "_", "-" and spaces.`, f.rel);
            return;
        }
        if (f.kind === "sound") {
            if (!sounds.has(f.local)) {
                sounds.set(f.local, []);
            }
            sounds.get(f.local).push(f);
            return;
        }
        add({ local: f.local, kind: f.kind, files: [{ rel: f.rel, ext: f.ext }] }, f.rel);
    });
    sounds.forEach((encodings, local) => {
        encodings.sort((a, b) => soundFormats.indexOf(a.ext) - soundFormats.indexOf(b.ext));
        const dupExt = encodings.find((e, i) => i > 0 && e.ext === encodings[i - 1].ext);
        if (dupExt) {
            diag("error", `two sounds named "${local}" in .${dupExt.ext}: ${encodings.filter(e => e.ext === dupExt.ext).map(e => e.rel).join(" and ")}.`, dupExt.rel);
            return;
        }
        add({ local, kind: "sound", files: encodings.map(e => ({ rel: e.rel, ext: e.ext })) }, encodings[0].rel);
    });
    fonts.forEach(font => {
        const local = NormalizeLocalName(BaseNameOf(font.rel));
        if (!IsValidLocalName(local)) {
            diag("error", `"${font.rel}": file names can only use letters, digits, "_", "-" and spaces.`, font.rel);
            return;
        }
        add({ local, kind: "font", files: [{ rel: font.rel, ext: "fnt" }], face: font.face, pages: font.pages }, font.rel);
    });

    // An image whose id is also a frame key would overwrite (or be overwritten in) pixi's TextureCache.
    assets.filter(a => a.kind === "image" && frameOwners.has(a.local)).forEach(a => {
        diag("error", `image "${a.id}" has the same name as a frame of the sprite sheets (${frameOwners.get(a.local)}) - both are texture ids.`, a.files[0].rel);
    });

    // Per-asset settings: tiers.
    Object.keys(config.assets).forEach(local => {
        const asset = assets.find(a => a.local === local);
        const settings = config.assets[local] || {};
        if (!asset) {
            const hint = Suggest(local, assets.map(a => a.local));
            diag("error", `bundle.json: "assets.${local}" doesn't match any asset${hint ? ` - did you mean "${hint}"?` : ""}`, "bundle.json");
            return;
        }
        if (settings.tier !== undefined) {
            if (TIERS.indexOf(settings.tier) < 0) {
                diag("error", `bundle.json: "assets.${local}.tier" must be one of ${TIERS.join(", ")}.`, "bundle.json");
            } else if (asset.kind === "sprite" || asset.kind === "animation") {
                diag("error", `bundle.json: "assets.${local}" is a ${asset.kind} - sprites load with their bundle, they have no tier.`, "bundle.json");
            } else {
                asset.tier = settings.tier;
            }
        }
    });

    assets.forEach(a => {
        a.bytes = (a.files || []).reduce((sum, f) => sum + (bytesOf.get(f.rel) || 0), 0);
    });
    assets.sort((a, b) => CompareKeys(a.id, b.id));

    return {
        name,
        preload: config.preload,
        dependsOn: config.dependsOn,
        overrides: config.overrides,
        animPattern: config.animPattern,
        atlasOptions: AtlasOptionsOf(config.atlas),
        sheetOptions: config.atlas.sheets || {},
        sheets: sheetList,
        assets,
        frameLocals: Array.from(frameOwners.keys()).sort(CompareKeys),
        diagnostics
    };
}

module.exports = { TIERS, DEFAULT_SOUND_FORMATS, GlobToRegExp, ClassifyBundle, JoinPosix };
