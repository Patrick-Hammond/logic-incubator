import { describe, expect, it } from "vitest";
import { PiecesOver, StrokeBlock } from "./PiecePainting";
import { RectCells } from "./ToolGeometry";

describe("PiecesOver", () => {
    const grid = { columns: 2, rows: 2 };

    it("gives each cell the piece that joins up with the rest, counting from the origin", () => {
        const laid = PiecesOver("rug", grid, { x: 3, y: 4 }, RectCells({ x: 3, y: 4, width: 3, height: 2 }));
        expect(laid.names).toEqual(["rug@0,0", "rug@1,0", "rug@0,0", "rug@0,1", "rug@1,1", "rug@0,1"]);
        expect(laid.cells).toEqual(RectCells({ x: 3, y: 4, width: 3, height: 2 }));
    });

    it("leaves out a cell whose piece has no art", () => {
        const laid = PiecesOver("arch", grid, { x: 0, y: 0 }, RectCells({ x: 0, y: 0, width: 2, height: 2 }), name => name === "arch@1,0");
        expect(laid.names).toEqual(["arch@0,0", "arch@0,1", "arch@1,1"]);
        expect(laid.cells).toEqual([
            { x: 0, y: 0 },
            { x: 0, y: 1 },
            { x: 1, y: 1 }
        ]);
    });
});

describe("StrokeBlock", () => {
    it("is the whole sprite under the cursor, edge to edge with the stroke's first", () => {
        const grid = { columns: 2, rows: 1 };
        expect(StrokeBlock(grid, { x: 4, y: 4 }, { x: 4, y: 4 })).toEqual({ x: 4, y: 4, width: 2, height: 1 });
        expect(StrokeBlock(grid, { x: 4, y: 4 }, { x: 7, y: 5 })).toEqual({ x: 6, y: 5, width: 2, height: 1 });
        expect(StrokeBlock(grid, { x: 4, y: 4 }, { x: 3, y: 4 })).toEqual({ x: 2, y: 4, width: 2, height: 1 });
    });
});
