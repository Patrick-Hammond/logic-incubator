/**
 * Painting with a sprite that's laid in pieces (see `TilePieces`): which piece each cell gets, so the pieces a stamp, a fill
 * or a stroke lays join up into whole sprites. Pure - no pixi - so it runs under the plain node test runner (see
 * PiecePainting.test.ts).
 *
 * Every cell here is in map coordinates, like `ToolGeometry`'s.
 */

import { Vec2Like } from "@logic-incubator/lib/math/Geometry";
import { PieceGrid, PieceName } from "@logic-incubator/lib/loading/SpritePieces";
import { BlockOrigin, PieceAt } from "@logic-incubator/engine/level/TilePieces";
import { CellRect } from "./ToolGeometry";

/**
 * What painting `base` (cut as `grid`) over `cells` lays: the piece each cell gets, counting from a top-left piece on `origin`
 * - leaving out a cell whose piece has no art (`isEmpty` - the sprite is clear there), so what's under it stays.
 */
export function PiecesOver(
    base: string,
    grid: PieceGrid,
    origin: Vec2Like,
    cells: ReadonlyArray<Vec2Like>,
    isEmpty: (name: string) => boolean = () => false
): { cells: Vec2Like[]; names: string[] } {
    const laid: { cells: Vec2Like[]; names: string[] } = { cells: [], names: [] };
    cells.forEach(cell => {
        const at = PieceAt(grid, origin, cell);
        const name = PieceName(base, at.column, at.row);
        if (!isEmpty(name)) {
            laid.cells.push({ x: cell.x, y: cell.y });
            laid.names.push(name);
        }
    });
    return laid;
}

/** The cells a freehand stroke with a `grid` sprite lays as it reaches `cell`: the whole sprite there, edge to edge with the one the stroke began with on `anchor`. */
export function StrokeBlock(grid: PieceGrid, anchor: Vec2Like, cell: Vec2Like): CellRect {
    const origin = BlockOrigin(grid, anchor, cell);
    return { x: origin.x, y: origin.y, width: grid.columns, height: grid.rows };
}
