import { describe, expect, it } from "vitest";
import { PackColour, Rgb, Rgba } from "./Colour";
import {
    ClonePalette, CompactPalette, DefaultPalette, ExtractPalette, FormatPalette, IndexImage, MaxPaletteSize, NearestIndex, ParsePalette,
    RemapIndices, SortPalette, TransparentIndex
} from "./Palette";

/** RGBA bytes for a list of colours, one pixel each. */
const Pixels = (colours: Rgba[]): Uint8Array => Uint8Array.from(colours.flatMap(c => [c.r, c.g, c.b, c.a]));
const T: Rgba = { r: 0, g: 0, b: 0, a: 0 };

describe("DefaultPalette", () => {
    const palette = DefaultPalette();

    it("is 256 entries - transparent, 15 system colours, a 6x6x6 cube, 24 greys", () => {
        expect(palette).toHaveLength(MaxPaletteSize);
        expect(palette[0]).toEqual(T);
        expect(palette[15]).toEqual(Rgb(255, 255, 255));
        expect(palette[16]).toEqual(Rgb(0, 0, 0));
        expect(palette[16 + 215]).toEqual(Rgb(255, 255, 255));
        expect(palette[16 + 6]).toEqual(Rgb(0, 95, 0)); // g steps next after b
        expect(palette[16 + 36]).toEqual(Rgb(95, 0, 0)); // then r
        expect(palette[232]).toEqual(Rgb(8, 8, 8));
        expect(palette[255]).toEqual(Rgb(238, 238, 238));
    });

    it("has only the one transparent entry, and every other entry opaque", () => {
        expect(palette.filter(c => c.a === 0)).toHaveLength(1);
        expect(palette.slice(1).every(c => c.a === 255)).toBe(true);
    });

    it("hands out a fresh palette each time, so editing one can't change the next", () => {
        const a = DefaultPalette();
        a[5].r = 1;
        expect(DefaultPalette()[5].r).not.toBe(1);
        const copy = ClonePalette(palette);
        copy[3].g = 99;
        expect(palette[3].g).not.toBe(99);
    });
});

describe("NearestIndex and IndexImage", () => {
    const palette = [T, Rgb(255, 0, 0), Rgb(0, 255, 0), Rgb(0, 0, 255, 128)];

    it("finds an exact entry, else the nearest", () => {
        expect(NearestIndex(palette, Rgb(0, 255, 0))).toBe(2);
        expect(NearestIndex(palette, Rgb(250, 10, 10))).toBe(1);
        expect(NearestIndex(palette, Rgb(10, 240, 10))).toBe(2);
        expect(NearestIndex(palette, Rgb(0, 0, 250, 120))).toBe(3);
    });

    it("sends a fully transparent colour to the transparent entry, and never a visible colour there", () => {
        expect(NearestIndex(palette, { r: 200, g: 100, b: 50, a: 0 })).toBe(0);
        expect(NearestIndex(palette, Rgb(1, 1, 1))).not.toBe(0);
    });

    it("does use a transparent entry when it's all the palette has", () => {
        expect(NearestIndex([T], Rgb(9, 9, 9))).toBe(0);
    });

    it("indexes an image, exactly where it can", () => {
        const image = Pixels([Rgb(255, 0, 0), T, Rgb(0, 255, 0), Rgb(0, 0, 255, 128), { r: 7, g: 8, b: 9, a: 0 }]);
        expect(Array.from(IndexImage(image, palette))).toEqual([1, 0, 2, 3, 0]);
    });

    it("finds the first of two identical entries", () => {
        expect(Array.from(IndexImage(Pixels([Rgb(5, 5, 5)]), [T, Rgb(5, 5, 5), Rgb(5, 5, 5)]))).toEqual([1]);
    });
});

describe("TransparentIndex", () => {
    it("is the first fully transparent entry, or -1", () => {
        expect(TransparentIndex([Rgb(1, 1, 1), { r: 1, g: 1, b: 1, a: 0 }, T])).toBe(1);
        expect(TransparentIndex([Rgb(1, 1, 1), Rgb(2, 2, 2, 5)])).toBe(-1);
    });
});

