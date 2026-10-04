"use strict";

/**
 * Skips repacking an atlas whose inputs haven't changed. The cache key is a hash of the *inputs*
 * (each frame's content, the packing options and PIPELINE_VERSION), never of the encoded PNG -
 * zlib's output isn't byte-stable across Node builds, so hashing it would make the version a
 * bundle is served under depend on whose machine built it.
 *
 * Bump PIPELINE_VERSION whenever the packer's output for the same input changes.
 */

const fs = require("fs");
const path = require("path");
const { Hash } = require("./manifest");

const PIPELINE_VERSION = 1;

function AtlasKey(frames, options) {
    return Hash(String(PIPELINE_VERSION), JSON.stringify(options), ...frames.map(f => `${f.key}:${f.hash}`));
}

/** @returns {{ pages: { width: number, height: number, frames: object[], png: Buffer }[] } | null} */
function ReadAtlasCache(cacheDir, key) {
    const dir = path.join(cacheDir, "atlas", key);
    try {
        const meta = JSON.parse(fs.readFileSync(path.join(dir, "pages.json"), "utf8"));
        return { pages: meta.pages.map((page, i) => Object.assign({}, page, { png: fs.readFileSync(path.join(dir, `page${i}.png`)) })) };
    } catch {
        return null;
    }
}

function WriteAtlasCache(cacheDir, key, pages) {
    const dir = path.join(cacheDir, "atlas", key);
    fs.mkdirSync(dir, { recursive: true });
    pages.forEach((page, i) => fs.writeFileSync(path.join(dir, `page${i}.png`), page.png));
    fs.writeFileSync(path.join(dir, "pages.json"), JSON.stringify({ pages: pages.map(p => ({ width: p.width, height: p.height, frames: p.frames })) }));
}

/** Removes cached atlases other than `usedKeys`, so the cache doesn't grow with every edit. */
function PruneAtlasCache(cacheDir, usedKeys) {
    const root = path.join(cacheDir, "atlas");
    if (!fs.existsSync(root)) {
        return;
    }
    fs.readdirSync(root).filter(name => !usedKeys.has(name)).forEach(name => fs.rmSync(path.join(root, name), { recursive: true, force: true }));
}

/** A content hash of a file, remembered by (size, mtime) so an unchanged 14 MB ogg isn't re-read every build. */
function FileHasher(cacheDir) {
    const file = path.join(cacheDir, "hashes.json");
    let known = {};
    try {
        known = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        known = {};
    }
    const used = {};
    return {
        Hash(abs) {
            const stat = fs.statSync(abs);
            const stamp = `${stat.size}:${stat.mtimeMs}`;
            const entry = known[abs];
            const hash = entry && entry.stamp === stamp ? entry.hash : Hash(fs.readFileSync(abs));
            used[abs] = { stamp, hash };
            return hash;
        },
        Save() {
            fs.mkdirSync(cacheDir, { recursive: true });
            fs.writeFileSync(file, JSON.stringify(used));
        }
    };
}

module.exports = { PIPELINE_VERSION, AtlasKey, ReadAtlasCache, WriteAtlasCache, PruneAtlasCache, FileHasher };
