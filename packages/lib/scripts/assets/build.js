"use strict";

/**
 * The whole pipeline as one function, shared by the CLI (build-assets.js), the webpack plugin and
 * the tests: scan the roots -> classify each bundle -> plugins -> validate -> pack atlases and
 * collect outputs -> write them, the manifest and the id declarations.
 *
 *   BuildAssets({ configPath, production?, check?, clean? }) -> { ok, diagnostics, manifest, dts, written, removed }
 *
 * `check` writes nothing: it runs everything up to validation and fails if the committed
 * declarations (or a plugin's synced file) are out of date. `production` leaves dev-only roots
 * (the editor's) out of the output and the manifest - their ids stay in the declarations, so the
 * committed d.ts is the same whichever way it was generated.
 */

const fs = require("fs");
const path = require("path");
const { AtlasJson, PackAtlas } = require("./atlas");
const { AtlasKey, FileHasher, PruneAtlasCache, ReadAtlasCache, WriteAtlasCache } = require("./cache");
const { ClassifyBundle } = require("./classify");
const { LoadConfig } = require("./config");
const { GenerateDts, IsDtsStale } = require("./dts");
const { CopyIfChanged, RemoveOrphans, WriteIfChanged } = require("./emit");
const { ParseFnt, RewritePages } = require("./fnt");
const { CompareKeys } = require("./ids");
const { Hash, StableStringify } = require("./manifest");
const { ReadPng, WritePng } = require("./png");
const { ScanRoot } = require("./scan");
const { ValidateModel } = require("./validate");

const KIND_DIRS = { image: "images", sound: "sounds", data: "data", binary: "binary", font: "fonts" };

/**
 * Scans every root and classifies each bundle folder. Each model also carries the bundle's `dir`, whether it's `devOnly`, its
 * `files` (as scanned) and the parsed `rawConfig` (bundle.json) - what the sprite API needs to plan a change without a rescan.
 */
function ScanAndClassify(config, diagnostics) {
    const found = [];
    config.roots.forEach(root => {
        ScanRoot(root.dir).forEach(bundle => {
            const duplicate = found.find(b => b.name === bundle.name);
            if (duplicate) {
                diagnostics.push({ level: "error", bundle: bundle.name, message: `bundle "${bundle.name}" is in two roots: ${duplicate.dir} and ${bundle.dir}.` });
                return;
            }
            found.push(Object.assign({ devOnly: root.devOnly }, bundle));
        });
    });
    return found.map(bundle => {
        let raw = null;
        const configFile = path.join(bundle.dir, "bundle.json");
        if (fs.existsSync(configFile)) {
            try {
                raw = JSON.parse(fs.readFileSync(configFile, "utf8"));
            } catch (error) {
                diagnostics.push({ level: "error", bundle: bundle.name, file: "bundle.json", message: `bundle.json isn't valid JSON: ${error.message}` });
            }
        }
        const model = ClassifyBundle({
            name: bundle.name,
            files: bundle.files,
            config: raw,
            soundFormats: config.soundFormats,
            readText: rel => fs.readFileSync(path.join(bundle.dir, rel), "utf8")
        });
        diagnostics.push(...model.diagnostics);
        return Object.assign(model, { dir: bundle.dir, devOnly: bundle.devOnly, files: bundle.files, rawConfig: raw });
    });
}

function RunPlugins(config, models, options, diagnostics) {
    config.plugins.forEach(file => {
        const plugin = require(file);
        if (typeof plugin.afterScan === "function") {
            plugin.afterScan({
                bundles: models,
                config,
                check: !!options.check,
                production: !!options.production,
                Report: (level, message, bundle, where) => diagnostics.push({ level, bundle, file: where, message })
            });
        }
    });
}

/** Packs (or fetches from the cache) one sheet of frame files; returns its pages as `{ width, height, frames, png }`. */
function PackSheet(model, sheet, hasher, cacheDir, usedKeys, diagnostics) {
    const options = Object.assign({}, model.atlasOptions, model.sheetOptions[sheet.name]);
    const files = sheet.frames.map(f => ({ key: `${model.name}.${f.local}`, abs: path.join(model.dir, f.rel), rel: f.rel }));
    const key = AtlasKey(files.map(f => ({ key: f.key, hash: hasher.Hash(f.abs) })), options);
    usedKeys.add(key);
    const cached = ReadAtlasCache(cacheDir, key);
    if (cached) {
        return cached.pages;
    }

    const frames = [];
    files.forEach(f => {
        try {
            frames.push({ key: f.key, image: ReadPng(fs.readFileSync(f.abs)) });
        } catch (error) {
            diagnostics.push({ level: "error", bundle: model.name, file: f.rel, message: `can't read "${f.rel}" as a PNG: ${error.message}` });
        }
    });
    if (frames.length !== files.length) {
        return null;
    }
    const packed = PackAtlas(frames, options);
    packed.diagnostics.forEach(d => diagnostics.push(Object.assign({ bundle: model.name, file: `sprites/${sheet.name}` }, d)));
    if (!packed.pages.length) {
        return null;
    }
    const pages = packed.pages.map(page => ({ width: page.width, height: page.height, frames: page.frames, png: WritePng(page.image) }));
    WriteAtlasCache(cacheDir, key, pages);
    return pages;
}

