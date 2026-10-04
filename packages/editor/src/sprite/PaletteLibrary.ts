/**
 * The palettes you can load into a sprite: a few built in, and your own, saved by name in the browser's local storage
 * (so they're there for every sprite - and in a private window, or with storage full or blocked, they still work for the
 * session, they just don't outlive it). Pure apart from the storage it's handed, so it runs under the plain node test
 * runner (see PaletteLibrary.test.ts).
 */

import { ClampByte, ColourHex, ParseColour, Rgb, Rgba, Transparent } from "./Colour";
import { ClonePalette, DefaultPalette, MaxPaletteSize } from "./Palette";

/** The part of `Storage` the library uses. */
export type StorageLike = {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
};

export const MaxPaletteNameLength = 40;
export const StorageKey = "sprite-editor.palettes";

export type SavedPalette = { name: string; colours: Rgba[] };

export type SaveResult = {
    ok: boolean;
    /** Why not, when it isn't ok. */
    error?: string;
    /** True if a palette of that name was there and has been replaced. */
    replaced?: boolean;
    /** False if it's saved for this session only (storage was full or blocked). */
    persisted?: boolean;
};

const Hex = (list: string[]): Rgba[] => list.map(h => ParseColour(h));

/** Palettes that ship with the editor: they can be loaded but not changed or deleted. Only the default has a transparent entry (see `WithTransparentFirst`). */
export const BuiltInPalettes: ReadonlyArray<SavedPalette> = [
    { name: "Default (256)", colours: DefaultPalette() },
    {
        name: "PICO-8",
        colours: Hex(["#000000", "#1d2b53", "#7e2553", "#008751", "#ab5236", "#5f574f", "#c2c3c7", "#fff1e8", "#ff004d", "#ffa300", "#ffec27", "#00e436", "#29adff", "#83769c", "#ff77a8", "#ffccaa"])
    },
    { name: "Game Boy", colours: Hex(["#0f380f", "#306230", "#8bac0f", "#9bbc0f"]) },
    {
        name: "EGA (16)",
        colours: Hex(["#000000", "#0000aa", "#00aa00", "#00aaaa", "#aa0000", "#aa00aa", "#aa5500", "#aaaaaa", "#555555", "#5555ff", "#55ff55", "#55ffff", "#ff5555", "#ff55ff", "#ffff55", "#ffffff"])
    },
    { name: "Greys (16)", colours: Array.from({ length: 16 }, (_, i) => Rgb(i * 17, i * 17, i * 17)) },
    {
        name: "Web safe (216)",
        colours: (() => {
            const out: Rgba[] = [];
            for (let r = 0; r < 6; r++) for (let g = 0; g < 6; g++) for (let b = 0; b < 6; b++) out.push(Rgb(r * 51, g * 51, b * 51));
            return out;
        })()
    }
];

/** The colours with a transparent entry in front, unless they have one already (a palette from outside - .pal, .gpl, built in - rarely does). Capped at 256. */
export function WithTransparentFirst(colours: ReadonlyArray<Rgba>): Rgba[] {
    if (colours.some(c => c.a === 0)) {
        return ClonePalette(colours).slice(0, MaxPaletteSize);
    }
    return [{ ...Transparent }].concat(ClonePalette(colours)).slice(0, MaxPaletteSize);
}

/** `name` trimmed and checked, or the problem with it. */
export function CheckPaletteName(name: string): { name: string; error?: undefined } | { name?: undefined; error: string } {
    const trimmed = name.replace(/\s+/g, " ").trim();
    if (!trimmed) {
        return { error: "Give the palette a name." };
    }
    if (trimmed.length > MaxPaletteNameLength) {
        return { error: `Names are up to ${MaxPaletteNameLength} characters.` };
    }
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f]/.test(trimmed)) {
        return { error: "That name has characters that can't be used." };
    }
    return { name: trimmed };
}

const Normal = (name: string) => name.toLowerCase();

export class PaletteLibrary {
    private palettes: SavedPalette[] = [];

    constructor(private storage: StorageLike | null, private key: string = StorageKey) {
        this.palettes = this.Read();
    }

    /** The built-in palettes, then yours by name. */
    List(): SavedPalette[] {
        const own = this.palettes.slice().sort((a, b) => (Normal(a.name) < Normal(b.name) ? -1 : Normal(a.name) > Normal(b.name) ? 1 : 0));
        return BuiltInPalettes.map(p => ({ name: p.name, colours: ClonePalette(p.colours) })).concat(own.map(p => ({ name: p.name, colours: ClonePalette(p.colours) })));
    }

