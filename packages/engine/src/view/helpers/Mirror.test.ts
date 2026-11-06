import { describe, expect, it } from "vitest";
import { MirroredLight, MirroredTurn } from "./Mirror";

describe("MirroredLight", () => {
    it("swaps the top corners' light for the bottom ones'", () => {
        const light = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
        // Top-left was 1-3, top-right 4-6, bottom-right 7-9, bottom-left 10-12.
        expect(Array.from(MirroredLight(light, new Float32Array(12)))).toEqual([10, 11, 12, 7, 8, 9, 4, 5, 6, 1, 2, 3]);
    });
});

describe("MirroredTurn", () => {
    it("flips something upright the other way up", () => {
        expect(MirroredTurn(0, 1, 1)).toEqual({ rotation: 0, scaleX: 1, scaleY: -1 });
        expect(MirroredTurn(0, -1, 1)).toEqual({ rotation: 0, scaleX: -1, scaleY: -1 });
        expect(MirroredTurn(0, 1, -1)).toEqual({ rotation: 0, scaleX: 1, scaleY: 1 });
    });

    it("turns it back the other way, within a whole turn", () => {
        expect(MirroredTurn(Math.PI / 2, 1, 1).rotation).toBeCloseTo((3 * Math.PI) / 2);
        expect(MirroredTurn(Math.PI, 1, 1).rotation).toBeCloseTo(Math.PI);
        expect(MirroredTurn((3 * Math.PI) / 2, 1, 1).rotation).toBeCloseTo(Math.PI / 2);
    });
});
