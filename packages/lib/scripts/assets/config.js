"use strict";

/**
 * Reads a game's `assets.config.json`. Every path in it is relative to the file, so the same
 * config works from any working directory (npm scripts, the webpack plugin, tests).
 *
 *   roots[]       { dir, devOnly? } - folders whose subfolders are bundles; a devOnly root (the
 *                 editor's) is left out of a production build, though its ids stay in the d.ts
 *   out           where the build writes (`public/` is what gets served; `.cache/` is private)
 *   dts           the generated id declarations; omit to skip them
 *   plugins[]     build hooks (modules exporting `{ afterScan(context) }`)
 *   limits        byte sizes above which the report warns
 *   soundFormats  accepted sound extensions, most preferred first
 */

const fs = require("fs");
const path = require("path");
const { Suggest } = require("./ids");
const { DEFAULT_SOUND_FORMATS } = require("./classify");

const KEYS = ["roots", "out", "dts", "dtsModule", "plugins", "limits", "soundFormats"];
const DEFAULT_LIMITS = { imageBytes: 1500000, soundBytes: 2000000, dataBytes: 1000000, bundleBytes: 25000000 };

function LoadConfig(configPath) {
    const configDir = path.dirname(path.resolve(configPath));
    let raw;
    try {
        raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
    } catch (error) {
        throw new Error(`can't read ${configPath}: ${error.message}`, { cause: error });
    }
    Object.keys(raw).forEach(key => {
        if (KEYS.indexOf(key) < 0) {
            const hint = Suggest(key, KEYS);
            throw new Error(`${configPath}: unknown key "${key}"${hint ? ` - did you mean "${hint}"?` : ""}`);
        }
    });
    if (!Array.isArray(raw.roots) || !raw.roots.length) {
        throw new Error(`${configPath}: "roots" must list at least one assets folder.`);
    }
    const resolve = p => path.resolve(configDir, p);
    return {
        configDir,
        roots: raw.roots.map(r => ({ dir: resolve(typeof r === "string" ? r : r.dir), devOnly: typeof r === "object" && !!r.devOnly })),
        out: resolve(raw.out || ".assets"),
        dts: raw.dts ? resolve(raw.dts) : null,
        dtsModule: raw.dtsModule || "@logic-incubator/lib/assets/AssetIds",
        plugins: (raw.plugins || []).map(resolve),
        limits: Object.assign({}, DEFAULT_LIMITS, raw.limits),
        soundFormats: raw.soundFormats || DEFAULT_SOUND_FORMATS
    };
}

module.exports = { LoadConfig, DEFAULT_LIMITS };