    IsBuiltIn(name: string): boolean {
        return BuiltInPalettes.some(p => Normal(p.name) === Normal(name));
    }

    Get(name: string): SavedPalette | null {
        return this.List().filter(p => Normal(p.name) === Normal(name))[0] || null;
    }

    /** Saves under `name`, replacing one of the same name (ignoring case) of yours. Built-in names are taken. */
    Save(name: string, colours: ReadonlyArray<Rgba>): SaveResult {
        const checked = CheckPaletteName(name);
        if (checked.error) {
            return { ok: false, error: checked.error };
        }
        if (this.IsBuiltIn(checked.name)) {
            return { ok: false, error: `"${checked.name}" is a built-in palette - pick another name.` };
        }
        if (!colours.length || colours.length > MaxPaletteSize) {
            return { ok: false, error: `A palette has between 1 and ${MaxPaletteSize} colours.` };
        }
        const copy = ClonePalette(colours.map(c => ({ r: ClampByte(c.r), g: ClampByte(c.g), b: ClampByte(c.b), a: ClampByte(c.a) })));
        const at = this.palettes.findIndex(p => Normal(p.name) === Normal(checked.name));
        if (at >= 0) {
            this.palettes[at] = { name: checked.name, colours: copy };
        } else {
            this.palettes.push({ name: checked.name, colours: copy });
        }
        return { ok: true, replaced: at >= 0, persisted: this.Write() };
    }

    /** Deletes one of yours; false if there isn't one of that name. */
    Delete(name: string): boolean {
        const before = this.palettes.length;
        this.palettes = this.palettes.filter(p => Normal(p.name) !== Normal(name));
        if (this.palettes.length === before) {
            return false;
        }
        this.Write();
        return true;
    }

    Rename(from: string, to: string): SaveResult {
        const checked = CheckPaletteName(to);
        if (checked.error) {
            return { ok: false, error: checked.error };
        }
        const at = this.palettes.findIndex(p => Normal(p.name) === Normal(from));
        if (at < 0) {
            return { ok: false, error: "There's no saved palette called that." };
        }
        const clash = Normal(checked.name) !== Normal(from) && (this.IsBuiltIn(checked.name) || this.palettes.some(p => Normal(p.name) === Normal(checked.name)));
        if (clash) {
            return { ok: false, error: `There's already a palette called "${checked.name}".` };
        }
        this.palettes[at] = { name: checked.name, colours: this.palettes[at].colours };
        return { ok: true, persisted: this.Write() };
    }

    /** A name for a new palette that doesn't clash with any: "Palette", "Palette 2", "Palette 3"... */
    UnusedName(base = "Palette"): string {
        const taken = this.List().map(p => Normal(p.name));
        let name = base;
        for (let n = 2; taken.indexOf(Normal(name)) >= 0; n++) {
            name = `${base} ${n}`;
        }
        return name;
    }

    // ------------------------------------------------------------------------------------------ storage

    private Read(): SavedPalette[] {
        if (!this.storage) {
            return [];
        }
        let raw: string | null;
        try {
            raw = this.storage.getItem(this.key);
        } catch {
            return [];
        }
        if (!raw) {
            return [];
        }
        try {
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) {
                return [];
            }
            const out: SavedPalette[] = [];
            parsed.forEach(item => {
                if (!item || typeof item.name !== "string" || !Array.isArray(item.colours)) {
                    return;
                }
                const checked = CheckPaletteName(item.name);
                const colours = item.colours.map((h: unknown) => (typeof h === "string" ? ParseColour(h) : null));
                if (checked.error || !colours.length || colours.length > MaxPaletteSize || colours.some((c: Rgba | null) => !c)) {
                    return;
                }
                if (this.IsBuiltIn(checked.name) || out.some(p => Normal(p.name) === Normal(checked.name))) {
                    return;
                }
                out.push({ name: checked.name, colours });
            });
            return out;
        } catch {
            // Damaged data is better dropped than allowed to break the editor.
            return [];
        }
    }

    /** Writes the library; false if the browser wouldn't take it (full, blocked) - the palettes still work until the page closes. */
    private Write(): boolean {
        if (!this.storage) {
            return false;
        }
        try {
            this.storage.setItem(this.key, JSON.stringify(this.palettes.map(p => ({ name: p.name, colours: p.colours.map(c => ColourHex(c, true)) }))));
            return true;
        } catch {
            return false;
        }
    }
}
