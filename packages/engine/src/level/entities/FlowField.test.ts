import { describe, expect, it } from "vitest";
import FlowField, { UNREACHABLE } from "./FlowField";

/** A field over an ASCII map: `#` solid, anything else open. Rows are y, columns x. */
function Field(rows: string[]): FlowField {
    return new FlowField(rows[0].length, rows.length, (x, y) => rows[y][x] === "#");
}

describe("FlowField", () => {
    it("measures walking distance in tiles, a diagonal step as ~1.4", () => {
        const field = Field([
            ".....",
            ".....",
            "....."
        ]);
        field.Update(0, 0);
        expect(field.DistanceAt(0, 0)).toBe(0);
        expect(field.DistanceAt(3, 0)).toBe(3);
        expect(field.DistanceAt(1, 1)).toBe(1.4);
        expect(field.DistanceAt(4, 2)).toBeCloseTo(1.4 * 2 + 2, 10);
    });

    it("walks around walls, and marks solid, cut-off and off-map cells unreachable", () => {
        const field = Field([
            ".#...",
            ".#.#.",
            "...#."
        ]);
        field.Update(0, 0);
        // Down the left column, along the bottom, up through the gap and over the top.
        expect(field.DistanceAt(2, 0)).toBeGreaterThan(4);
        expect(field.DistanceAt(1, 0)).toBe(UNREACHABLE);
        expect(field.DistanceAt(-1, 0)).toBe(UNREACHABLE);
        expect(field.DistanceAt(5, 0)).toBe(UNREACHABLE);

        const island = Field([
            "..#..",
            "..#.."
        ]);
        island.Update(0, 0);
        expect(island.DistanceAt(4, 1)).toBe(UNREACHABLE);
        expect(island.NextCell(4, 1)).toBeNull();
    });

    it("never cuts a wall's corner diagonally", () => {
        const field = Field([
            ".#",
            ".."
        ]);
        field.Update(1, 1);
        // (0,0) -> (1,1) would squeeze past the corner of (1,0): it has to go via (0,1).
        expect(field.DistanceAt(0, 0)).toBe(2);
        expect(field.NextCell(0, 0)).toEqual({ x: 0, y: 1 });
    });

    it("steps towards the target with NextCell, and away with AwayCell", () => {
        const field = Field([
            "......"
        ]);
        field.Update(0, 0);
        expect(field.NextCell(3, 0)).toEqual({ x: 2, y: 0 });
        expect(field.AwayCell(3, 0)).toEqual({ x: 4, y: 0 });
        expect(field.NextCell(0, 0)).toBeNull();
        expect(field.AwayCell(5, 0)).toBeNull();
    });

    it("steers a monster stuck in a solid cell out towards the target", () => {
        const field = Field([
            "...",
            ".#.",
            "..."
        ]);
        field.Update(0, 0);
        expect(field.NextCell(1, 1)).toEqual({ x: 0, y: 0 });
    });

    it("only recomputes when the target changes cell or it's marked dirty", () => {
        const solid = new Set<string>();
        const field = new FlowField(3, 1, (x, y) => solid.has(x + "," + y));
        expect(field.Update(0, 0)).toBe(true);
        expect(field.Update(0, 0)).toBe(false);

        solid.add("1,0");
        expect(field.Update(0, 0)).toBe(false);
        expect(field.DistanceAt(2, 0)).toBe(2);

        field.MarkDirty();
        expect(field.Update(0, 0)).toBe(true);
        expect(field.DistanceAt(2, 0)).toBe(UNREACHABLE);

        expect(field.Update(2, 0)).toBe(true);
        expect(field.DistanceAt(2, 0)).toBe(0);
    });

    it("has nothing reachable from a solid target", () => {
        const field = Field(["#.."]);
        field.Update(0, 0);
        expect(field.DistanceAt(1, 0)).toBe(UNREACHABLE);
    });

    it("handles a big open map", () => {
        const field = new FlowField(200, 200, () => false);
        field.Update(0, 0);
        expect(field.DistanceAt(199, 199)).toBeCloseTo(199 * 1.4, 5);
    });
});
