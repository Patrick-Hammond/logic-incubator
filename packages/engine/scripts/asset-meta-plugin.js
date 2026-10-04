"use strict";

/**
 * Asset-build plugin (list it under "plugins" in a game's assets.config.json): keeps each bundle's
 * `assets-meta.json` - the per-sprite tile behaviour the engine reads (see AssetMetadata.ts) -
 * in step with the sprites the bundle has, without ever touching an existing entry's hand-authored
 * values:
 *   - adds an empty {} for every sprite or animation the file doesn't mention yet,
 *   - removes an entry whose sprite no longer exists (the source art was deleted or renamed -
 *     with a warning if it had anything in it),
 *   - keeps every other entry exactly as it was, and the keys sorted.
 *
 * Only bundles that already have an assets-meta.json are synced: having one is how a bundle says
 * its sprites are tiles. Runs after the scan and before packing, so the file is hashed as it will
 * ship. With `--check` it writes nothing and reports an error if the file is out of date.
 *
 * Replaces the sync that used to live in create-metadata.js, which read the packed frames.json and
 * so had its own copy of the animation-frame naming rule; here the names come from the build's scan.
 */

const fs = require("fs");
const path = require("path");

function ReadJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function SortedMerge(names, existing) {
    const merged = {};
    names.slice().sort().forEach(name => {
        merged[name] = Object.prototype.hasOwnProperty.call(existing, name) ? existing[name] : {};
    });
    return merged;
}

function SyncBundle(bundle, context) {
    const meta = bundle.assets.find(a => a.kind === "data" && a.local === "assets_meta");
    if (!meta) {
        return;
    }
    const rel = meta.files[0].rel;
    const file = path.join(bundle.dir, rel);
    let existing;
    try {
        existing = ReadJson(file);
    } catch (error) {
        context.Report("error", `isn't valid JSON: ${error.message}`, bundle.name, rel);
        return;
    }

    const names = bundle.assets.filter(a => a.kind === "sprite" || a.kind === "animation").map(a => a.local);
    const added = names.filter(name => !Object.prototype.hasOwnProperty.call(existing, name));
    const known = new Set(names);
    const removed = Object.keys(existing).filter(name => !known.has(name));

    const text = JSON.stringify(SortedMerge(names, existing), null, "\t") + "\n";
    const current = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    if (text === current) {
        return;
    }

    removed.filter(name => Object.keys(existing[name] || {}).length).forEach(name => {
        context.Report("warning", `dropped the metadata for "${name}" - there's no sprite of that name any more.`, bundle.name, rel);
    });
    if (context.check) {
        context.Report("error", `is out of sync with the sprites (${added.length} to add, ${removed.length} to remove) - run \`npm run assets\`.`, bundle.name, rel);
        return;
    }
    fs.writeFileSync(file, text, "utf8");
    context.Report("warning", `synced with the sprites: ${added.length} added, ${removed.length} removed.`, bundle.name, rel);
}

exports.afterScan = function (context) {
    context.bundles.forEach(bundle => SyncBundle(bundle, context));
};
