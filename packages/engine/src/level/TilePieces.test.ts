import { describe, expect, it } from "vitest";
import { PieceSize } from "@logic-incubator/lib/loading/SpritePieces";
import { TileSize } from "../Constants";
import { BlockOrigin, IsPieceable, PieceAt, PieceBlockCells, TilePieceGrid } from "./TilePieces";

describe("IsPieceable", () => {
    it("takes a floor or walls tile that's just a picture", () => {
        expect(IsPieceable({ category: "floor" })).toBe(true);
        expect(IsPieceable({ category: "walls", collidable: true, blocksLight: true })).toBe(true);
    });

    it("keeps anything that does something whole, and anything that isn't floor or walls", () => {
        expect(IsPieceable(undefined)).toBe(false);
        expect(IsPieceable({})).toBe(false);
        expect(IsPieceable({ category: "entities" })).toBe(false);
        expect(IsPieceable({ category: "misc" })).toBe(false);
        expect(IsPieceable({ category: "walls", door: { id: 1, open: false } })).toBe(false);
        expect(IsPieceable({ category: "walls", light: { brightness: 1, tint: 0xffffff, range: 4 } })).toBe(false);
        expect(IsPieceable({ category: "floor", spawner: { monsters: ["goblin"] } as never })).toBe(false);
        expect(IsPieceable({ category: "floor", pickup: { kind: "gold", amount: 1 } })).toBe(false);
        expect(IsPieceable({ category: "walls", sound: "drip" })).toBe(false);
        expect(IsPieceable({ category: "walls", loop: "fountain" })).toBe(false);
    });
});

describe("TilePieceGrid", () => {
    it("cuts a pieceable sprite of whole tiles, and lays the rest whole", () => {
        expect(TilePieceGrid({ category: "floor" }, { width: 32, height: 32 }, 16)).toEqual({ columns: 2, rows: 2 });
        expect(TilePieceGrid({ category: "walls" }, { width: 48, height: 32 }, 16)).toEqual({ columns: 3, rows: 2 });
        expect(TilePieceGrid({ category: "floor" }, { width: 16, height: 16 }, 16)).toBeNull();
        expect(TilePieceGrid({ category: "walls" }, { width: 21, height: 32 }, 16)).toBeNull();
        expect(TilePieceGrid({ category: "walls", door: { id: 1, open: true } }, { width: 32, height: 32 }, 16)).toBeNull();
    });

    it("cuts pieces the size of the engine's tiles", () => {
        expect(PieceSize).toBe(TileSize);
    });
});

describe("PieceAt", () => {
    const grid = { columns: 2, rows: 3 };

    it("counts pieces from the origin, repeating either side of it", () => {
        expect(PieceAt(grid, { x: 5, y: 5 }, { x: 5, y: 5 })).toEqual({ column: 0, row: 0 });
        expect(PieceAt(grid, { x: 5, y: 5 }, { x: 6, y: 7 })).toEqual({ column: 1, row: 2 });
        expect(PieceAt(grid, { x: 5, y: 5 }, { x: 7, y: 8 })).toEqual({ column: 0, row: 0 });
        expect(PieceAt(grid, { x: 5, y: 5 }, { x: 4, y: 4 })).toEqual({ column: 1, row: 2 });
    });
});

describe("BlockOrigin", () => {
    it("lays whole sprites edge to edge from where the stroke began, whichever way it goes", () => {
        const grid = { columns: 2, rows: 2 };
        expect(BlockOrigin(grid, { x: 3, y: 3 }, { x: 3, y: 3 })).toEqual({ x: 3, y: 3 });
        expect(BlockOrigin(grid, { x: 3, y: 3 }, { x: 4, y: 4 })).toEqual({ x: 3, y: 3 });
        expect(BlockOrigin(grid, { x: 3, y: 3 }, { x: 5, y: 3 })).toEqual({ x: 5, y: 3 });
        expect(BlockOrigin(grid, { x: 3, y: 3 }, { x: 2, y: 1 })).toEqual({ x: 1, y: 1 });
    });
});

describe("PieceBlockCells", () => {
    it("lists the whole sprite a piece is part of", () => {
        expect(PieceBlockCells({ x: 4, y: 5 }, { column: 1, row: 0, columns: 2, rows: 2 })).toEqual([
            { x: 3, y: 5 },
            { x: 4, y: 5 },
            { x: 3, y: 6 },
            { x: 4, y: 6 }
        ]);
    });
});
