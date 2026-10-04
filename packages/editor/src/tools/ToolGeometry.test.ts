import { describe, expect, it } from "vitest";
import { BoundsOfCells, FloodFill, FootprintReach, RectCells, SpanRect, TopmostBrushAt, TopmostBrushCovering } from "./ToolGeometry";

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

describe("TopmostBrushCovering", () => {
    type Placed = { name: string; layerId: number; position: { x: number; y: number } };
    const at = (name: string, layerId: number, x: number, y: number): Placed => ({ name, layerId, position: { x, y } });
    const layers = [
        { id: 0, visible: true },
        { id: 1, visible: true },
        { id: 2, visible: false }
    ];
    /** Sprites by name: a spawner or door is a 2x2 block from its anchor, anything else one cell. */
    const footprintOf = (brush: Placed) => {
        const { x, y } = brush.position;
        return brush.name === "spawner" || brush.name === "door"
            ? [{ x, y }, { x: x + 1, y }, { x, y: y + 1 }, { x: x + 1, y: y + 1 }]
            : [{ x, y }];
    };

    it("finds a sprite that spans several cells from every one of them, not just the one it's anchored on", () => {
        const brushes = [at("spawner", 0, 5, 5)];
        [[5, 5], [6, 5], [5, 6], [6, 6]].forEach(([x, y]) => {
            expect(TopmostBrushCovering(brushes, layers, { x, y }, footprintOf)?.name, `${x},${y}`).toBe("spawner");
        });
        [[4, 5], [7, 5], [5, 4], [6, 7], [7, 7]].forEach(([x, y]) => {
            expect(TopmostBrushCovering(brushes, layers, { x, y }, footprintOf), `${x},${y}`).toBeUndefined();
        });
    });

    it("still finds a one-cell brush at its own cell and nowhere else", () => {
        const brushes = [at("torch", 0, 2, 3)];
        expect(TopmostBrushCovering(brushes, layers, { x: 2, y: 3 }, footprintOf)?.name).toBe("torch");
        expect(TopmostBrushCovering(brushes, layers, { x: 3, y: 3 }, footprintOf)).toBeUndefined();
    });

    it("takes the topmost where several cover the cell: the last layer, then the last painted - as TopmostBrushAt does", () => {
        const brushes = [at("door", 0, 4, 4), at("spawner", 1, 5, 5), at("door", 1, 4, 5)];
        // (5,5) is covered by all three; the last painted on the last layer wins.
        expect(TopmostBrushCovering(brushes, layers, { x: 5, y: 5 }, footprintOf).name).toBe("door");
        expect(TopmostBrushCovering(brushes, layers, { x: 5, y: 5 }, footprintOf).position).toEqual({ x: 4, y: 5 });
        // Only the layer-0 door reaches (4,4)'s top-left.
        expect(TopmostBrushCovering(brushes, layers, { x: 4, y: 4 }, footprintOf).layerId).toBe(0);
    });

    it("skips hidden layers, layers it isn't given, and brushes it's told to", () => {
        const brushes = [at("spawner", 2, 5, 5), at("spawner", 7, 5, 5), at("door", 0, 5, 5)];
        expect(TopmostBrushCovering(brushes, layers, { x: 6, y: 6 }, footprintOf).name).toBe("door");
        expect(TopmostBrushCovering(brushes, layers, { x: 6, y: 6 }, footprintOf, b => b.name !== "door")).toBeUndefined();
    });

    it("asks what a brush accepts before working out its footprint, and never works out one that's too far to reach", () => {
        const brushes = [at("rejected", 0, 5, 5), at("far", 0, 5 + FootprintReach + 1, 5), at("kept", 0, 5, 5)];
        const worked: string[] = [];
        const found = TopmostBrushCovering(
            brushes,
            layers,
            { x: 5, y: 5 },
            brush => {
                worked.push(brush.name);
                return [brush.position];
            },
            brush => brush.name !== "rejected"
        );
        expect(found.name).toBe("kept");
        expect(worked).toEqual(["kept"]);
    });

    it("reaches as far as it says a footprint can", () => {
        const wide = at("wide", 0, 0, 0);
        const cells = Array.from({ length: FootprintReach + 1 }, (_, x) => ({ x, y: 0 }));
        expect(TopmostBrushCovering([wide], layers, { x: FootprintReach, y: 0 }, () => cells)).toBe(wide);
    });
});

describe("BoundsOfCells", () => {
    it("is the smallest block holding the cells", () => {
        expect(BoundsOfCells([{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 5, y: 6 }, { x: 6, y: 6 }])).toEqual({ x: 5, y: 5, width: 2, height: 2 });
        expect(BoundsOfCells([{ x: -2, y: 4 }, { x: 3, y: 1 }])).toEqual({ x: -2, y: 1, width: 6, height: 4 });
        expect(BoundsOfCells([{ x: 7, y: 7 }])).toEqual({ x: 7, y: 7, width: 1, height: 1 });
    });

    it("is empty for none", () => {
        expect(BoundsOfCells([])).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    });
});
