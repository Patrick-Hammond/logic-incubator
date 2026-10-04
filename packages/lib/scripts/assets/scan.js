"use strict";

/**
 * The disk side of discovery: an assets root's immediate subfolders are bundles, and every file
 * under one (any depth) is a candidate asset. Everything is sorted by code unit so a scan - and
 * everything built from it - is the same on every machine. Dot-folders and node_modules are skipped.
 */

const fs = require("fs");
const path = require("path");
const { CompareKeys } = require("./ids");

function WalkFiles(dir, prefix, out) {
    fs.readdirSync(dir, { withFileTypes: true })
        .filter(entry => entry.name[0] !== "." && entry.name !== "node_modules")
        .sort((a, b) => CompareKeys(a.name, b.name))
        .forEach(entry => {
            const rel = prefix ? prefix + "/" + entry.name : entry.name;
            const abs = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                WalkFiles(abs, rel, out);
            } else if (entry.isFile()) {
                out.push({ rel, bytes: fs.statSync(abs).size });
            }
        });
    return out;
}

/** @returns {{ name: string, dir: string, files: { rel: string, bytes: number }[] }[]} one per bundle folder, by name */
function ScanRoot(rootDir) {
    if (!fs.existsSync(rootDir) || !fs.statSync(rootDir).isDirectory()) {
        throw new Error(`assets root "${rootDir}" doesn't exist.`);
    }
    return fs.readdirSync(rootDir, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && entry.name[0] !== "." && entry.name !== "node_modules")
        .sort((a, b) => CompareKeys(a.name, b.name))
        .map(entry => {
            const dir = path.join(rootDir, entry.name);
            return { name: entry.name, dir, files: WalkFiles(dir, "", []) };
        });
}

module.exports = { ScanRoot };
