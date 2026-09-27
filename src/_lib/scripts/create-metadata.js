"use strict";

/**
 * Keeps a game's assets-meta.json's set of keys in sync with its packed
 * spritesheet (frames.json), without ever touching an existing entry's
 * hand-authored values:
 *   - adds an empty {} placeholder for every asset name frames.json has
 *     that assets-meta.json doesn't yet,
 *   - removes any assets-meta.json entry whose asset name no longer exists
 *     in frames.json (the source art was deleted/renamed),
 *   - leaves every other entry's value exactly as it was.
 *
 * Run after pack-textures (see the game's "build" script) so frames.json
 * is already up to date.
 *
 * Usage: node create-metadata.js <assets_dir>
 *   <assets_dir>  Folder holding frames.json and assets-meta.json
 */

const fs = require("fs");
const path = require("path");

if (!process.argv[2]) {
    console.error("Usage: node create-metadata.js <assets_dir>");
    process.exit(1);
}

const ASSETS_DIR = path.resolve(process.argv[2]);
const FRAMES_PATH = path.join(ASSETS_DIR, "frames.json");
const META_PATH = path.join(ASSETS_DIR, "assets-meta.json");

// Same grouping rule as AnimFrameRegex in src/dungeon/Constants.ts (this plain
// Node script can't import it): an animation's frames all share everything up
// to a trailing "_f<N>"; anything else - including names that merely contain
// "_f", like "wall_fountain_top_1" - is its own single-frame asset name.
// src/dungeon/AnimFrameRegex.test.ts fails if the two rules drift apart.
const ANIM_NAME_REGEX = /^.+(?=_f\d+$)/;

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
