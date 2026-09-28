import { describe, expect, it } from "vitest";
import { Easing, EasingFunction } from "./Easing";

type Family = { In: EasingFunction; Out: EasingFunction; InOut: EasingFunction };

const families: [string, Family][] = [
    ["Quad", Easing.Quad],
    ["Cubic", Easing.Cubic],
    ["Quart", Easing.Quart],
    ["Quint", Easing.Quint],
    ["Sine", Easing.Sine],
    ["Expo", Easing.Expo],
    ["Circ", Easing.Circ],
    ["Back", Easing.Back],
    ["Bounce", Easing.Bounce],
    ["Elastic", Easing.Elastic],
];

describe("Easing", () => {
    it("Linear passes progress straight through", () => {
        expect(Easing.Linear(0)).toBe(0);
        expect(Easing.Linear(0.5)).toBe(0.5);
        expect(Easing.Linear(1)).toBe(1);
    });

    describe.each(families)("%s", (_name, variants) => {
        it.each(Object.entries(variants))("%s starts at exactly 0 and ends at exactly 1", (_variant, fn) => {
            expect(fn(0)).toBeCloseTo(0, 10);
            expect(fn(1)).toBeCloseTo(1, 10);
        });
    });

    it("matches well-known midpoints", () => {
        expect(Easing.Quad.In(0.5)).toBeCloseTo(0.25);
        expect(Easing.Quad.Out(0.5)).toBeCloseTo(0.75);
        expect(Easing.Quad.InOut(0.5)).toBeCloseTo(0.5);
        expect(Easing.Cubic.InOut(0.5)).toBeCloseTo(0.5);
        expect(Easing.Sine.InOut(0.5)).toBeCloseTo(0.5);
    });

    it("In starts slow (below the diagonal) and Out starts fast (above it)", () => {
        expect(Easing.Quad.In(0.25)).toBeLessThan(0.25);
        expect(Easing.Quad.Out(0.25)).toBeGreaterThan(0.25);
    });

    it("Back overshoots past the 0..1 range mid-curve, unlike Quad", () => {
        expect(Easing.Back.Out(0.9)).toBeGreaterThan(1);
        expect(Easing.Back.In(0.1)).toBeLessThan(0);
    });

    it("Bounce.In is Bounce.Out played backwards and flipped", () => {
        expect(Easing.Bounce.In(0.2)).toBeCloseTo(1 - Easing.Bounce.Out(0.8), 10);
        expect(Easing.Bounce.In(0.7)).toBeCloseTo(1 - Easing.Bounce.Out(0.3), 10);
    });
});
