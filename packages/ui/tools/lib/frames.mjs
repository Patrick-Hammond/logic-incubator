// The frame index: assets/ui/data/frames.json, one entry per sprite of the UI atlas with its size and - for a nine-slice frame - its insets. It is written by whatever
// puts sprites in the atlas (the component extractor, the seed tool, the Aseprite slicer) and read by the game (the data asset `ui.frames`), so the art says where
// its own edges are and the skin only says what to draw where. Pure apart from reading and writing the file.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

/** What an index entry says about a sprite: its size and, if it is a nine-slice source, `insets` as { left, top, right, bottom }. */
export function FrameEntry(image, insets = null) {
    const entry = { width: image.width, height: image.height };
    if (insets) {
        entry.insets = { left: insets.left, top: insets.top, right: insets.right, bottom: insets.bottom };
    }
    return entry;
}

export function ReadFrames(file) {
    return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
}

/** Writes the index with its names in order, so it diffs well. */
export function WriteFrames(file, frames) {
    const sorted = {};
    Object.keys(frames).sort().forEach(name => (sorted[name] = frames[name]));
    writeFileSync(file, JSON.stringify(sorted, null, "\t") + "\n");
}

/** What is wrong with a name as a frame's name (the asset pipeline's rule: lowercase letters, digits and underscores, and no `_f<number>` ending), or null. */
export function FrameNameProblem(name) {
    if (!/^[a-z][a-z0-9_]*$/.test(name)) {
        return `"${name}" isn't a frame name: use lowercase letters, digits and underscores, starting with a letter`;
    }
    if (/_f\d+$/.test(name)) {
        return `"${name}" ends in _f and a number, which the asset build reads as an animation frame - rename it`;
    }
    return null;
}
