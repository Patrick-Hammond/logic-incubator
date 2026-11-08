import { describe, expect, it } from "vitest";
import { BaseName, IsEmptyPiece, ParsePieceName, PieceFrame, PieceGridOf, PieceName } from "./SpritePieces";

describe("piece names", () => {
    it("name a piece by its sprite and place, and take the name apart again", () => {
        expect(PieceName("floor_rug", 1, 0)).toBe("floor_rug@1,0");
        expect(ParsePieceName("floor_rug@1,0")).toEqual({ base: "floor_rug", column: 1, row: 0 });
        expect(ParsePieceName("global.floor_rug@12,3")).toEqual({ base: "global.floor_rug", column: 12, row: 3 });
    });

    it("aren't any other name, nor one spelt with leading zeros", () => {
        expect(ParsePieceName("floor_rug")).toBeNull();
        expect(ParsePieceName("floor_rug@1")).toBeNull();
        expect(ParsePieceName("floor_rug@01,0")).toBeNull();
        expect(ParsePieceName("@1,0")).toBeNull();
        expect(ParsePieceName("floor_rug@-1,0")).toBeNull();
    });

    it("give back the sprite a piece is of, and leave any other name as it is", () => {
        expect(BaseName("floor_rug@1,1")).toBe("floor_rug");
        expect(BaseName("floor_1")).toBe("floor_1");
    });
});

describe("PieceGridOf", () => {
    it("cuts a sprite of whole cells, any number each way", () => {
        expect(PieceGridOf(32, 32)).toEqual({ columns: 2, rows: 2 });
        expect(PieceGridOf(48, 16)).toEqual({ columns: 3, rows: 1 });
        expect(PieceGridOf(16, 64)).toEqual({ columns: 1, rows: 4 });
        expect(PieceGridOf(64, 64, 32)).toEqual({ columns: 2, rows: 2 });
    });

    it("leaves a one-cell sprite, and one that doesn't fit the grid, whole", () => {
        expect(PieceGridOf(16, 16)).toBeNull();
        expect(PieceGridOf(21, 32)).toBeNull();
        expect(PieceGridOf(0, 32)).toBeNull();
    });
});

describe("PieceFrame", () => {
    const orig = { width: 32, height: 32 };

    it("takes a cell of an untrimmed sprite's frame, untrimmed", () => {
        const piece = PieceFrame({ x: 100, y: 50, width: 32, height: 32 }, orig, null, 1, 0);
        expect(piece.frame).toEqual({ x: 116, y: 50, width: 16, height: 16 });
        expect(piece.orig).toEqual({ x: 0, y: 0, width: 16, height: 16 });
        expect(piece.trim).toBeNull();
    });

    it("trims a piece of a trimmed sprite to the art inside its cell", () => {
        // 32x32 art trimmed to x 4..32, y 0..24: the sheet has a 28x24 frame.
        const frame = { x: 10, y: 10, width: 28, height: 24 };
        const trim = { x: 4, y: 0, width: 28, height: 24 };
        const topLeft = PieceFrame(frame, orig, trim, 0, 0);
        expect(topLeft.frame).toEqual({ x: 10, y: 10, width: 12, height: 16 });
        expect(topLeft.trim).toEqual({ x: 4, y: 0, width: 12, height: 16 });
        const topRight = PieceFrame(frame, orig, trim, 1, 0);
        expect(topRight.frame).toEqual({ x: 22, y: 10, width: 16, height: 16 });
        expect(topRight.trim).toBeNull();
        const bottomRight = PieceFrame(frame, orig, trim, 1, 1);
        expect(bottomRight.frame).toEqual({ x: 22, y: 26, width: 16, height: 8 });
        expect(bottomRight.trim).toEqual({ x: 0, y: 0, width: 16, height: 8 });
    });

    it("gives a piece in the trimmed-away margin no art", () => {
        const piece = PieceFrame({ x: 10, y: 10, width: 16, height: 32 }, orig, { x: 0, y: 0, width: 16, height: 32 }, 1, 0);
        expect(IsEmptyPiece(piece.frame)).toBe(true);
        expect(piece.orig).toEqual({ x: 0, y: 0, width: 16, height: 16 });
        expect(IsEmptyPiece(PieceFrame({ x: 0, y: 0, width: 32, height: 32 }, orig, null, 0, 0).frame)).toBe(false);
    });
});
