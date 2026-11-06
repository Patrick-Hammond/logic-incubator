import { describe, expect, it } from "vitest";
import { MirroredLight, MirroredTop, MirroredTurn } from "./Mirror";

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

describe("MirroredTop", () => {
    it("hangs an untrimmed texture straight down from its bottom edge", () => {
        expect(MirroredTop(10, 16, 0, 16)).toBe(26);
    });

    it("starts a trimmed figure's reflection at its feet, not its trim below them", () => {
        // A 16x28 frame whose art starts 9 rows down and reaches its bottom: drawn the right way up from 9 + 10 to 28 + 10.
        const top = 10;
        const artBottom = top + 9 + 19;
        expect(MirroredTop(top, 28, 9, 19) + 9).toBe(artBottom);
    });

    it("keeps the gap under art that stops short of its frame's bottom, mirrored", () => {
        // Art in rows 4 to 12 of 16: 4 empty rows under it the right way up, so 4 between the feet and the reflection too.
        const top = 0;
        expect(MirroredTop(top, 16, 4, 8) + 4).toBe(top + 16 + 4);
    });
});
