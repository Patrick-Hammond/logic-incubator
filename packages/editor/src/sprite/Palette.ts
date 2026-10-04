/**
 * Palettes for the sprite editor: up to 256 colours with alpha. The default palette, matching a colour
 * to its nearest entry, extracting a palette from images (exactly when the colours fit, by median-cut
 * quantising when they don't), cleaning one up (dropping unused entries, sorting), and the file formats
 * a palette is saved in. Pure - no DOM - so it runs under the plain node test runner (see Palette.test.ts).
 *
 * Index 0 is, by convention, the transparent entry: an extracted or new palette puts it there when
 * there's room, which is what the eraser paints with.
 */

import { ClampByte, ColourHex, Hue, Luminance, PackColour, ParseColour, Rgba, Rgb, Transparent } from "./Colour";

export const MaxPaletteSize = 256;

export type PaletteSort = "none" | "luminance" | "hue" | "frequency";

/** A palette's colours (a fresh copy - callers own what they get). */
export const ClonePalette = (palette: ReadonlyArray<Rgba>): Rgba[] => palette.map(c => ({ r: c.r, g: c.g, b: c.b, a: c.a }));

/** The first entry that's fully transparent, or -1. */
export function TransparentIndex(palette: ReadonlyArray<Rgba>): number {
    for (let i = 0; i < palette.length; i++) {
        if (palette[i].a === 0) {
            return i;
        }
    }
    return -1;
}

/**
 * The 256-colour palette a new sprite starts with, laid out like the classic terminal palette: transparent,
 * the 15 system colours, a 6 x 6 x 6 colour cube, then 24 greys - so the first rows are the familiar colours
 * and every row after is an even sweep.
 */
export function DefaultPalette(): Rgba[] {
    const palette: Rgba[] = [{ ...Transparent }];
    [
        [128, 0, 0], [0, 128, 0], [128, 128, 0], [0, 0, 128], [128, 0, 128], [0, 128, 128], [192, 192, 192],
        [128, 128, 128], [255, 0, 0], [0, 255, 0], [255, 255, 0], [0, 0, 255], [255, 0, 255], [0, 255, 255], [255, 255, 255]
    ].forEach(([r, g, b]) => palette.push(Rgb(r, g, b)));
    const levels = [0, 95, 135, 175, 215, 255];
    for (let r = 0; r < 6; r++) {
        for (let g = 0; g < 6; g++) {
            for (let b = 0; b < 6; b++) {
                palette.push(Rgb(levels[r], levels[g], levels[b]));
            }
        }
    }
    for (let i = 0; i < 24; i++) {
        const grey = 8 + i * 10;
        palette.push(Rgb(grey, grey, grey));
    }
    return palette;
}

/**
 * The entry nearest `colour`. A fully transparent colour goes to the palette's transparent entry; anything
 * else keeps off transparent entries, which would make it vanish, unless they're all there is.
 */
export function NearestIndex(palette: ReadonlyArray<Rgba>, colour: Rgba): number {
    if (colour.a === 0) {
        const transparent = TransparentIndex(palette);
        if (transparent >= 0) {
            return transparent;
        }
    }
    let best = 0;
    let bestDistance = Number.MAX_VALUE;
    for (let i = 0; i < palette.length; i++) {
        const entry = palette[i];
        if (entry.a === 0 && colour.a > 0 && palette.some(c => c.a > 0)) {
            continue;
        }
        const dr = entry.r - colour.r;
        const dg = entry.g - colour.g;
        const db = entry.b - colour.b;
        const da = entry.a - colour.a;
        const distance = dr * dr + dg * dg + db * db + da * da;
        if (distance < bestDistance) {
            bestDistance = distance;
            best = i;
        }
    }
    return best;
}

