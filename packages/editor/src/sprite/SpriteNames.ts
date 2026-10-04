/**
 * Names for sprites and the files their frames are saved in. These mirror the asset pipeline's rules
 * (packages/lib/scripts/assets/ids.js - SpriteNames.test.ts holds the two together): a sprite's name is lowercase letters, digits and
 * underscores, one frame is `<name>.png`, several are `<name>_f0.png`, `<name>_f1.png`... and so a name must not itself
 * end in `_f<number>` or the pipeline would read it as a frame of something else. Pure - no DOM.
 */

export const MaxNameLength = 48;

const LocalName = /^[a-z0-9_]+$/;
const FrameSuffix = /_f\d+$/;

/** How the pipeline normalises a file's base name into an id: lowercase, `-` and spaces to `_`. */
export function NormalizeSpriteName(raw: string): string {
    return raw.toLowerCase().replace(/[-\s]/g, "_");
}

/** What's wrong with `name` as a sprite's name, or null if it's fine. */
export function ValidateSpriteName(name: string): string | null {
    if (!name) {
        return "Give the sprite a name.";
    }
    if (name.length > MaxNameLength) {
        return `Names are up to ${MaxNameLength} characters.`;
    }
    if (!LocalName.test(name)) {
        const bad = name.replace(/[a-z0-9_]/g, "").split("").filter((c, i, all) => all.indexOf(c) === i);
        return `Use only lowercase letters, digits and underscores (not ${bad.map(c => (c === " " ? "a space" : '"' + c + '"')).join(", ")}).`;
    }
    if (FrameSuffix.test(name)) {
        return 'A name can\'t end in "_f" and a number - that marks an animation frame. Try "' + name.replace(FrameSuffix, "") + '" or "' + name + '_a".';
    }
    return null;
}

/** A valid name as close as possible to whatever was typed (may be empty if nothing usable was). */
export function SuggestSpriteName(raw: string): string {
    let name = NormalizeSpriteName(raw).replace(/[^a-z0-9_]+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
    name = name.slice(0, MaxNameLength);
    while (FrameSuffix.test(name)) {
        name = name.replace(FrameSuffix, "");
    }
    return name.replace(/^_+|_+$/g, "");
}

/** The file names for a sprite of `count` frames: just `name.png`, or one `name_f<N>.png` per frame. */
export function FrameFileNames(name: string, count: number): string[] {
    if (count <= 1) {
        return [name + ".png"];
    }
    const files: string[] = [];
    for (let i = 0; i < count; i++) {
        files.push(`${name}_f${i}.png`);
    }
    return files;
}

/** Which sprite a file is a frame of: `foo_f2.png` is frame 2 of "foo", `foo.png` the one frame of "foo". Null if it isn't a PNG. */
export function ParseFrameFile(file: string): { name: string; index: number | null } | null {
    const match = /^(.+)\.png$/i.exec(file);
    if (!match) {
        return null;
    }
    const base = NormalizeSpriteName(match[1]);
    const frame = /^(.+)_f(\d+)$/.exec(base);
    return frame ? { name: frame[1], index: parseInt(frame[2], 10) } : { name: base, index: null };
}
