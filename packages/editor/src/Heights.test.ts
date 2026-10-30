import { describe, expect, it } from "vitest";
import { Brush, DataBrushName, HEIGHT_LAYER_ID } from "@logic-incubator/engine/level/LevelFormat";
import { BlockedEdges, ClampHeight, HeightAtCell, HeightColour, HeightMap, MakeHeightBrush, WithHeights } from "./Heights";

const floor: Brush = { name: "floor_1", position: { x: 0, y: 0 }, pixelOffset: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 }, layerId: 0, data: null };
const cells = (...xs: number[]) => xs.map(x => ({ x, y: 0 }));
const heightsOf = (levelData: Brush[]) => levelData.filter(b => b.layerId === HEIGHT_LAYER_ID).map(b => `${b.position.x},${b.position.y}=${b.data}`).sort();

describe("WithHeights", () => {
    it("sets each cell, adding a height brush where there was none and replacing the one there was", () => {
        const before = [floor, MakeHeightBrush({ x: 1, y: 0 }, 5)];
        const after = WithHeights(before, cells(0, 1), { height: 2 });
        expect(heightsOf(after)).toEqual(["0,0=2", "1,0=2"]);
        expect(after[0]).toBe(floor);
        expect(after.filter(b => b.name === DataBrushName.Z_INDEX)).toHaveLength(2);
    });

    it("steps each cell once, however often it's listed, within the heights there are", () => {
        const before = [MakeHeightBrush({ x: 0, y: 0 }, 998)];
        expect(heightsOf(WithHeights(before, cells(0, 0, 1), { delta: 1 }))).toEqual(["0,0=999", "1,0=1"]);
        expect(heightsOf(WithHeights([MakeHeightBrush({ x: 0, y: 0 }, 999)], cells(0), { delta: 5 }))).toEqual(["0,0=999"]);
        expect(ClampHeight(-5000)).toBe(-999);
    });

    it("leaves no brush on a cell brought to 0, as unpainted is 0", () => {
        const before = [MakeHeightBrush({ x: 0, y: 0 }, 1), MakeHeightBrush({ x: 1, y: 0 }, 3)];
        expect(heightsOf(WithHeights(before, cells(0), { delta: -1 }))).toEqual(["1,0=3"]);
        expect(heightsOf(WithHeights(before, cells(0, 1), { height: 0 }))).toEqual([]);
    });

    it("gives back the same array when no cell changes, so it's no undo step", () => {
        const before = [floor, MakeHeightBrush({ x: 1, y: 0 }, 2)];
        expect(WithHeights(before, cells(1), { height: 2 })).toBe(before);
        expect(WithHeights(before, cells(5), { height: 0 })).toBe(before);
    });

    it("only counts heights on the height layer", () => {
        const stray: Brush = { ...MakeHeightBrush({ x: 0, y: 0 }, 4), layerId: -99999 };
        expect(HeightAtCell([stray], { x: 0, y: 0 })).toBe(0);
        expect(HeightMap([stray, MakeHeightBrush({ x: 1, y: 0 }, 2)])).toEqual(new Map([["1,0", 2]]));
        expect(WithHeights([stray], cells(0), { delta: 1 })).toContain(stray);
    });
});

describe("HeightColour", () => {
    it("tells every height from -6 to 10 apart, and stops changing past them", () => {
        const heights = [-6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const colours = heights.map(HeightColour);
        expect(new Set(colours).size).toBe(heights.length);
        colours.forEach(colour => expect(colour).toBeGreaterThanOrEqual(0));
        colours.forEach(colour => expect(colour).toBeLessThanOrEqual(0xffffff));
        expect(HeightColour(999)).toBe(HeightColour(10));
        expect(HeightColour(-999)).toBe(HeightColour(-6));
    });
});

describe("BlockedEdges", () => {
    it("finds each edge between cells more than one apart once, against unpainted ground too", () => {
        const heights = HeightMap([MakeHeightBrush({ x: 0, y: 0 }, 1), MakeHeightBrush({ x: 1, y: 0 }, 3)]);
        const edges = BlockedEdges(heights).map(e => `${e.x},${e.y} ${e.side}`).sort();
        // 0,0 (1) steps to its neighbours fine; 1,0 (3) is too high from 0,0 and from the ground round it.
        expect(edges).toEqual(["0,0 right", "1,-1 bottom", "1,0 bottom", "1,0 right"]);
    });

    it("finds none where every step is one", () => {
        expect(BlockedEdges(HeightMap([MakeHeightBrush({ x: 0, y: 0 }, 1), MakeHeightBrush({ x: 1, y: 0 }, 1), MakeHeightBrush({ x: 5, y: 5 }, -1)]))).toEqual([]);
    });
});
