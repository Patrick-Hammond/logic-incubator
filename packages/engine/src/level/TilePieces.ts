/**
 * Tiles laid in pieces. A floor or walls sprite bigger than a tile, and a whole number of tiles each way (a 32x32 floor,
 * a 48x32 stretch of wall), is cut into tile-sized pieces (see `SpritePieces`) that the editor lays a cell at a time, so
 * a level only ever holds one-cell tiles: lit, raised, collided with and erased cell by cell like any other. A sprite
 * that does something - a door, a light, a spawner, a pickup, one with a sound - stays whole, since cutting it would
 * make four doors or four lights of it.
 *
 * Which piece goes on a cell is counted from a cell the editor picks (the top-left of a stamp, the cell a stroke
 * started on), repeating, so pieces laid together always join up into whole sprites.
 *
 * Pure - no pixi - so it runs under the plain node test runner (see TilePieces.test.ts).
 */

import { Vec2Like } from "@logic-incubator/lib/math/Geometry";
import { PieceGrid, PieceGridOf } from "@logic-incubator/lib/loading/SpritePieces";
import type { AssetMetadata } from "./AssetMetadata";

/** A tile that's one piece of a bigger sprite: its place in it, and how many pieces that is across and down. */
export type TilePiece = { column: number; row: number; columns: number; rows: number };

/** Whether a sprite with `meta` may be laid in pieces: a floor or walls tile with nothing that makes it more than its picture. */
export function IsPieceable(meta: AssetMetadata | undefined): boolean {
    return (
        !!meta &&
        (meta.category === "floor" || meta.category === "walls") &&
        !meta.door &&
        !meta.light &&
        !meta.spawner &&
        meta.pickup === undefined &&
        meta.sound === undefined &&
        meta.loop === undefined
    );
}

/** The pieces a sprite of `size` pixels with `meta` is laid as - null for one that's laid whole, as one tile. */
export function TilePieceGrid(meta: AssetMetadata | undefined, size: { width: number; height: number }, tileSize: number): PieceGrid | null {
    return IsPieceable(meta) ? PieceGridOf(size.width, size.height, tileSize) : null;
}

function Mod(value: number, by: number): number {
    return ((value % by) + by) % by;
}

/** The piece of a `grid` sprite that goes on `cell`, counting from a top-left piece on `origin` - any cell, either side of it. */
export function PieceAt(grid: PieceGrid, origin: Vec2Like, cell: Vec2Like): { column: number; row: number } {
    return { column: Mod(cell.x - origin.x, grid.columns), row: Mod(cell.y - origin.y, grid.rows) };
}

/**
 * The top-left cell of the whole sprite a stroke that started on `anchor` lays as it reaches `cell`: the sprites it lays sit
 * edge to edge from the first, whichever way it goes.
 */
export function BlockOrigin(grid: PieceGrid, anchor: Vec2Like, cell: Vec2Like): Vec2Like {
    const at = PieceAt(grid, anchor, cell);
    return { x: cell.x - at.column, y: cell.y - at.row };
}

/** Every cell of the whole sprite `piece` (on `cell`) is part of, row by row. */
export function PieceBlockCells(cell: Vec2Like, piece: TilePiece): Vec2Like[] {
    const cells: Vec2Like[] = [];
    for (let row = 0; row < piece.rows; row++) {
        for (let column = 0; column < piece.columns; column++) {
            cells.push({ x: cell.x - piece.column + column, y: cell.y - piece.row + row });
        }
    }
    return cells;
}
