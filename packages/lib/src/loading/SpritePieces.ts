/**
 * Pieces of a sprite: a sprite bigger than one cell, cut into cell-sized pieces so it can be laid a cell at a
 * time - a 32x32 floor tile on a 16px grid is four. A piece is named after its sprite and its place in it,
 * column then row from the top-left: `floor_rug@1,0` is the second piece along the top row of `floor_rug`.
 * `AssetFactory` cuts a piece the first time its name is asked for, so a level only ever stores names.
 * Pure - no pixi - so it runs under the plain node test runner (see SpritePieces.test.ts).
 */

/** The cell a piece fills, in pixels: the engine's `TileSize`. */
export const PieceSize = 16;

/** How many pieces a sprite is cut into across (`columns`) and down (`rows`). */
export type PieceGrid = { columns: number; rows: number };

/** A piece name taken apart: the sprite it's cut from, and its place in it. */
export type PieceRef = { base: string; column: number; row: number };

export type PieceRect = { x: number; y: number; width: number; height: number };

/** No leading zeros, so each piece has one name and `AssetFactory` registers it once. */
const PIECE = /^(.+)@(0|[1-9]\d*),(0|[1-9]\d*)$/;

/** The name of the piece of `base` in `column`, `row`. */
export function PieceName(base: string, column: number, row: number): string {
    return base + "@" + column + "," + row;
}

/** `name` taken apart, if it's a piece's - null for any other name. */
export function ParsePieceName(name: string): PieceRef | null {
    const match = PIECE.exec(name);
    return match ? { base: match[1], column: Number(match[2]), row: Number(match[3]) } : null;
}

/** The sprite a piece is cut from - or `name` itself, for anything that isn't a piece. */
export function BaseName(name: string): string {
    const piece = ParsePieceName(name);
    return piece ? piece.base : name;
}

/**
 * The pieces a sprite `width` by `height` pixels cuts into: a whole number of cells each way, and more than one in
 * all. Null for a sprite of one cell, or one that doesn't fit the grid (a 21x32 door), which can't be cut evenly.
 */
export function PieceGridOf(width: number, height: number, size = PieceSize): PieceGrid | null {
    if (!(width > 0) || !(height > 0) || width % size !== 0 || height % size !== 0) {
        return null;
    }
    const grid = { columns: width / size, rows: height / size };
    return grid.columns * grid.rows > 1 ? grid : null;
}

/**
 * Where a piece's art is, for a texture made of part of another: `source` is the sprite's frame (where its art sits
 * on the sheet), `orig` its untrimmed size, and `trim` where in that the art is (null if it's untrimmed). Gives the
 * same three for the piece in `column`, `row`, `size` pixels square: its art is the part of the sprite's art inside
 * that square, so a piece of a trimmed sprite is trimmed too. A piece wholly in the trimmed-away margin has no art
 * at all - a 0 by 0 frame (see `IsEmptyPiece`).
 */
export function PieceFrame(
    source: PieceRect,
    orig: { width: number; height: number },
    trim: PieceRect | null,
    column: number,
    row: number,
    size = PieceSize
): { frame: PieceRect; orig: PieceRect; trim: PieceRect | null } {
    const art = trim || { x: 0, y: 0, width: orig.width, height: orig.height };
    const cell = { x: column * size, y: row * size };
    const left = Math.max(cell.x, art.x);
    const top = Math.max(cell.y, art.y);
    const right = Math.min(cell.x + size, art.x + art.width);
    const bottom = Math.min(cell.y + size, art.y + art.height);
    const pieceOrig = { x: 0, y: 0, width: size, height: size };
    if (right <= left || bottom <= top) {
        return { frame: { x: source.x, y: source.y, width: 0, height: 0 }, orig: pieceOrig, trim: { x: 0, y: 0, width: 0, height: 0 } };
    }
    const frame = { x: source.x + left - art.x, y: source.y + top - art.y, width: right - left, height: bottom - top };
    const whole = frame.width === size && frame.height === size;
    return { frame, orig: pieceOrig, trim: whole ? null : { x: left - cell.x, y: top - cell.y, width: frame.width, height: frame.height } };
}

/** Whether a piece (as `PieceFrame` gives it) has no art - its sprite is clear there, and trimmed away. */
export function IsEmptyPiece(frame: { width: number; height: number }): boolean {
    return frame.width === 0 || frame.height === 0;
}
