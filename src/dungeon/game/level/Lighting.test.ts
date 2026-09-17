import { describe, expect, it } from "vitest";
import { AMBIENT_LIGHT, BakeLighting, IsCompleteLightValue } from "./Lighting";

const TINT = 0xff8100;

describe("IsCompleteLightValue", () => {
    it("accepts a value with all three fields present as numbers", () => {
        expect(IsCompleteLightValue({ brightness: 0.5, tint: TINT, range: 5 })).toBe(true);
    });

    it("rejects a value missing tint - the exact shape of a hand-edited assets-meta.json typo", () => {
        expect(IsCompleteLightValue({ brightness: 10, range: 10 })).toBe(false);
    });

    it("rejects a value with a non-numeric field, NaN, or Infinity", () => {
        expect(IsCompleteLightValue({ brightness: "1", tint: TINT, range: 5 })).toBe(false);
        expect(IsCompleteLightValue({ brightness: NaN, tint: TINT, range: 5 })).toBe(false);
        expect(IsCompleteLightValue({ brightness: 1, tint: TINT, range: Infinity })).toBe(false);
    });

    it("rejects a plain number (the other half of the Brush.data union) and null/undefined", () => {
        expect(IsCompleteLightValue(5)).toBe(false);
        expect(IsCompleteLightValue(null)).toBe(false);
        expect(IsCompleteLightValue(undefined)).toBe(false);
    });
});

describe("BakeLighting", () => {
    it("leaves every cell untouched (not merely ambient) when there are no lights", () => {
        const data = BakeLighting([], 10, 10);
        expect(data.length).toBe(0);
    });

    it("peaks at a light's own cell: brightness, clamped to 1, carrying its tint", () => {
        const dim = BakeLighting([{ x: 5, y: 5, value: { brightness: 0.3, tint: TINT, range: 3 } }], 20, 20);
        expect(dim[5][5].brightness).toBeCloseTo(0.3);
        expect(dim[5][5].tint).toBe(TINT);

        const overbright = BakeLighting([{ x: 5, y: 5, value: { brightness: 3, tint: TINT, range: 3 } }], 20, 20);
        expect(overbright[5][5].brightness).toBe(1);
    });

    it("falls off linearly to ambient at the edge of the range, and touches nothing beyond it", () => {
        const data = BakeLighting([{ x: 10, y: 10, value: { brightness: 0.5, tint: TINT, range: 5 } }], 30, 30);

        // 2 tiles from the source: 0.5 * (1 - 2/5) = 0.3.
        expect(data[10][12].brightness).toBeCloseTo(0.3);
        // Exactly at the range, linear falloff hits zero, floored at ambient rather than going dark.
        expect(data[10][15].brightness).toBeCloseTo(AMBIENT_LIGHT);
        // One tile past the range: never visited at all, not merely ambient - a sparse "absent" cell,
        // matching how collisionData/heightData represent "nothing painted here".
        expect(data[10][16]).toBeUndefined();
    });

    it("combines overlapping lights by keeping the brighter one's contribution and tint", () => {
        const data = BakeLighting([
            { x: 5, y: 5, value: { brightness: 0.9, tint: 0xff0000, range: 9 } },
            { x: 6, y: 5, value: { brightness: 0.9, tint: 0x0000ff, range: 9 } }, // also reaches (5,5) at distance 1
        ], 20, 20);

        // If these summed, (5,5) would exceed 1; keeping the brighter contribution just caps it there.
        expect(data[5][5].brightness).toBeLessThanOrEqual(1);
        expect(data[5][5].brightness).toBeCloseTo(0.9);
        expect(data[5][5].tint).toBe(0xff0000);
    });

    it("clips a light whose range extends past the map edge instead of throwing", () => {
        const light = { x: 0, y: 0, value: { brightness: 0.9, tint: TINT, range: 9 } };
        expect(() => BakeLighting([light], 5, 5)).not.toThrow();
        const data = BakeLighting([light], 5, 5);
        expect(data.length).toBeLessThanOrEqual(5);
        expect(data[0][0].brightness).toBeCloseTo(0.9);
    });

    it("treats a zero or negative brightness/range as no light, not a crash", () => {
        expect(BakeLighting([{ x: 5, y: 5, value: { brightness: 0, tint: TINT, range: 5 } }], 20, 20).length).toBe(0);
        expect(BakeLighting([{ x: 5, y: 5, value: { brightness: 0.5, tint: TINT, range: 0 } }], 20, 20).length).toBe(0);
        expect(() => BakeLighting([{ x: 5, y: 5, value: { brightness: -0.3, tint: TINT, range: 5 } }], 20, 20)).not.toThrow();
    });
});
