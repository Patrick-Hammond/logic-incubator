import { describe, expect, it } from "vitest";
import { AMBIENT_LIGHT, BakeLighting } from "./Lighting";

describe("BakeLighting", () => {
    it("leaves every cell untouched (not merely ambient) when there are no lights", () => {
        const data = BakeLighting([], 10, 10);
        expect(data.length).toBe(0);
    });

    it("peaks at a light's own cell: value/10, clamped to 1", () => {
        const dim = BakeLighting([{ x: 5, y: 5, value: 3 }], 20, 20);
        expect(dim[5][5]).toBeCloseTo(0.3);

        const overbright = BakeLighting([{ x: 5, y: 5, value: 30 }], 20, 20);
        expect(overbright[5][5]).toBe(1);
    });

    it("falls off linearly to ambient at the edge of the radius, and touches nothing beyond it", () => {
        // value 5 -> peak 0.5, radius 5 tiles.
        const data = BakeLighting([{ x: 10, y: 10, value: 5 }], 30, 30);

        // 2 tiles from the source: 0.5 * (1 - 2/5) = 0.3.
        expect(data[10][12]).toBeCloseTo(0.3);
        // Exactly at the radius, linear falloff hits zero, floored at ambient rather than going dark.
        expect(data[10][15]).toBeCloseTo(AMBIENT_LIGHT);
        // One tile past the radius: never visited at all, not merely ambient - a sparse "absent" cell,
        // matching how collisionData/heightData represent "nothing painted here".
        expect(data[10][16]).toBeUndefined();
    });

    it("combines overlapping lights with max, not addition", () => {
        const data = BakeLighting([
            { x: 5, y: 5, value: 9 }, // peak 0.9 here
            { x: 6, y: 5, value: 9 }, // also reaches (5,5) at distance 1: 0.9 * (1 - 1/9)
        ], 20, 20);

        // If these summed, (5,5) would exceed 1; max just takes the brighter contribution.
        expect(data[5][5]).toBeLessThanOrEqual(1);
        expect(data[5][5]).toBeCloseTo(0.9);
    });

    it("clips a light whose radius extends past the map edge instead of throwing", () => {
        expect(() => BakeLighting([{ x: 0, y: 0, value: 9 }], 5, 5)).not.toThrow();
        const data = BakeLighting([{ x: 0, y: 0, value: 9 }], 5, 5);
        expect(data.length).toBeLessThanOrEqual(5);
        expect(data[0][0]).toBeCloseTo(0.9);
    });

    it("treats a zero or negative value as no light, not a crash", () => {
        expect(BakeLighting([{ x: 5, y: 5, value: 0 }], 20, 20).length).toBe(0);
        expect(() => BakeLighting([{ x: 5, y: 5, value: -3 }], 20, 20)).not.toThrow();
    });
});
