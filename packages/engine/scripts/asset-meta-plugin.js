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
 * It also checks each entry's `category` (the editor palette tab, see AssetCategories in
 * src/level/AssetMetadata.ts) is one the editor knows, so a typo is a build error rather than a sprite
 * that quietly turns up under Misc.
 *
 * The in-game sprite editor tells it when it saves a sprite (`onSpriteSaved`): a new sprite gets its entry straight away - with
 * the palette tab it was made under as its `category`, or a copy of another sprite's entry (a "Save as") - rather than the bare
 * {} the next sync would add.
 *
 * Replaces the sync that used to live in create-metadata.js, which read the packed frames.json and
 * so had its own copy of the animation-frame naming rule; here the names come from the build's scan.
 */

const fs = require("fs");
const path = require("path");

/** The palette's categories. Plain Node can't import src/level/AssetMetadata.ts, so this repeats its list; AssetMetadata.test.ts fails if they drift apart. */
const CATEGORIES = ["floor", "walls", "entities", "weapons", "items", "misc", "user"];

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

    Object.keys(existing).forEach(name => {
        const category = existing[name] && existing[name].category;
        if (category !== undefined && CATEGORIES.indexOf(category) < 0) {
            context.Report("error", `"${name}" has an unknown category ${JSON.stringify(category)} - use one of ${CATEGORIES.join(", ")}.`, bundle.name, rel);
        }
    });

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

exports.CATEGORIES = CATEGORIES;

exports.afterScan = function (context) {
    context.bundles.forEach(bundle => SyncBundle(bundle, context));
};

const Has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

/**
 * A sprite was saved by the editor. If it's a new one in a bundle that has an assets-meta.json, adds its entry: a copy of
 * `copyMetaFrom`'s (if given and present), with `category` set when one was asked for. An entry that's there is never touched.
 */
exports.onSpriteSaved = function (context) {
    const bundle = context.bundle;
    const meta = bundle.assets.find(a => a.kind === "data" && a.local === "assets_meta");
    if (!meta || !context.isNew) {
        return;
    }
    const rel = meta.files[0].rel;
    const file = path.join(bundle.dir, rel);
    let existing;
    try {
        existing = ReadJson(file);
    } catch (error) {
        context.Report("error", `${rel} isn't valid JSON (${error.message}), so "${context.name}" wasn't added to it.`);
        return;
    }
    if (Has(existing, context.name)) {
        return;
    }
    const entry = context.copyMetaFrom && Has(existing, context.copyMetaFrom) ? JSON.parse(JSON.stringify(existing[context.copyMetaFrom])) : {};
    if (context.category !== undefined) {
        if (CATEGORIES.indexOf(context.category) < 0) {
            context.Report("warning", `"${context.category}" isn't a palette category (${CATEGORIES.join(", ")}), so "${context.name}" was left without one.`);
        } else {
            entry.category = context.category;
        }
    }
    const names = Object.keys(existing).concat(context.name);
    fs.writeFileSync(file, JSON.stringify(SortedMerge(names, Object.assign({}, existing, { [context.name]: entry })), null, "\t") + "\n", "utf8");
};
