// Turns the Aseprite sprite back into the atlas's frames: each slice becomes assets/ui/sprites/ui/<name>.png, and assets/ui/data/frames.json records every frame's size and - for a
// nine-patch slice - its insets, which is how the game learns where each frame's edges are. A frame that has no slice any more is removed (unless --keep).
//
//   node packages/ui/tools/slice-sheet.mjs --aseprite=<Aseprite.exe> packages/ui/art/ui.aseprite     exports with Aseprite's command line (or set ASEPRITE_PATH)
//   node packages/ui/tools/slice-sheet.mjs <sheet.png> <sheet.json>                                    from an export made by File > Export Sprite Sheet (JSON Data, Meta: Slices)
//   options: --keep (don't remove frames that have no slice)  --sprites=<dir>  --data=<dir>
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ParseSlices } from "./lib/aseprite.mjs";
import { FrameEntry, ReadFrames, WriteFrames } from "./lib/frames.mjs";
import { Crop } from "./lib/image.mjs";

const require = createRequire(import.meta.url);
const { PNG } = require("pngjs");
const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => (args.find(a => a.startsWith("--" + name + "=")) || "").slice(name.length + 3) || fallback;
const positional = args.filter(a => !a.startsWith("--"));
const spritesDir = option("sprites", join(here, "../assets/ui/sprites/ui"));
const dataDir = option("data", join(here, "../assets/ui/data"));
const keep = args.includes("--keep");

const readPng = file => {
    const png = PNG.sync.read(readFileSync(file));
    return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
};
const encode = img => PNG.sync.write({ width: img.width, height: img.height, data: Buffer.from(img.data) });

let sheetFile, jsonFile, temp = null;
const aseprite = option("aseprite", process.env.ASEPRITE_PATH || "");
if (positional.length === 1 && /\.(aseprite|ase)$/i.test(positional[0])) {
    if (!aseprite) {
        console.error("Give the path to Aseprite: --aseprite=\"C:/.../Aseprite.exe\" (or set ASEPRITE_PATH), or export the sheet yourself and pass its PNG and JSON.");
        process.exit(1);
    }
    temp = mkdtempSync(join(tmpdir(), "ui-slice-"));
    sheetFile = join(temp, "sheet.png");
    jsonFile = join(temp, "sheet.json");
    execFileSync(aseprite, ["-b", positional[0], "--sheet", sheetFile, "--data", jsonFile, "--format", "json-array", "--list-slices"], { stdio: "inherit" });
} else if (positional.length === 2) {
    [sheetFile, jsonFile] = positional;
} else {
    console.error("usage: slice-sheet.mjs --aseprite=<exe> <file.aseprite>   or   slice-sheet.mjs <sheet.png> <sheet.json>");
    process.exit(1);
}

try {
    const sheet = readPng(sheetFile);
    const slices = ParseSlices(JSON.parse(readFileSync(jsonFile, "utf8")), sheet);
    mkdirSync(spritesDir, { recursive: true });
    mkdirSync(dataDir, { recursive: true });
    const framesFile = join(dataDir, "frames.json");
    const index = ReadFrames(framesFile);

    const changed = [], added = [];
    const next = {};
    slices.forEach(slice => {
        const image = Crop(sheet, slice.x, slice.y, slice.w, slice.h);
        const file = join(spritesDir, slice.name + ".png");
        const bytes = encode(image);
        if (!existsSync(file)) added.push(slice.name);
        else if (Buffer.compare(readFileSync(file), bytes) !== 0) {
            // The same picture re-encoded may differ in bytes; compare what is drawn.
            const before = readPng(file);
            if (before.width !== image.width || before.height !== image.height || Buffer.compare(Buffer.from(before.data), Buffer.from(image.data)) !== 0) changed.push(slice.name);
        }
        writeFileSync(file, bytes);
        next[slice.name] = FrameEntry(image, slice.insets);
    });

    const removed = [];
    Object.keys(index).forEach(name => {
        if (next[name]) return;
        if (keep) {
            next[name] = index[name];
            return;
        }
        removed.push(name);
        rmSync(join(spritesDir, name + ".png"), { force: true });
    });
    WriteFrames(framesFile, next);

    console.log(`${slices.length} frames sliced: ${added.length} new, ${changed.length} changed, ${slices.length - added.length - changed.length} unchanged${removed.length ? `, ${removed.length} removed` : ""}.`);
    if (added.length) console.log("  new: " + added.join(", "));
    if (changed.length) console.log("  changed: " + changed.join(", "));
    if (removed.length) console.log("  removed (no slice): " + removed.join(", "));
} finally {
    if (temp) rmSync(temp, { recursive: true, force: true });
}