describe("ExtractPalette", () => {
    const red = Rgb(255, 0, 0), green = Rgb(0, 255, 0), blue = Rgb(0, 0, 255);

    it("keeps every colour exactly when they fit, with transparent at 0", () => {
        const { palette, exact } = ExtractPalette([Pixels([red, green, T, blue, red])]);
        expect(exact).toBe(true);
        expect(palette[0]).toEqual(T);
        expect(palette).toHaveLength(4);
        expect(palette.slice(1).map(PackColour).sort()).toEqual([red, green, blue].map(PackColour).sort());
    });

    it("collapses every transparent pixel to one entry, whatever colour it carried", () => {
        const { palette } = ExtractPalette([Pixels([{ r: 9, g: 9, b: 9, a: 0 }, { r: 1, g: 2, b: 3, a: 0 }, red])]);
        expect(palette.filter(c => c.a === 0)).toHaveLength(1);
        expect(palette).toHaveLength(2);
    });

    it("reserves the transparent slot even when the image has no transparency, so the eraser has a colour", () => {
        const { palette } = ExtractPalette([Pixels([red, green])]);
        expect(palette[0].a).toBe(0);
        expect(palette).toHaveLength(3);
    });

    it("keeps a translucent colour apart from the opaque one of the same RGB", () => {
        const { palette } = ExtractPalette([Pixels([red, Rgb(255, 0, 0, 100)])]);
        expect(palette.filter(c => c.r === 255)).toHaveLength(2);
    });

    it("looks across every image it's given - an animation's frames share one palette", () => {
        const { palette } = ExtractPalette([Pixels([red]), Pixels([blue]), Pixels([red, green])]);
        expect(palette).toHaveLength(4);
    });

    it("sorts by brightness, by hue, by use, or as first seen", () => {
        const dark = Rgb(10, 10, 10), mid = Rgb(120, 120, 120), light = Rgb(240, 240, 240);
        const image = Pixels([mid, mid, mid, light, dark, dark]);
        expect(ExtractPalette([image], 256, "luminance").palette.slice(1)).toEqual([dark, mid, light]);
        expect(ExtractPalette([image], 256, "frequency").palette.slice(1)).toEqual([mid, dark, light]);
        expect(ExtractPalette([image], 256, "none").palette.slice(1)).toEqual([mid, light, dark]);
        const hues = ExtractPalette([Pixels([blue, red, green])], 256, "hue").palette.slice(1);
        expect(hues).toEqual([red, green, blue]);
    });

    it("keeps 256 opaque colours whole when there's no transparency to find room for", () => {
        const colours = Array.from({ length: 256 }, (_, i) => Rgb(i, 255 - i, (i * 3) & 255));
        const { palette, exact } = ExtractPalette([Pixels(colours)]);
        expect(exact).toBe(true);
        expect(palette).toHaveLength(256);
        expect(palette.every(c => c.a === 255)).toBe(true);
    });

    it("gives up one slot to transparency when there are 256 opaque colours and some transparent pixels - so reduces them", () => {
        const colours = Array.from({ length: 256 }, (_, i) => Rgb(i, 255 - i, (i * 3) & 255));
        const { palette, exact } = ExtractPalette([Pixels(colours.concat([T]))]);
        expect(palette).toHaveLength(256);
        expect(palette[0].a).toBe(0);
        expect(exact).toBe(false);
    });

    it("reduces too many colours by median cut to what fits - never more, and close to what was there", () => {
        const colours: Rgba[] = [];
        for (let i = 0; i < 1024; i++) colours.push(Rgb(i & 255, (i * 7) & 255, (i >> 2) & 255));
        const unique = Array.from(new Set(colours.map(PackColour)));
        expect(unique.length).toBeGreaterThan(256);
        const { palette, exact } = ExtractPalette([Pixels(colours)], 64);
        expect(exact).toBe(false);
        expect(palette.length).toBeLessThanOrEqual(64);
        expect(palette[0].a).toBe(0);
        let worst = 0;
        colours.forEach(c => {
            const n = palette[NearestIndex(palette, c)];
            worst = Math.max(worst, Math.abs(n.r - c.r) + Math.abs(n.g - c.g) + Math.abs(n.b - c.b));
        });
        expect(worst).toBeLessThan(450);
    });

    it("gets a good palette from a smooth gradient: a few colours stand in for many", () => {
        const gradient: Rgba[] = [];
        for (let i = 0; i < 256; i++) gradient.push(Rgb(i, i, i));
        const { palette } = ExtractPalette([Pixels(gradient)], 17);
        expect(palette).toHaveLength(17);
        const greys = palette.slice(1).map(c => c.r).sort((a, b) => a - b);
        expect(greys[0]).toBeLessThan(20);
        expect(greys[greys.length - 1]).toBeGreaterThan(235);
        // evenly spread: no two neighbours more than ~2.5 steps of the ideal 16 apart
        greys.slice(1).forEach((g, i) => expect(g - greys[i]).toBeLessThan(40));
    });

    it("gives the same palette every time for the same image", () => {
        const colours: Rgba[] = [];
        for (let i = 0; i < 500; i++) colours.push(Rgb((i * 37) & 255, (i * 91) & 255, (i * 13) & 255));
        const a = ExtractPalette([Pixels(colours)], 32).palette;
        const b = ExtractPalette([Pixels(colours)], 32).palette;
        expect(a).toEqual(b);
    });

    it("copes with an empty image or no images", () => {
        expect(ExtractPalette([]).palette).toEqual([T]);
        expect(ExtractPalette([new Uint8Array(0)]).exact).toBe(true);
    });
});