/** Everything a bundle puts in the output: `{ outputs: Map(rel -> { data | src }), manifest }`. */
function BuildBundle(model, hasher, cacheDir, usedKeys, diagnostics) {
    const outputs = new Map();
    const atlases = [];
    const assets = {};
    const put = (rel, output) => outputs.set(rel, output);

    model.sheets.forEach(sheet => {
        const pages = sheet.prepacked ? PackPrepacked(model, sheet, put, atlases) : PackSheet(model, sheet, hasher, cacheDir, usedKeys, diagnostics);
        if (!pages || sheet.prepacked) {
            return;
        }
        pages.forEach((page, i) => {
            const base = `${model.name}/atlases/${sheet.name}_${i}`;
            const json = StableStringify(AtlasJson(page, `${sheet.name}_${i}.png`));
            put(base + ".json", { data: json });
            put(base + ".png", { data: page.png });
            atlases.push(AtlasEntry(model, sheet.name, i, base, Buffer.byteLength(json) + page.png.length, model.sheetOptions[sheet.name]));
        });
    });

    model.assets.forEach(asset => {
        const abs = rel => path.join(model.dir, rel);
        switch (asset.kind) {
            case "sprite":
            case "animation":
                assets[asset.id] = { kind: asset.kind, frames: asset.frames.map(f => `${model.name}.${f}`) };
                break;
            case "sound": {
                // In preference order - which is why it's a list: a JSON object's keys come out sorted.
                const urls = asset.files.map(f => {
                    const rel = `${model.name}/sounds/${asset.local}.${f.ext}`;
                    put(rel, { src: abs(f.rel) });
                    return rel;
                });
                assets[asset.id] = { kind: "sound", urls, bytes: fs.statSync(abs(asset.files[0].rel)).size, tier: asset.tier };
                break;
            }
            case "font": {
                const fntRel = `${model.name}/fonts/${asset.local}.fnt`;
                const renames = {};
                let bytes = 0;
                asset.pages.forEach((page, i) => {
                    const pageRel = `${model.name}/fonts/${asset.local}_${i}.png`;
                    renames[page.file] = path.posix.basename(pageRel);
                    put(pageRel, { src: abs(page.rel) });
                    bytes += fs.statSync(abs(page.rel)).size;
                });
                const text = RewritePages(fs.readFileSync(abs(asset.files[0].rel), "utf8"), renames);
                put(fntRel, { data: text });
                assets[asset.id] = { kind: "font", url: fntRel, face: ParseFnt(text).face, bytes: bytes + Buffer.byteLength(text), tier: asset.tier };
                break;
            }
            default: {
                const f = asset.files[0];
                const rel = `${model.name}/${KIND_DIRS[asset.kind]}/${asset.local}.${f.ext}`;
                put(rel, { src: abs(f.rel) });
                assets[asset.id] = { kind: asset.kind, url: rel, bytes: fs.statSync(abs(f.rel)).size, tier: asset.tier };
            }
        }
    });

    // The bundle's version: what every one of its files holds, so any change busts the cache for exactly this bundle.
    const lines = Array.from(outputs.keys()).sort(CompareKeys).map(rel => {
        const out = outputs.get(rel);
        return `${rel}:${out.src ? hasher.Hash(out.src) : Hash(out.data)}`;
    });
    const bytes = Array.from(outputs.values()).reduce((sum, out) => sum + (out.src ? fs.statSync(out.src).size : Buffer.byteLength(out.data)), 0);
    return {
        outputs,
        manifest: {
            dependsOn: model.dependsOn.slice().sort(CompareKeys),
            preload: model.preload,
            hash: Hash(...lines, JSON.stringify(assets)),
            bytes,
            atlases,
            assets
        }
    };
}