/** Each RGBA pixel as the index of its entry in `palette` - the exact one when there is one, else the nearest. */
export function IndexImage(rgba: Uint8Array, palette: ReadonlyArray<Rgba>): Uint8Array {
    const exact = new Map<number, number>();
    palette.forEach((c, i) => {
        const key = PackColour(c);
        if (!exact.has(key)) {
            exact.set(key, i);
        }
    });
    const transparent = TransparentIndex(palette);
    const nearest = new Map<number, number>();
    const out = new Uint8Array(rgba.length / 4);
    for (let i = 0; i < out.length; i++) {
        const c: Rgba = { r: rgba[i * 4], g: rgba[i * 4 + 1], b: rgba[i * 4 + 2], a: rgba[i * 4 + 3] };
        if (c.a === 0 && transparent >= 0) {
            out[i] = transparent;
            continue;
        }
        const key = PackColour(c);
        let index = exact.get(key);
        if (index === undefined) {
            index = nearest.get(key);
            if (index === undefined) {
                index = NearestIndex(palette, c);
                nearest.set(key, index);
            }
        }
        out[i] = index;
    }
    return out;
}

/** `mapping[old]` -> new, applied to every index. */
export function RemapIndices(indices: Uint8Array, mapping: ArrayLike<number>): Uint8Array {
    const out = new Uint8Array(indices.length);
    for (let i = 0; i < indices.length; i++) {
        out[i] = mapping[indices[i]];
    }
    return out;
}

type Weighted = { colour: Rgba; count: number };

const CHANNELS: ReadonlyArray<keyof Rgba> = ["r", "g", "b", "a"];

/** Median-cut: splits the colours into at most `k` boxes (the widest box along its widest channel, at the population's median) and averages each. */
function Quantize(colours: Weighted[], k: number): Weighted[] {
    if (colours.length <= k) {
        return colours;
    }
    let boxes: Weighted[][] = [colours];
    const spread = (box: Weighted[]): { channel: keyof Rgba; range: number } => {
        let best = { channel: "r" as keyof Rgba, range: -1 };
        CHANNELS.forEach(channel => {
            let min = 255;
            let max = 0;
            box.forEach(w => {
                min = Math.min(min, w.colour[channel]);
                max = Math.max(max, w.colour[channel]);
            });
            if (max - min > best.range) {
                best = { channel, range: max - min };
            }
        });
        return best;
    };
    while (boxes.length < k) {
        let pick = -1;
        let pickRange = 0;
        let pickCount = 0;
        boxes.forEach((box, i) => {
            if (box.length < 2) {
                return;
            }
            const range = spread(box).range;
            const count = box.reduce((n, w) => n + w.count, 0);
            if (range > pickRange || (range === pickRange && count > pickCount)) {
                pick = i;
                pickRange = range;
                pickCount = count;
            }
        });
        if (pick < 0) {
            break;
        }
        const box = boxes[pick];
        const { channel } = spread(box);
        const sorted = box.slice().sort((a, b) => a.colour[channel] - b.colour[channel] || PackColour(a.colour) - PackColour(b.colour));
        const total = sorted.reduce((n, w) => n + w.count, 0);
        let running = 0;
        let cut = 1;
        for (let i = 0; i < sorted.length - 1; i++) {
            running += sorted[i].count;
            cut = i + 1;
            if (running * 2 >= total) {
                break;
            }
        }
        boxes = boxes.slice(0, pick).concat([sorted.slice(0, cut), sorted.slice(cut)], boxes.slice(pick + 1));
    }
    return boxes.map(box => {
        const count = box.reduce((n, w) => n + w.count, 0);
        const mean = (channel: keyof Rgba) => ClampByte(box.reduce((sum, w) => sum + w.colour[channel] * w.count, 0) / count);
        return { colour: { r: mean("r"), g: mean("g"), b: mean("b"), a: mean("a") }, count };
    });
}

function Sorted(entries: Weighted[], sort: PaletteSort): Weighted[] {
    const list = entries.slice();
    switch (sort) {
        case "luminance":
            return list.sort((a, b) => Luminance(a.colour) - Luminance(b.colour) || PackColour(a.colour) - PackColour(b.colour));
        case "hue":
            return list.sort((a, b) => Hue(a.colour) - Hue(b.colour) || Luminance(a.colour) - Luminance(b.colour) || PackColour(a.colour) - PackColour(b.colour));
        case "frequency":
            return list.sort((a, b) => b.count - a.count || PackColour(a.colour) - PackColour(b.colour));
        default:
            return list;
    }
}

