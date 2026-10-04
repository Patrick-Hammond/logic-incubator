import { describe, expect, it } from "vitest";
import { Rgb } from "./Colour";
import { CloneMixer, ConstantRange, IdentityMixer, IsIdentityMixer, MixColour, MixPalette, MixerPresets, WeightRange } from "./ChannelMixer";

const preset = (name: string) => MixerPresets.find(p => p.name === name).mixer;

describe("MixColour", () => {
    it("leaves a colour alone with the identity mixer, alpha and all", () => {
        const c = Rgb(12, 200, 99, 77);
        expect(MixColour(c, IdentityMixer())).toEqual(c);
    });

    it("mixes each output channel from the source channels plus a constant", () => {
        const m = IdentityMixer();
        m.red = { r: 0.5, g: 0.5, b: 0, constant: 0 };
        m.green = { r: 0, g: 1, b: 0, constant: 0.1 };
        m.blue = { r: 0, g: 0, b: 0, constant: 0.5 };
        expect(MixColour(Rgb(100, 50, 200), m)).toEqual(Rgb(75, 76, 128));
    });

    it("clamps to 0..255 rather than wrapping", () => {
        const m = IdentityMixer();
        m.red = { r: 2, g: 0, b: 0, constant: 0 };
        m.green = { r: -1, g: 0, b: 0, constant: 0 };
        expect(MixColour(Rgb(200, 0, 0), m)).toEqual(Rgb(255, 0, 0));
    });

    it("makes monochrome use the grey row for every channel", () => {
        const m = IdentityMixer();
        m.monochrome = true;
        m.gray = { r: 1, g: 0, b: 0, constant: 0 };
        expect(MixColour(Rgb(200, 10, 30), m)).toEqual(Rgb(200, 200, 200));
    });

    it("scales and offsets alpha", () => {
        const m = IdentityMixer();
        m.alphaScale = 0.5;
        expect(MixColour(Rgb(1, 2, 3, 200), m).a).toBe(100);
        m.alphaOffset = 0.2;
        expect(MixColour(Rgb(1, 2, 3, 200), m).a).toBe(151);
        m.alphaScale = 2;
        expect(MixColour(Rgb(1, 2, 3, 200), m).a).toBe(255);
    });
});

describe("MixPalette", () => {
    const palette = [{ r: 0, g: 0, b: 0, a: 0 }, Rgb(255, 0, 0), Rgb(0, 255, 0), Rgb(0, 0, 255)];

    it("applies to every colour by default, and returns a new palette", () => {
        const swapped = MixPalette(palette, preset("Swap red and blue"));
        expect(swapped[1]).toEqual(Rgb(0, 0, 255));
        expect(swapped[3]).toEqual(Rgb(255, 0, 0));
        expect(swapped[2]).toEqual(Rgb(0, 255, 0));
        expect(palette[1]).toEqual(Rgb(255, 0, 0));
    });

    it("applies only to the entries it's given", () => {
        const swapped = MixPalette(palette, preset("Invert"), [1]);
        expect(swapped[1]).toEqual(Rgb(0, 255, 255));
        expect(swapped[2]).toEqual(Rgb(0, 255, 0));
        expect(swapped[3]).toEqual(Rgb(0, 0, 255));
    });

    it("never touches a transparent entry, even when alpha is being raised", () => {
        const m = IdentityMixer();
        m.alphaOffset = 1;
        const out = MixPalette(palette, m);
        expect(out[0].a).toBe(0);
        expect(out[1].a).toBe(255);
        const translucent = MixPalette([Rgb(1, 1, 1, 10)], m);
        expect(translucent[0].a).toBe(255);
    });
});

describe("the presets", () => {
    it("start with 'No change', which is the identity", () => {
        expect(MixerPresets[0].name).toBe("No change");
        expect(IsIdentityMixer(MixerPresets[0].mixer)).toBe(true);
    });

    it("greyscale turns red to its brightness, and keeps white and black", () => {
        const m = preset("Greyscale");
        expect(MixColour(Rgb(255, 0, 0), m)).toEqual(Rgb(76, 76, 76));
        expect(MixColour(Rgb(255, 255, 255), m)).toEqual(Rgb(255, 255, 255));
        expect(MixColour(Rgb(0, 0, 0), m)).toEqual(Rgb(0, 0, 0));
    });

    it("sepia warms a grey and keeps black black", () => {
        const m = preset("Sepia");
        const grey = MixColour(Rgb(128, 128, 128), m);
        expect(grey.r).toBeGreaterThan(grey.g);
        expect(grey.g).toBeGreaterThan(grey.b);
        expect(MixColour(Rgb(0, 0, 0), m)).toEqual(Rgb(0, 0, 0));
    });

    it("invert is its own inverse", () => {
        const m = preset("Invert");
        const c = Rgb(10, 130, 250);
        expect(MixColour(MixColour(c, m), m)).toEqual(c);
        expect(MixColour(c, m)).toEqual(Rgb(245, 125, 5));
    });

    it("rotating the channels three times is no change", () => {
        const m = preset("Rotate channels (R > G > B > R)");
        const c = Rgb(10, 20, 30);
        expect(MixColour(MixColour(MixColour(c, m), m), m)).toEqual(c);
        expect(MixColour(c, m)).not.toEqual(c);
    });

    it("darken and lighten move brightness the right way", () => {
        const c = Rgb(100, 100, 100);
        expect(MixColour(c, preset("Darken 25%")).r).toBe(75);
        expect(MixColour(c, preset("Lighten 25%")).r).toBe(164);
    });

    it("all have finite weights within the ranges the sliders allow, and none share a mixer", () => {
        MixerPresets.forEach(({ name, mixer }) => {
            [mixer.red, mixer.green, mixer.blue, mixer.gray].forEach(row => {
                [row.r, row.g, row.b].forEach(w => expect(Math.abs(w), name).toBeLessThanOrEqual(WeightRange));
                expect(Math.abs(row.constant), name).toBeLessThanOrEqual(ConstantRange);
            });
        });
        expect(MixerPresets[0].mixer).not.toBe(IdentityMixer());
        const a = CloneMixer(MixerPresets[1].mixer);
        a.gray.r = 9;
        expect(MixerPresets[1].mixer.gray.r).not.toBe(9);
    });
});

describe("IsIdentityMixer", () => {
    it("ignores the grey row until monochrome is on", () => {
        const m = IdentityMixer();
        m.gray = { r: 1, g: 1, b: 1, constant: 0 };
        expect(IsIdentityMixer(m)).toBe(true);
        m.monochrome = true;
        expect(IsIdentityMixer(m)).toBe(false);
    });

    it("sees any change to a row or to alpha", () => {
        const m = IdentityMixer();
        m.red.g = 0.1;
        expect(IsIdentityMixer(m)).toBe(false);
        const n = IdentityMixer();
        n.alphaOffset = 0.1;
        expect(IsIdentityMixer(n)).toBe(false);
    });
});
