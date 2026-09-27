import { describe, expect, it } from "vitest";
import { FloodFill, RectCells, SpanRect, TopmostBrushAt } from "./ToolGeometry";

const key = (cells: { x: number; y: number }[]) => cells.map(c => `${c.x},${c.y}`).sort();

describe("SpanRect / RectCells", () => {
    it("spans two corners whichever way round they are", () => {
        expect(SpanRect({ x: 3, y: 1 }, { x: 1, y: 2 })).toEqual({ x: 1, y: 1, width: 3, height: 2 });
        expect(SpanRect({ x: 2, y: 2 }, { x: 2, y: 2 })).toEqual({ x: 2, y: 2, width: 1, height: 1 });
    });

    it("fills the rectangle, or just its border", () => {
        const rect = SpanRect({ x: 0, y: 0 }, { x: 3, y: 2 });
        expect(RectCells(rect)).toHaveLength(12);
        expect(key(RectCells(rect, true))).toEqual(
            key([
                { x: 0, y: 0 },
                { x: 1, y: 0 },
                { x: 2, y: 0 },
                { x: 3, y: 0 },
                { x: 0, y: 1 },
                { x: 3, y: 1 },
                { x: 0, y: 2 },
                { x: 1, y: 2 },
                { x: 2, y: 2 },
                { x: 3, y: 2 }
            ])
        );
    });

    it("has no inside to leave out when it's only one or two cells across", () => {
        const thin = SpanRect({ x: 0, y: 0 }, { x: 4, y: 1 });
        expect(RectCells(thin, true)).toEqual(RectCells(thin));
    });
});

describe("FloodFill", () => {
    // A 5x3 map: a wall ring ("#") around a one-cell room, with open space to its left.
    const rows = ["..###", "..#.#", "..###"];
    const keyAt = (x: number, y: number) => (rows[y][x] === "#" ? "wall" : "");
    const bounds = { x: 0, y: 0, width: 5, height: 3 };

    it("spreads over matching cells, stopping at anything else", () => {
        expect(key(FloodFill({ x: 3, y: 1 }, bounds, keyAt))).toEqual(["3,1"]);
        expect(FloodFill({ x: 0, y: 0 }, bounds, keyAt)).toHaveLength(6);
    });

    it("fills a region of the same tile, not just empty space", () => {
        expect(FloodFill({ x: 2, y: 0 }, bounds, keyAt)).toHaveLength(8);
    });

    it("stops at the bounds, and does nothing from outside them", () => {
        expect(FloodFill({ x: 0, y: 0 }, { x: 0, y: 0, width: 1, height: 2 }, keyAt)).toHaveLength(2);
        expect(FloodFill({ x: 9, y: 9 }, bounds, keyAt)).toEqual([]);
    });

    it("only joins cells edge to edge, not diagonally", () => {
        const diagonal = (x: number, y: number) => (x === y ? "a" : "b");
        expect(FloodFill({ x: 0, y: 0 }, { x: 0, y: 0, width: 3, height: 3 }, diagonal)).toHaveLength(1);
    });
});

describe("TopmostBrushAt", () => {
    const at = (name: string, layerId: number, x = 0, y = 0) => ({ name, layerId, position: { x, y } });
    const layers = [
        { id: 0, visible: true },
        { id: 1, visible: true },
        { id: 2, visible: false }
    ];

    it("takes the last layer that has one, then the last painted in it", () => {
        const brushes = [at("top-of-0", 0), at("a", 1), at("b", 1), at("under", 0), at("elsewhere", 1, 5, 5)];
        expect(TopmostBrushAt(brushes, layers, { x: 0, y: 0 }).name).toBe("b");
    });

    it("skips hidden layers, layers it isn't given, and brushes it's told to", () => {
        const brushes = [at("a", 0), at("hidden", 2), at("unlisted", 7)];
        expect(TopmostBrushAt(brushes, layers, { x: 0, y: 0 }).name).toBe("a");
        expect(TopmostBrushAt(brushes, layers, { x: 0, y: 0 }, b => b.name !== "a")).toBeUndefined();
    });
});