function AtlasEntry(model, sheetName, page, base, bytes, sheetOptions) {
    const entry = { name: `~atlas.${model.name}.${sheetName}.${page}`, json: base + ".json", bytes };
    const scaleMode = (sheetOptions && sheetOptions.scaleMode) || model.atlasOptions.scaleMode;
    if (scaleMode) {
        entry.scaleMode = scaleMode;
    }
    return entry;
}

/** An already-packed sheet: its PNG as is, its JSON re-keyed to "<bundle>.<frame>" (frame names lose any extension). */
function PackPrepacked(model, sheet, put, atlases) {
    const source = JSON.parse(fs.readFileSync(path.join(model.dir, sheet.prepacked.json), "utf8"));
    const frames = {};
    sheet.prepacked.frames.forEach(fr => {
        frames[`${model.name}.${fr.local}`] = source.frames[fr.raw];
    });
    const base = `${model.name}/atlases/${sheet.name}_0`;
    const json = StableStringify(Object.assign({}, source, { frames, meta: Object.assign({}, source.meta, { image: `${sheet.name}_0.png` }) }));
    put(base + ".json", { data: json });
    put(base + ".png", { src: path.join(model.dir, sheet.prepacked.png) });
    atlases.push(AtlasEntry(model, sheet.name, 0, base, Buffer.byteLength(json) + fs.statSync(path.join(model.dir, sheet.prepacked.png)).size, model.sheetOptions[sheet.name]));
    return [];
}

function BuildAssets(options) {
    const config = LoadConfig(options.configPath);
    const production = !!options.production;
    const diagnostics = [];
    const result = { ok: false, diagnostics, manifest: null, dts: null, written: [], removed: [], bundles: [] };
    const finish = () => {
        result.ok = !diagnostics.some(d => d.level === "error");
        return result;
    };

    if (options.clean && !options.check) {
        fs.rmSync(config.out, { recursive: true, force: true });
    }

    let models = ScanAndClassify(config, diagnostics);
    if (config.plugins.length) {
        const fromPlugins = [];
        RunPlugins(config, models, options, fromPlugins);
        // A plugin may have written a source file (the asset-meta sync does): classify what's there now.
        diagnostics.length = 0;
        models = ScanAndClassify(config, diagnostics);
        diagnostics.push(...fromPlugins);
    }
    result.bundles = models;

    diagnostics.push(...ValidateModel({
        bundles: models,
        limits: config.limits,
        readText: (bundle, rel) => fs.readFileSync(path.join(bundle.dir, rel), "utf8")
    }));
    if (diagnostics.some(d => d.level === "error")) {
        return finish();
    }

    const dts = GenerateDts(models, config.dtsModule);
    result.dts = dts;

    if (options.check) {
        if (config.dts) {
            const existing = fs.existsSync(config.dts) ? fs.readFileSync(config.dts, "utf8") : undefined;
            if (IsDtsStale(existing, dts)) {
                diagnostics.push({ level: "error", file: config.dts, message: "the generated asset ids are out of date - run `npm run assets`." });
            }
        }
        return finish();
    }

    const publicDir = path.join(config.out, "public");
    const cacheDir = path.join(config.out, ".cache");
    const hasher = FileHasher(cacheDir);
    const usedKeys = new Set();
    const outputs = new Map();
    const manifest = { version: 1, dev: !production, bundles: {} };

    models.filter(m => !(production && m.devOnly)).forEach(model => {
        const built = BuildBundle(model, hasher, cacheDir, usedKeys, diagnostics);
        built.outputs.forEach((out, rel) => outputs.set(rel, out));
        manifest.bundles[model.name] = built.manifest;
    });
    if (diagnostics.some(d => d.level === "error")) {
        return finish();
    }

    outputs.set("manifest.json", { data: StableStringify(manifest) });
    outputs.forEach((out, rel) => {
        const dest = path.join(publicDir, rel);
        const changed = out.src ? CopyIfChanged(out.src, dest) : WriteIfChanged(dest, out.data);
        if (changed) {
            result.written.push(rel);
        }
    });
    result.removed = RemoveOrphans(publicDir, new Set(outputs.keys()));
    PruneAtlasCache(cacheDir, usedKeys);
    hasher.Save();

    if (config.dts && WriteIfChanged(config.dts, dts)) {
        result.written.push(path.relative(config.configDir, config.dts).split(path.sep).join("/"));
    }
    result.manifest = manifest;
    return finish();
}

module.exports = { BuildAssets, ScanAndClassify };
