import { describe, expect, it } from "vitest";
import { BumpedNpc, IsDialogValue } from "./Talk";

const T = 16;
const npcAt = (cx: number, cy: number) => (x: number, y: number) => x === cx && y === cy;

describe("Talk", () => {
    it("knows a dialog brush's value", () => {
        expect(IsDialogValue({ script: "A: hi" })).toBe(true);
        expect(IsDialogValue({ script: 3 })).toBe(false);
        expect(IsDialogValue(null)).toBe(false);
    });

    it("finds the NPC a hero standing against it walks into, whichever way", () => {
        // The hero's box is just left of the NPC's cell (3, 1), up against it.
        expect(BumpedNpc({ x: 2 * T, y: T }, { x: 1, y: 0 }, npcAt(3, 1), T)).toEqual({ x: 3, y: 1 });
        expect(BumpedNpc({ x: 4 * T, y: T }, { x: -1, y: 0 }, npcAt(3, 1), T)).toEqual({ x: 3, y: 1 });
        expect(BumpedNpc({ x: 3 * T, y: 2 * T }, { x: 0, y: -0.7 }, npcAt(3, 1), T)).toEqual({ x: 3, y: 1 });
    });

    it("finds none walking away, standing still, or a step short of it", () => {
        expect(BumpedNpc({ x: 2 * T, y: T }, { x: -1, y: 0 }, npcAt(3, 1), T)).toBeNull();
        expect(BumpedNpc({ x: 2 * T, y: T }, { x: 0.1, y: 0 }, npcAt(3, 1), T)).toBeNull();
        expect(BumpedNpc({ x: T, y: T }, { x: 1, y: 0 }, npcAt(3, 1), T)).toBeNull();
    });
});
