import { describe, expect, it } from "vitest";
import { ClampByte, ColourHex, Hue, Luminance, PackColour, ParseColour, Rgb, SameColour, Saturation, Transparent, UnpackColour } from "./Colour";

describe("ClampByte", () => {
    it("rounds and clamps to 0..255, and treats NaN as 0", () => {
        expect(ClampByte(-5)).toBe(0);
        expect(ClampByte(300)).toBe(255);
        expect(ClampByte(127.5)).toBe(128);
        expect(ClampByte(0)).toBe(0);
        expect(ClampByte(255)).toBe(255);
        expect(ClampByte(NaN)).toBe(0);
        expect(ClampByte(Infinity)).toBe(255);
        expect(ClampByte(-Infinity)).toBe(0);
    });
});

describe("Rgb and Transparent", () => {
    it("defaults to opaque", () => {
        expect(Rgb(1, 2, 3)).toEqual({ r: 1, g: 2, b: 3, a: 255 });
        expect(Rgb(1, 2, 3, 4).a).toBe(4);
        expect(Transparent.a).toBe(0);
    });
});

describe("PackColour", () => {
    it("round-trips every channel, including colours whose top byte is set", () => {
        [Rgb(0, 0, 0, 0), Rgb(255, 255, 255, 255), Rgb(128, 1, 254, 77), Rgb(255, 0, 0, 255), Rgb(0, 0, 0, 255)].forEach(c => {
            const packed = PackColour(c);
            expect(packed).toBeGreaterThanOrEqual(0);
            expect(UnpackColour(packed)).toEqual(c);
        });
    });

    it("gives different numbers for different colours", () => {
        const seen = new Set<number>();
        for (let r = 0; r < 256; r += 51) for (let g = 0; g < 256; g += 51) for (let a = 0; a < 256; a += 85) seen.add(PackColour(Rgb(r, g, 7, a)));
        expect(seen.size).toBe(6 * 6 * 4);
    });
});

describe("SameColour", () => {
    it("compares all four channels", () => {
        expect(SameColour(Rgb(1, 2, 3, 4), Rgb(1, 2, 3, 4))).toBe(true);
        expect(SameColour(Rgb(1, 2, 3, 4), Rgb(1, 2, 3, 5))).toBe(false);
        expect(SameColour(Rgb(1, 2, 3), Rgb(1, 2, 4))).toBe(false);
    });
});

describe("ColourHex and ParseColour", () => {
    it("writes #rrggbb, or #rrggbbaa with alpha, with leading zeros", () => {
        expect(ColourHex(Rgb(255, 0, 10))).toBe("#ff000a");
        expect(ColourHex(Rgb(1, 2, 3, 4), true)).toBe("#01020304");
    });

    it("reads the four forms, with or without #, in any case", () => {
        expect(ParseColour("#ff000a")).toEqual(Rgb(255, 0, 10));
        expect(ParseColour("FF000A80")).toEqual(Rgb(255, 0, 10, 128));
        expect(ParseColour("#f0a")).toEqual(Rgb(255, 0, 170));
        expect(ParseColour("#f0a8")).toEqual(Rgb(255, 0, 170, 136));
        expect(ParseColour("  #abc  ")).toEqual(Rgb(170, 187, 204));
    });

    it("refuses anything else", () => {
        ["", "#", "#ff", "#fffff", "#fffffff", "#ggg", "red", "#ff00ff00ff", "rgb(1,2,3)"].forEach(text => {
            expect(ParseColour(text), text).toBeNull();
        });
    });

    it("round-trips every colour through hex with alpha", () => {
        [Rgb(0, 0, 0, 0), Rgb(255, 255, 255), Rgb(18, 52, 86, 120)].forEach(c => expect(ParseColour(ColourHex(c, true))).toEqual(c));
    });
});

describe("Luminance, Hue and Saturation", () => {
    it("orders greys and weights green most", () => {
        expect(Luminance(Rgb(0, 0, 0))).toBe(0);
        expect(Luminance(Rgb(255, 255, 255))).toBeCloseTo(255, 5);
        expect(Luminance(Rgb(0, 255, 0))).toBeGreaterThan(Luminance(Rgb(255, 0, 0)));
        expect(Luminance(Rgb(255, 0, 0))).toBeGreaterThan(Luminance(Rgb(0, 0, 255)));
        expect(Luminance(Rgb(10, 10, 10, 0))).toBe(Luminance(Rgb(10, 10, 10, 255)));
    });

    it("puts the primaries and secondaries round the wheel, and greys at 0", () => {
        expect(Hue(Rgb(255, 0, 0))).toBe(0);
        expect(Hue(Rgb(255, 255, 0))).toBe(60);
        expect(Hue(Rgb(0, 255, 0))).toBe(120);
        expect(Hue(Rgb(0, 255, 255))).toBe(180);
        expect(Hue(Rgb(0, 0, 255))).toBe(240);
        expect(Hue(Rgb(255, 0, 255))).toBe(300);
        expect(Hue(Rgb(255, 0, 128))).toBeCloseTo(330, 0);
        expect(Hue(Rgb(90, 90, 90))).toBe(0);
    });

    it("never goes negative or reaches 360", () => {
        for (let g = 0; g < 256; g += 15) for (let b = 0; b < 256; b += 15) {
            const h = Hue(Rgb(255, g, b));
            expect(h).toBeGreaterThanOrEqual(0);
            expect(h).toBeLessThan(360);
        }
    });

    it("measures saturation 0..1", () => {
        expect(Saturation(Rgb(0, 0, 0))).toBe(0);
        expect(Saturation(Rgb(128, 128, 128))).toBe(0);
        expect(Saturation(Rgb(255, 0, 0))).toBe(1);
        expect(Saturation(Rgb(200, 100, 100))).toBeCloseTo(0.5, 5);
    });
});