describe("CompactPalette and SortPalette", () => {
    const palette = [T, Rgb(10, 10, 10), Rgb(200, 0, 0), Rgb(0, 0, 90), Rgb(250, 250, 250)];

    it("drops the entries nothing uses, always keeping transparent, and says where the rest went", () => {
        const { palette: kept, mapping } = CompactPalette(palette, [false, false, true, false, true]);
        expect(kept).toEqual([T, Rgb(200, 0, 0), Rgb(250, 250, 250)]);
        expect([mapping[0], mapping[2], mapping[4]]).toEqual([0, 1, 2]);
        expect(Array.from(RemapIndices(Uint8Array.from([2, 4, 0, 2]), mapping))).toEqual([1, 2, 0, 1]);
    });

    it("sorts, transparent first, and the mapping keeps every pixel's colour", () => {
        const sorted = SortPalette(palette, "luminance");
        expect(sorted.palette[0]).toEqual(T);
        // (10,10,10) is a hair darker than (0,0,90) by perceived brightness
        expect(sorted.palette.slice(1)).toEqual([Rgb(10, 10, 10), Rgb(0, 0, 90), Rgb(200, 0, 0), Rgb(250, 250, 250)]);
        const before = Uint8Array.from([4, 1, 2, 3, 0]);
        const after = RemapIndices(before, sorted.mapping);
        before.forEach((old, i) => expect(sorted.palette[after[i]]).toEqual(palette[old]));
    });

    it("sorts most-used first with counts", () => {
        const sorted = SortPalette(palette, "frequency", [100, 1, 9, 50, 3]);
        expect(sorted.palette[0]).toEqual(T);
        expect(sorted.palette[1]).toEqual(Rgb(0, 0, 90));
        expect(sorted.palette[2]).toEqual(Rgb(200, 0, 0));
    });

    it("leaves the order alone for 'none', but still puts transparent first", () => {
        const odd = [Rgb(1, 1, 1), T, Rgb(2, 2, 2)];
        expect(SortPalette(odd, "none").palette).toEqual([T, Rgb(1, 1, 1), Rgb(2, 2, 2)]);
    });
});

describe("palette files", () => {
    const colours = [T, Rgb(255, 0, 0), Rgb(10, 20, 30, 128), Rgb(1, 2, 3)];

    it("round-trips JSON, alpha included, with its name", () => {
        const back = ParsePalette(FormatPalette("json", "swamp", colours));
        expect(back.name).toBe("swamp");
        expect(back.colours).toEqual(colours);
        expect(back.truncated).toBe(false);
    });

    it("round-trips JASC .pal (no alpha) and GIMP .gpl, with its name", () => {
        const opaque = colours.map(c => Rgb(c.r, c.g, c.b));
        const pal = ParsePalette(FormatPalette("pal", "x", colours));
        expect(pal.colours).toEqual(opaque);
        const gpl = ParsePalette(FormatPalette("gpl", "dusk", colours));
        expect(gpl.name).toBe("dusk");
        expect(gpl.colours).toEqual(opaque);
    });

    it("writes JASC the way other tools expect it", () => {
        const text = FormatPalette("pal", "x", [Rgb(1, 2, 3), Rgb(4, 5, 6)]);
        expect(text.split("\r\n").slice(0, 5)).toEqual(["JASC-PAL", "0100", "2", "1 2 3", "4 5 6"]);
    });

    it("reads a real-world .gpl with comments, a name and columns", () => {
        const text = "GIMP Palette\nName: Sweetie 16\nColumns: 4\n# a comment\n 26  28  44\tdark\n 93  39  93\tplum\n";
        const parsed = ParsePalette(text);
        expect(parsed.name).toBe("Sweetie 16");
        expect(parsed.colours).toEqual([Rgb(26, 28, 44), Rgb(93, 39, 93)]);
    });

    it("reads a bare JSON list of hex strings or objects", () => {
        expect(ParsePalette('["#ff0000", "#00ff0080", "abc"]').colours).toEqual([Rgb(255, 0, 0), Rgb(0, 255, 0, 128), Rgb(170, 187, 204)]);
        expect(ParsePalette('{"colours": [{"r": 1, "g": 2, "b": 3}, {"r": 4, "g": 5, "b": 6, "a": 7}]}').colours).toEqual([Rgb(1, 2, 3), Rgb(4, 5, 6, 7)]);
    });

    it("keeps the first 256 of a longer palette and says it did", () => {
        const many = Array.from({ length: 300 }, (_, i) => Rgb(i & 255, 0, 0));
        const parsed = ParsePalette(FormatPalette("pal", "big", many));
        expect(parsed.colours).toHaveLength(256);
        expect(parsed.truncated).toBe(true);
    });

    it("says what's wrong with a file it can't use", () => {
        expect(() => ParsePalette("hello")).toThrow(/doesn't look like a palette/);
        expect(() => ParsePalette("{ nope")).toThrow(/valid JSON/);
        expect(() => ParsePalette('{"colours": 4}')).toThrow(/no list/);
        expect(() => ParsePalette('["#ff0000", "red"]')).toThrow(/Colour 2/);
        expect(() => ParsePalette("JASC-PAL\n0100\n0\n")).toThrow(/no colours/);
        expect(() => ParsePalette("[]")).toThrow(/no colours/);
    });
});
