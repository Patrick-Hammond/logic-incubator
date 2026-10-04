"use strict";

/**
 * The asset pipeline's naming rules - the one place they live. An asset id is `<bundle>.<local>`:
 * the bundle is the folder under an assets root, the local name is the file's base name (no
 * extension), lowercased with "-" and spaces turned into "_". The animation rule (a trailing
 * `_f<N>` marks a frame) lives here too, so the runtime never needs the regex - it reads the
 * grouping the build wrote into the manifest.
 *
 * Plain Node, no dependencies, so the rules test under vitest like any other pure module.
 */

const LOCAL_NAME = /^[a-z0-9_]+$/;
const BUNDLE_NAME = /^[a-z][a-z0-9_]*$/;
/** Two groups: the animation's name, then the frame's index. */
const DEFAULT_ANIM_PATTERN = "^(.+)_f(\\d+)$";

/** UTF-16 code unit order: the same on every machine and locale, unlike `localeCompare` - output must be byte-stable. */
function CompareKeys(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
}

function NormalizeLocalName(base) {
    return base.toLowerCase().replace(/[-\s]/g, "_");
}

function IsValidLocalName(name) {
    return LOCAL_NAME.test(name);
}

function IsValidBundleName(name) {
    return BUNDLE_NAME.test(name);
}

function MakeId(bundle, local) {
    return bundle + "." + local;
}

/** `{ bundle, local }` for a qualified id, or null for a bare name. */
function SplitId(id) {
    const dot = id.indexOf(".");
    return dot < 1 ? null : { bundle: id.slice(0, dot), local: id.slice(dot + 1) };
}

/**
 * The animation a frame name belongs to, or null if it's a plain sprite. Only a trailing `_f<N>`
 * counts - names that merely contain "_f" ("wall_fountain_top_1", "heart_full") are sprites.
 *
 * @param {string} base frame name without extension
 * @param {string} [pattern] regex source with two groups (name, index)
 */
function ParseFrameName(base, pattern) {
    const match = new RegExp(pattern || DEFAULT_ANIM_PATTERN).exec(base);
    return match ? { name: match[1], index: parseInt(match[2], 10) } : null;
}

/**
 * Splits a bundle's frame names into sprites and animations. An animation's frames must run
 * `f0..fN` without gaps: a sequence missing `f0` (or with a hole) used to be dropped silently by
 * the old runtime grouping, so it's an error here - drop the stray frames with `ignore` in
 * bundle.json if that's what's wanted. A lone `foo_f0` becomes a one-frame sprite named `foo`.
 *
 * @param {string[]} names normalised frame names, unique
 * @param {string} [pattern]
 * @returns {{ sprites: {name: string, frames: string[]}[], animations: {name: string, frames: string[]}[], diagnostics: {level: string, message: string}[] }}
 */
function GroupFrames(names, pattern) {
    const sprites = [];
    const animations = [];
    const diagnostics = [];
    const groups = new Map();

    names.slice().sort(CompareKeys).forEach(name => {
        const parsed = ParseFrameName(name, pattern);
        if (!parsed) {
            sprites.push({ name, frames: [name] });
            return;
        }
        if (!groups.has(parsed.name)) {
            groups.set(parsed.name, []);
        }
        groups.get(parsed.name).push({ index: parsed.index, key: name });
    });

    Array.from(groups.keys()).sort(CompareKeys).forEach(name => {
        const members = groups.get(name).sort((a, b) => a.index - b.index || CompareKeys(a.key, b.key));
        const indices = members.map(m => m.index);
        const duplicate = indices.find((index, i) => i > 0 && index === indices[i - 1]);
        if (duplicate !== undefined) {
            diagnostics.push({ level: "error", message: `animation "${name}" has more than one frame ${duplicate} (e.g. foo_f1 and foo_f01).` });
            return;
        }
        if (indices.some((index, i) => index !== i)) {
            diagnostics.push({
                level: "error",
                message: `animation "${name}" has frames [${indices.join(", ")}] - its frames must run 0..${members.length - 1} without gaps. Fix the names, or list the strays under "ignore" in bundle.json.`
            });
            return;
        }
        if (members.length === 1) {
            // A one-frame "animation" (a hit flash, say) is just a sprite under the animation's name - the runtime has always read it that way.
            sprites.push({ name, frames: [members[0].key] });
            return;
        }
        animations.push({ name, frames: members.map(m => m.key) });
    });

    sprites.sort((a, b) => CompareKeys(a.name, b.name));
    return { sprites, animations, diagnostics };
}

const KINDS_BY_EXTENSION = {
    png: "image", jpg: "image", jpeg: "image", webp: "image",
    ogg: "sound", m4a: "sound", mp3: "sound", wav: "sound",
    json: "data",
    gif: "binary", bin: "binary",
    fnt: "font"
};

/** The asset kind a file extension (no dot, any case) belongs to, or undefined if the pipeline doesn't know it. */
function KindOfExtension(ext) {
    return KINDS_BY_EXTENSION[ext.toLowerCase()];
}

/** Edit distance, for "did you mean" on mistyped ids and config keys. */
function Distance(a, b) {
    let previous = [];
    for (let j = 0; j <= b.length; j++) {
        previous.push(j);
    }
    for (let i = 1; i <= a.length; i++) {
        const row = [i];
        for (let j = 1; j <= b.length; j++) {
            row.push(Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)));
        }
        previous = row;
    }
    return previous[b.length];
}

/** The closest of `candidates` to `name`, if it's close enough to be a likely typo. */
function Suggest(name, candidates) {
    let best;
    let bestDistance = Math.max(2, Math.floor(name.length / 3)) + 1;
    candidates.forEach(candidate => {
        const distance = Distance(name, candidate);
        if (distance < bestDistance) {
            best = candidate;
            bestDistance = distance;
        }
    });
    return best;
}

module.exports = {
    DEFAULT_ANIM_PATTERN,
    CompareKeys,
    NormalizeLocalName,
    IsValidLocalName,
    IsValidBundleName,
    MakeId,
    SplitId,
    ParseFrameName,
    GroupFrames,
    KindOfExtension,
    Distance,
    Suggest
};
