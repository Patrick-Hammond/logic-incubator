import { describe, expect, it } from "vitest";
import { GlowLook, GlowPixels, GlowRadius, GlowStrength, LookOfGlow, LookOfOrbCore, OrbCoreRadius } from "./Glow";

const Look = (rgb: number[], scale: number): GlowLook => LookOfGlow(rgb, scale, { tint: 0, alpha: 0, radius: 0 });

describe("GlowPixels", () => {
    const size = 16;
    const pixels = GlowPixels(size);
    const At = (x: number, y: number): number[] => Array.from(pixels.slice((y * size + x) * 4, (y * size + x) * 4 + 4));

    it("is white, its colour already multiplied by its alpha", () => {
        expect(pixels.length).toBe(size * size * 4);
        for (let i = 0; i < pixels.length; i += 4) {
            expect(pixels[i]).toBe(pixels[i + 3]);
            expect(pixels[i + 1]).toBe(pixels[i + 3]);
            expect(pixels[i + 2]).toBe(pixels[i + 3]);
        }
    });

    it("is strongest in the middle, fading to nothing at the edge", () => {
        expect(At(8, 8)[3]).toBeGreaterThan(240);
        expect(At(8, 8)[3]).toBeGreaterThan(At(11, 8)[3]);
        expect(At(11, 8)[3]).toBeGreaterThan(At(14, 8)[3]);
        expect(At(0, 0)[3]).toBe(0);
        expect(At(0, 8)[3]).toBeLessThan(5);
    });

    it("is round", () => {
        expect(At(12, 8)).toEqual(At(8, 12));
        expect(At(3, 8)).toEqual(At(12, 8));
    });
});

describe("LookOfGlow", () => {
    it("takes the light's colour at full saturation, however bright it is", () => {
        expect(Look([0.5, 0.25, 0], 1).tint).toBe(0xff8000);
        expect(Look([2, 1, 0], 1).tint).toBe(0xff8000);
    });

    it("adds more the brighter the light and the stronger it is this moment", () => {
        expect(Look([1, 0.8, 0.5], 1).alpha).toBeCloseTo(GlowStrength);
        expect(Look([0.5, 0.4, 0.25], 1).alpha).toBeCloseTo(GlowStrength / 2);
        expect(Look([1, 0.8, 0.5], 0.5).alpha).toBeCloseTo(GlowStrength / 2);
        expect(Look([100, 0, 0], 100).alpha).toBe(1);
    });

    it("swells a little as a light flares, and shrinks as it dies down", () => {
        expect(Look([1, 1, 1], 1).radius).toBeCloseTo(GlowRadius);
        expect(Look([1, 1, 1], 1.2).radius).toBeGreaterThan(GlowRadius);
        expect(Look([1, 1, 1], 0.2).radius).toBeLessThan(GlowRadius);
    });

    it("shows nothing for a light that's off or black", () => {
        expect(Look([1, 1, 1], 0).alpha).toBe(0);
        expect(Look([0, 0, 0], 1).alpha).toBe(0);
    });
});

describe("LookOfOrbCore", () => {
    const Core = (rgb: number[], scale: number): GlowLook => LookOfOrbCore(rgb, scale, { tint: 0, alpha: 0, radius: 0 });

    it("is small, nearly opaque and close to white, with a touch of the light's colour", () => {
        const core = Core([0.66, 0.77, 1], 1);
        expect(core.radius).toBeCloseTo(OrbCoreRadius);
        expect(core.alpha).toBeCloseTo(0.9);
        expect(core.tint & 0xff).toBe(0xff);
        expect((core.tint >> 16) & 0xff).toBeGreaterThan(0xd0);
        expect((core.tint >> 16) & 0xff).toBeLessThan(0xff);
    });

    it("fades with the light, and shows nothing for a light that's out", () => {
        expect(Core([1, 1, 1], 0.5).alpha).toBeCloseTo(0.45);
        expect(Core([1, 1, 1], 0).alpha).toBe(0);
        expect(Core([0, 0, 0], 1).alpha).toBe(0);
    });
});
