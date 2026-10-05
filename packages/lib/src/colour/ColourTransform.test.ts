import { describe, expect, it } from "vitest";
import { Darken, ShiftHue } from "./ColourTransform";

/** The three channels of a packed colour. */
const Channels = (colour: number) => [(colour >> 16) & 0xFF, (colour >> 8) & 0xFF, colour & 0xFF];

describe("Darken", () => {
    it("takes white down to grey by the amount asked", () => {
        expect(Darken(0xFFFFFF, 0.5)).toBe(0x808080);
        expect(Darken(0xFFFFFF, 0.25)).toBe(0xBFBFBF);
    });

    it("scales every channel together, so the colour keeps its hue", () => {
        expect(Darken(0xFF8040, 0.25)).toBe(0xBF6030);
        expect(Darken(0xFF0000, 0.5)).toBe(0x800000);
    });

    it("leaves a colour alone at 0 and makes it black at 1", () => {
        [0xFFFFFF, 0xFF8040, 0x123456, 0x000000].forEach(colour => {
            expect(Darken(colour, 0)).toBe(colour);
            expect(Darken(colour, 1)).toBe(0x000000);
        });
    });

    it("counts an amount outside 0..1 as the nearest end of it, and one that isn't a number as 0", () => {
        expect(Darken(0xFF8040, -3)).toBe(0xFF8040);
        expect(Darken(0xFF8040, 7)).toBe(0x000000);
        expect(Darken(0xFF8040, NaN)).toBe(0xFF8040);
    });

    it("never makes a channel brighter", () => {
        for (let amount = 0; amount <= 1; amount += 0.1) {
            const before = Channels(0x9ACD32);
            const after = Channels(Darken(0x9ACD32, amount));
            after.forEach((value, i) => expect(value).toBeLessThanOrEqual(before[i]));
        }
    });

    it("keeps black black", () => {
        expect(Darken(0x000000, 0.5)).toBe(0x000000);
    });

    it("ignores bits above the colour, such as an alpha byte", () => {
        expect(Darken(0xFF123456, 0)).toBe(0x123456);
        expect(Darken(0xFFFFFFFF, 0.5)).toBe(0x808080);
    });
});

describe("ShiftHue", () => {
    it("steps red round the colour wheel in sixths: yellow, green, cyan, blue, magenta", () => {
        const wheel = [0xFF0000, 0xFFFF00, 0x00FF00, 0x00FFFF, 0x0000FF, 0xFF00FF];

        wheel.forEach((colour, i) => expect(ShiftHue(0xFF0000, i * 60)).toBe(colour));
    });

    it("does the same from any starting point on the wheel", () => {
        expect(ShiftHue(0x00FF00, 120)).toBe(0x0000FF); // green -> blue
        expect(ShiftHue(0x0000FF, 120)).toBe(0xFF0000); // blue wraps round to red
        expect(ShiftHue(0xFFFF00, 180)).toBe(0x0000FF); // yellow -> the opposite, blue
    });

    it("lands between the sixths too", () => {
        expect(ShiftHue(0xFF0000, 30)).toBe(0xFF8000); // red -> orange
        expect(ShiftHue(0xFF0000, 90)).toBe(0x80FF00); // red -> chartreuse
    });

    it("turns the other way for a negative amount", () => {
        expect(ShiftHue(0xFF0000, -60)).toBe(0xFF00FF);
        expect(ShiftHue(0xFF0000, -120)).toBe(0x0000FF);
    });

    it("wraps a full turn or more", () => {
        expect(ShiftHue(0xFF0000, 360)).toBe(0xFF0000);
        expect(ShiftHue(0xFF0000, 420)).toBe(0xFFFF00);
        expect(ShiftHue(0xFF0000, -300)).toBe(0xFFFF00);
        expect(ShiftHue(0x336699, 720)).toBe(0x336699);
    });

    it("leaves greys, black and white alone, whatever the amount", () => {
        [0x000000, 0x808080, 0xFFFFFF, 0x1F1F1F].forEach(grey => {
            [0, 45, 180, -90, 1000].forEach(degrees => expect(ShiftHue(grey, degrees)).toBe(grey));
        });
    });

    it("keeps the brightest and darkest channel values, which is to say the brightness and saturation", () => {
        [0xC04020, 0x336699, 0xFFD700, 0x2E8B57, 0xDDA0DD].forEach(colour => {
            const before = Channels(colour);
            [17, 90, 137, 250, -75].forEach(degrees => {
                const after = Channels(ShiftHue(colour, degrees));

                expect(Math.max(...after)).toBeGreaterThanOrEqual(Math.max(...before) - 1);
                expect(Math.max(...after)).toBeLessThanOrEqual(Math.max(...before) + 1);
                expect(Math.min(...after)).toBeGreaterThanOrEqual(Math.min(...before) - 1);
                expect(Math.min(...after)).toBeLessThanOrEqual(Math.min(...before) + 1);
            });
        });
    });

    it("is undone by turning back, to within a rounding step", () => {
        [0xC04020, 0x336699, 0xFFD700, 0x2E8B57, 0xDDA0DD].forEach(colour => {
            const back = Channels(ShiftHue(ShiftHue(colour, 100), -100));

            Channels(colour).forEach((value, i) => expect(Math.abs(back[i] - value)).toBeLessThanOrEqual(1));
        });
    });

    it("leaves a colour alone for no shift, to within a rounding step", () => {
        for (let colour = 0x000000; colour <= 0xFFFFFF; colour += 0x0F1D2B) {
            const same = Channels(ShiftHue(colour, 0));

            Channels(colour).forEach((value, i) => expect(Math.abs(same[i] - value)).toBeLessThanOrEqual(1));
        }
    });

    it("returns a colour that fits in 24 bits, for any input", () => {
        for (let colour = 0x000001; colour <= 0xFFFFFF; colour += 0x07A3B5) {
            [0, 33, 211, -144].forEach(degrees => {
                const shifted = ShiftHue(colour, degrees);

                expect(Number.isInteger(shifted)).toBe(true);
                expect(shifted).toBeGreaterThanOrEqual(0);
                expect(shifted).toBeLessThanOrEqual(0xFFFFFF);
            });
        }
    });

    it("leaves a colour alone for an amount that isn't a number", () => {
        expect(ShiftHue(0xFF8040, NaN)).toBe(0xFF8040);
        expect(ShiftHue(0xFF8040, Infinity)).toBe(0xFF8040);
    });

    it("ignores bits above the colour, such as an alpha byte", () => {
        expect(ShiftHue(0xFFFF0000, 120)).toBe(0x00FF00);
        expect(ShiftHue(0xFF808080, 120)).toBe(0x808080);
    });
});