/**
 * A palette for these RGBA images. Every fully transparent pixel counts as one colour, put at index 0 whenever
 * there's room (the eraser's colour, even if the image has no transparency yet) - and when colours have to be
 * reduced, there's always room. If the colours fit in `max` they're
 * all kept exactly - `exact` is true; if not they're reduced by median-cut to what fits, and `exact` is false.
 * `sort` orders the rest: by brightness, round the colour wheel, most-used first, or as first seen.
 */
export function ExtractPalette(images: ReadonlyArray<Uint8Array>, max: number = MaxPaletteSize, sort: PaletteSort = "luminance"): { palette: Rgba[]; exact: boolean } {
    const counts = new Map<number, Weighted>();
    let transparentSeen = false;
    images.forEach(rgba => {
        for (let i = 0; i + 3 < rgba.length; i += 4) {
            if (rgba[i + 3] === 0) {
                transparentSeen = true;
                continue;
            }
            const c: Rgba = { r: rgba[i], g: rgba[i + 1], b: rgba[i + 2], a: rgba[i + 3] };
            const key = PackColour(c);
            const known = counts.get(key);
            if (known) {
                known.count++;
            } else {
                counts.set(key, { colour: c, count: 1 });
            }
        }
    });
    let solid: Weighted[] = [];
    counts.forEach(w => solid.push(w));
    // Slot 0 is transparent - the eraser's colour - unless the colours fill every slot exactly and there's no transparency to
    // find room for. When they have to be reduced anyway, giving up one slot in 256 for it costs next to nothing.
    const reserve = max < 2 || (solid.length === max && !transparentSeen) ? 0 : 1;
    const budget = Math.max(1, max - reserve);
    let exact = true;
    if (solid.length > budget) {
        solid = Quantize(solid, budget);
        exact = false;
    }
    const palette: Rgba[] = reserve ? [{ ...Transparent }] : [];
    Sorted(solid, sort).forEach(w => palette.push(w.colour));
    return { palette, exact };
}

/**
 * The palette without the entries `used` doesn't flag (always keeping a transparent entry if it has one),
 * and `mapping[old] = new` for the survivors - apply it with `RemapIndices`.
 */
export function CompactPalette(palette: ReadonlyArray<Rgba>, used: ReadonlyArray<boolean>): { palette: Rgba[]; mapping: Uint8Array } {
    const mapping = new Uint8Array(256);
    const out: Rgba[] = [];
    const transparent = TransparentIndex(palette);
    palette.forEach((c, i) => {
        if (used[i] || i === transparent) {
            mapping[i] = out.length;
            out.push({ ...c });
        }
    });
    return { palette: out, mapping };
}

/** The palette reordered (transparent entries first, then by `sort`), with `mapping[old] = new`. `counts[i]` is how often entry i is used, for "frequency". */
export function SortPalette(palette: ReadonlyArray<Rgba>, sort: PaletteSort, counts?: ReadonlyArray<number>): { palette: Rgba[]; mapping: Uint8Array } {
    const entries = palette.map((c, i) => ({ colour: c, count: counts ? counts[i] || 0 : 0, index: i }));
    const transparent = entries.filter(e => e.colour.a === 0);
    const rest = entries.filter(e => e.colour.a !== 0);
    const orderedRest = sort === "none" ? rest : (Sorted(rest, sort) as typeof rest);
    const order = transparent.concat(orderedRest);
    const mapping = new Uint8Array(256);
    order.forEach((e, i) => (mapping[e.index] = i));
    return { palette: order.map(e => ({ ...e.colour })), mapping };
}

// ---------------------------------------------------------------------------------------------- files

export type PaletteFormat = "json" | "pal" | "gpl";

