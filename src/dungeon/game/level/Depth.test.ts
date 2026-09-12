import { describe, expect, it } from "vitest";
import { BaseZScale, HeightAt, ZBandAlpha, ZFadeStep, ZScale, ZScaleRatio } from "./Depth";

describe("ZScale", () => {
    it("is BaseZScale at z 0", () => {
        expect(ZScale(0)).toBe(BaseZScale);
    });

    it("multiplies by ZScaleRatio per step", () => {
        expect(ZScale(1) / ZScale(0)).toBeCloseTo(ZScaleRatio, 10);
        expect(ZScale(4) / ZScale(3)).toBeCloseTo(ZScaleRatio, 10);
    });

    it("is strictly increasing in z", () => {
        for (let z = 0; z < 8; z++) {
            expect(ZScale(z + 1)).toBeGreaterThan(ZScale(z));
        }
    });
});

describe("ZBandAlpha", () => {
    it("is 1 for the player's own band", () => {
        expect(ZBandAlpha(0, 0)).toBe(1);
        expect(ZBandAlpha(3, 3)).toBe(1);
    });

    it("loses ZFadeStep per step away, symmetrically", () => {
        expect(ZBandAlpha(1, 0)).toBeCloseTo(1 - ZFadeStep, 10);
        expect(ZBandAlpha(0, 1)).toBeCloseTo(1 - ZFadeStep, 10);
        expect(ZBandAlpha(3, 1)).toBeCloseTo(1 - 2 * ZFadeStep, 10);
    });

    it("is floored at 0 for distant bands", () => {
        expect(ZBandAlpha(0, 9)).toBe(0);
        expect(ZBandAlpha(10, 2)).toBe(0);
        for (let z = -2; z < 12; z++) {
            expect(ZBandAlpha(z, 4)).toBeGreaterThanOrEqual(0);
        }
    });
});

describe("HeightAt", () => {
    it("is 0 for an unpainted or out-of-range cell", () => {
        expect(HeightAt([], 3, 3)).toBe(0);
        expect(HeightAt([[]], 3, 3)).toBe(0);
        const grid = [[], [], [1, 0, 2]]; // column x=2 only
        expect(HeightAt(grid, 0, 0)).toBe(0); // empty column
        expect(HeightAt(grid, 2, 1)).toBe(0); // painted 0
        expect(HeightAt(grid, 9, 9)).toBe(0); // out of range
    });

    it("returns the painted height at the cell", () => {
        const grid: number[][] = [];
        grid[4] = [];
        grid[4][7] = 3;
        expect(HeightAt(grid, 4, 7)).toBe(3);
        expect(HeightAt(grid, 4, 6)).toBe(0);
    });
});
