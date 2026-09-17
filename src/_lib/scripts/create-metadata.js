"use strict";

/**
 * Keeps assets-meta.json's set of keys in sync with the dungeon project's
 * packed spritesheet (frames.json), without ever touching an existing
 * entry's hand-authored values:
 *   - adds an empty {} placeholder for every asset name frames.json has
 *     that assets-meta.json doesn't yet,
 *   - removes any assets-meta.json entry whose asset name no longer exists
 *     in frames.json (the source art was deleted/renamed),
 *   - leaves every other entry's value exactly as it was.
 *
 * Run after pack-textures (see package.json's "build" script) so frames.json
 * is already up to date.
 */

const fs = require("fs");
const path = require("path");

const ASSETS_DIR = path.join(__dirname, "..", "..", "dungeon", "assets");
const FRAMES_PATH = path.join(ASSETS_DIR, "frames.json");
const META_PATH = path.join(ASSETS_DIR, "assets-meta.json");

// Same grouping rule as Loader.ts/Dungeon.ts: an animation's frames all share
// everything up to "_f<N>"; anything else is its own single-frame asset name.
const ANIM_NAME_REGEX = /^.+(?=_f)/;

function AssetNamesFromFrames(frames) {
    const names = new Set();
    for (const frameKey of Object.keys(frames)) {
        const match = ANIM_NAME_REGEX.exec(frameKey);
        names.add(match ? match[0] : frameKey);
    }
    return names;
}

function Main() {
    const framesJson = JSON.parse(fs.readFileSync(FRAMES_PATH, "utf8"));
    const assetNames = AssetNamesFromFrames(framesJson.frames || {});

    const existing = fs.existsSync(META_PATH) ? JSON.parse(fs.readFileSync(META_PATH, "utf8")) : {};

    const merged = {};
    let added = 0;
    let removed = 0;

    Array.from(assetNames).sort().forEach(name => {
        merged[name] = Object.prototype.hasOwnProperty.call(existing, name) ? existing[name] : {};
        if (!Object.prototype.hasOwnProperty.call(existing, name)) {
            added++;
        }
    });

    Object.keys(existing).forEach(name => {
        if (!assetNames.has(name)) {
            removed++;
        }
    });

    fs.writeFileSync(META_PATH, JSON.stringify(merged, null, "\t") + "\n", "utf8");

    console.log(`assets-meta.json: ${added} added, ${removed} removed, ${assetNames.size} total.`);
}

Main();
