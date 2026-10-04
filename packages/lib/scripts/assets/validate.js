"use strict";

/**
 * The checks that need more than one bundle (or a file's contents): dependencies, ids that must
 * be unique process-wide (a bitmap font's face), shadowing across a bundle and what it depends
 * on, data files that must parse, and the size warnings. Per-bundle rules live in classify.js.
 * Returns diagnostics - `{ level: "error" | "warning", bundle?, file?, message }` - and throws nothing.
 */

const { CompareKeys, Suggest } = require("./ids");

/** Every bundle `name` loads with: its `dependsOn`, and theirs, in dependency order (not including itself). */
function DependencyChain(name, byName, seen) {
    const out = [];
    const visit = n => {
        const bundle = byName.get(n);
        if (!bundle || seen.has(n)) {
            return;
        }
        seen.add(n);
        bundle.dependsOn.forEach(visit);
        out.push(n);
    };
    const bundle = byName.get(name);
    seen.add(name);
    if (bundle) {
        bundle.dependsOn.forEach(visit);
    }
    return out;
}

/**
 * @param {object} args
 * @param {object[]} args.bundles classified bundle models (see classify.js)
 * @param {object} args.limits byte thresholds (config.js)
 * @param {(bundle: object, rel: string) => string} args.readText
 */
function ValidateModel({ bundles, limits, readText }) {
    const diagnostics = [];
    const diag = (level, bundle, message, file) => diagnostics.push({ level, bundle, file, message });
    const byName = new Map(bundles.map(b => [b.name, b]));
    const names = bundles.map(b => b.name);

    bundles.forEach(bundle => {
        bundle.dependsOn.forEach(dep => {
            if (dep === bundle.name) {
                diag("error", bundle.name, `bundle.json: "dependsOn" lists the bundle itself.`, "bundle.json");
            } else if (!byName.has(dep)) {
                const hint = Suggest(dep, names);
                diag("error", bundle.name, `bundle.json: depends on "${dep}", which isn't a bundle${hint ? ` - did you mean "${hint}"?` : ""}`, "bundle.json");
            }
        });
    });

    // Cycles: walk each bundle's dependencies looking for a way back to it.
    bundles.forEach(bundle => {
        const stack = [];
        const walk = n => {
            if (stack.indexOf(n) >= 0) {
                return n === bundle.name ? stack.concat(n) : null;
            }
            const b = byName.get(n);
            if (!b) {
                return null;
            }
            stack.push(n);
            for (const dep of b.dependsOn) {
                const cycle = walk(dep);
                if (cycle) {
                    return cycle;
                }
            }
            stack.pop();
            return null;
        };
        const cycle = walk(bundle.name);
        if (cycle) {
            diag("error", bundle.name, `bundles depend on each other in a cycle: ${cycle.join(" -> ")}.`, "bundle.json");
        }
    });

    // Bitmap fonts are looked up by face in one process-wide table.
    const faces = new Map();
    bundles.forEach(bundle => bundle.assets.filter(a => a.kind === "font" && a.face).forEach(font => {
        if (faces.has(font.face)) {
            diag("error", bundle.name, `font face "${font.face}" is also used by ${faces.get(font.face)} - bitmap font names are global, so two bundles can't both have it.`, font.files[0].rel);
        } else {
            faces.set(font.face, font.id);
        }
    }));

    // Shadowing: a sprite that has the same name as one in a bundle this one loads with. Bare names resolve to the
    // nearest bundle, so it's allowed - but it should be on purpose.
    bundles.forEach(bundle => {
        const visible = bundle.name === "global" ? [] : DependencyChain(bundle.name, byName, new Set()).concat(byName.has("global") && bundle.dependsOn.indexOf("global") < 0 ? ["global"] : []);
        const drawables = bundle.assets.filter(a => a.kind === "sprite" || a.kind === "animation");
        drawables.forEach(asset => {
            const hidden = visible.find(n => byName.get(n) && byName.get(n).assets.some(a => (a.kind === "sprite" || a.kind === "animation") && a.local === asset.local));
            if (hidden && bundle.overrides.indexOf(asset.local) < 0) {
                diag("warning", bundle.name, `"${asset.id}" shadows "${hidden}.${asset.local}" - bare "${asset.local}" will resolve to this bundle's. Add it to "overrides" in bundle.json if that's intended.`);
            }
        });
        bundle.overrides.forEach(local => {
            if (!drawables.some(a => a.local === local)) {
                diag("warning", bundle.name, `bundle.json: "overrides" lists "${local}", which isn't a sprite or animation in this bundle.`, "bundle.json");
            }
        });
    });

    // Data files must parse - a typo should fail the build, not the player's first load.
    bundles.forEach(bundle => bundle.assets.filter(a => a.kind === "data").forEach(data => {
        const rel = data.files[0].rel;
        let parsed;
        try {
            parsed = JSON.parse(readText(bundle, rel));
        } catch (error) {
            diag("error", bundle.name, `"${rel}" isn't valid JSON: ${error.message}`, rel);
            return;
        }
        if (parsed && typeof parsed === "object" && parsed.frames && parsed.meta && parsed.meta.image) {
            diag("warning", bundle.name, `"${rel}" looks like a packed sprite sheet - put it (and its image) in sprites/ to load it as one.`, rel);
        }
    }));

    // Size.
    const threshold = { image: limits.imageBytes, sound: limits.soundBytes, data: limits.dataBytes, binary: limits.imageBytes, font: limits.dataBytes };
    bundles.forEach(bundle => {
        bundle.assets.forEach(asset => {
            const limit = threshold[asset.kind];
            if (limit && asset.bytes > limit) {
                diag("warning", bundle.name, `${asset.id} (${asset.kind}) is ${(asset.bytes / 1048576).toFixed(1)} MB${asset.tier === "boot" ? " and loads with the bundle - consider tier \"background\" or \"lazy\" in bundle.json" : ""}.`, asset.files[0].rel);
            }
        });
        const total = bundle.assets.reduce((sum, a) => sum + a.bytes, 0);
        if (total > limits.bundleBytes) {
            diag("warning", bundle.name, `bundle is ${(total / 1048576).toFixed(1)} MB of source assets.`);
        }
    });

    return diagnostics.sort((a, b) => (a.level === b.level ? 0 : a.level === "error" ? -1 : 1) || CompareKeys(a.bundle || "", b.bundle || ""));
}

module.exports = { ValidateModel, DependencyChain };