/** `.json` keeps alpha; `.pal` (JASC) and `.gpl` (GIMP) are the formats other tools read, and have no alpha. */
export function FormatPalette(format: PaletteFormat, name: string, colours: ReadonlyArray<Rgba>): string {
    switch (format) {
        case "pal":
            return ["JASC-PAL", "0100", String(colours.length)].concat(colours.map(c => `${c.r} ${c.g} ${c.b}`)).join("\r\n") + "\r\n";
        case "gpl":
            return ["GIMP Palette", "Name: " + name, "Columns: 16", "#"].concat(colours.map((c, i) => `${String(c.r).padStart(3)} ${String(c.g).padStart(3)} ${String(c.b).padStart(3)}\tIndex ${i}`)).join("\n") + "\n";
        default:
            return JSON.stringify({ name, colours: colours.map(c => ColourHex(c, true)) }, null, 2) + "\n";
    }
}

export type ParsedPalette = { name: string | null; colours: Rgba[]; truncated: boolean };

function Finish(name: string | null, colours: Rgba[]): ParsedPalette {
    if (!colours.length) {
        throw new Error("That palette has no colours in it.");
    }
    return { name, colours: colours.slice(0, MaxPaletteSize), truncated: colours.length > MaxPaletteSize };
}

/** Reads a palette file by what's in it: JASC-PAL, GIMP .gpl, or this editor's JSON (or a bare list of colours). Throws a readable error for anything else. */
export function ParsePalette(text: string): ParsedPalette {
    const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
    const first = (lines[0] || "").trim();
    if (first === "JASC-PAL") {
        const count = parseInt((lines[2] || "").trim(), 10);
        const colours: Rgba[] = [];
        lines.slice(3).forEach(line => {
            const m = /^\s*(\d+)\s+(\d+)\s+(\d+)/.exec(line);
            if (m && (isNaN(count) || colours.length < count)) {
                colours.push(Rgb(ClampByte(+m[1]), ClampByte(+m[2]), ClampByte(+m[3])));
            }
        });
        return Finish(null, colours);
    }
    if (first === "GIMP Palette") {
        let name: string | null = null;
        const colours: Rgba[] = [];
        lines.slice(1).forEach(line => {
            const named = /^Name:\s*(.*)$/.exec(line.trim());
            if (named) {
                name = named[1] || null;
                return;
            }
            const m = /^\s*(\d+)\s+(\d+)\s+(\d+)/.exec(line);
            if (m && line.trim()[0] !== "#") {
                colours.push(Rgb(ClampByte(+m[1]), ClampByte(+m[2]), ClampByte(+m[3])));
            }
        });
        return Finish(name, colours);
    }
    if (first[0] === "{" || first[0] === "[") {
        const parsed = TryParseJson(text);
        if (!parsed.ok) {
            throw new Error("That palette file isn't valid JSON.");
        }
        const data = parsed.value;
        const list = Array.isArray(data) ? data : (data as { colours?: unknown }).colours;
        if (!Array.isArray(list)) {
            throw new Error("That JSON has no list of colours.");
        }
        const colours = list.map((item: unknown, i: number) => {
            const parsed = typeof item === "string" ? ParseColour(item) : item && typeof item === "object" ? FromObject(item as Partial<Rgba>) : null;
            if (!parsed) {
                throw new Error(`Colour ${i + 1} in the palette isn't a colour (use "#rrggbb" or "#rrggbbaa").`);
            }
            return parsed;
        });
        const name = !Array.isArray(data) && typeof (data as { name?: unknown }).name === "string" ? (data as { name: string }).name : null;
        return Finish(name, colours);
    }
    throw new Error("That doesn't look like a palette file (JASC .pal, GIMP .gpl or JSON).");
}

function FromObject(item: Partial<Rgba>): Rgba | null {
    const ok = (v: unknown) => typeof v === "number" && isFinite(v);
    return ok(item.r) && ok(item.g) && ok(item.b) ? { r: ClampByte(item.r), g: ClampByte(item.g), b: ClampByte(item.b), a: ok(item.a) ? ClampByte(item.a) : 255 } : null;
}

function TryParseJson(text: string): { ok: true; value: unknown } | { ok: false } {
    try {
        return { ok: true, value: JSON.parse(text) };
    } catch {
        return { ok: false };
    }
}
