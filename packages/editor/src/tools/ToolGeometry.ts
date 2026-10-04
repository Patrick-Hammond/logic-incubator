/**
 * Cell maths behind the editor's map tools (see `Tools`): the cells a stamp
 * rectangle or its border covers, the region a fill spreads over, and which
 * placed brush is on top at a cell (or covers it, for a sprite bigger than a tile). Pure - no pixi - so it runs under the
 * plain node test runner (see ToolGeometry.test.ts).
 *
 * Every cell here is in map coordinates (a brush's stored `position`), not
 * the view-relative cells the cursor reports.
 */

import { Vec2Like } from "@logic-incubator/lib/math/Geometry";

/** A block of cells: `x`/`y` its top-left cell, `width`/`height` in cells. */
export type CellRect = { x: number; y: number; width: number; height: number };

/** The rectangle two corner cells span, whichever way round they are. */
export function SpanRect(a: Vec2Like, b: Vec2Like): CellRect {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    return { x, y, width: Math.abs(a.x - b.x) + 1, height: Math.abs(a.y - b.y) + 1 };
}

/** Every cell of `rect`, row by row - or with `border`, just its one-cell-thick outline. */
export function RectCells(rect: CellRect, border = false): Vec2Like[] {
    const cells: Vec2Like[] = [];
    const right = rect.x + rect.width - 1;
    const bottom = rect.y + rect.height - 1;
    for (let y = rect.y; y <= bottom; y++) {
        for (let x = rect.x; x <= right; x++) {
            if (!border || x === rect.x || x === right || y === rect.y || y === bottom) {
                cells.push({ x, y });
            }
        }
    }
    return cells;
}

export function InRect(rect: CellRect, x: number, y: number): boolean {
    return x >= rect.x && y >= rect.y && x < rect.x + rect.width && y < rect.y + rect.height;
}

/**
 * The cells a fill from `start` spreads over: `start` and every cell joined to it edge-to-edge
 * (4-neighbours) through cells with the same `keyAt` - so it's bounded by any cell holding
 * something else, and by `bounds` (the visible map, so filling open space can't run off forever).
 * Empty if `start` is outside `bounds`.
 */
export function FloodFill(start: Vec2Like, bounds: CellRect, keyAt: (x: number, y: number) => string): Vec2Like[] {
    if (!InRect(bounds, start.x, start.y)) {
        return [];
    }
    const target = keyAt(start.x, start.y);
    const seen = new Set<string>([start.x + "," + start.y]);
    const cells: Vec2Like[] = [];
    const queue: Vec2Like[] = [{ x: start.x, y: start.y }];
    while (queue.length) {
        const cell = queue.pop();
        cells.push(cell);
        const neighbours = [
            { x: cell.x + 1, y: cell.y },
            { x: cell.x - 1, y: cell.y },
            { x: cell.x, y: cell.y + 1 },
            { x: cell.x, y: cell.y - 1 }
        ];
        neighbours.forEach(n => {
            const key = n.x + "," + n.y;
            if (!seen.has(key) && InRect(bounds, n.x, n.y) && keyAt(n.x, n.y) === target) {
                seen.add(key);
                queue.push(n);
            }
        });
    }
    return cells;
}

type PlacedLike = { position: Vec2Like; layerId: number };
type LayerLike = { id: number; visible: boolean };

/** The brush on top, among those `covers` says are at the cell - see `TopmostBrushAt`. */
function TopmostWhere<B extends PlacedLike>(
    brushes: ReadonlyArray<B>,
    layers: ReadonlyArray<LayerLike>,
    covers: (brush: B) => boolean,
    accept: (brush: B) => boolean
): B | undefined {
    const layerOrder = new Map<number, number>();
    layers.forEach((layer, index) => {
        if (layer.visible) {
            layerOrder.set(layer.id, index);
        }
    });
    let best: B | undefined;
    let bestLayer = -1;
    brushes.forEach(brush => {
        const order = layerOrder.get(brush.layerId);
        if (order !== undefined && order >= bestLayer && covers(brush) && accept(brush)) {
            best = brush;
            bestLayer = order;
        }
    });
    return best;
}

/**
 * The brush drawn on top at `cell`: on the last of `layers` that has one (layers later in the list
 * draw over earlier ones, as `Canvas` stacks them), and the last painted within that layer. Hidden
 * layers, layers not in `layers`, and brushes `accept` rejects are skipped. A brush is only at the
 * cell it's anchored on - see `TopmostBrushCovering` for sprites that span several.
 */
export function TopmostBrushAt<B extends PlacedLike>(
    brushes: ReadonlyArray<B>,
    layers: ReadonlyArray<LayerLike>,
    cell: Vec2Like,
    accept: (brush: B) => boolean = () => true
): B | undefined {
    return TopmostWhere(brushes, layers, brush => brush.position.x === cell.x && brush.position.y === cell.y, accept);
}

/** How far (in cells) from its anchor a sprite's footprint is assumed to reach - the cheap test that spares working out the footprint of every brush on the map. */
export const FootprintReach = 8;

/**
 * Like `TopmostBrushAt`, but a brush is on top at every cell of its footprint (`footprintOf`), not just the
 * one it's anchored on: a 2x2 spawner or door is the brush at all four of its cells. Brushes anchored more
 * than `FootprintReach` cells away are skipped without asking, and `accept` is asked before the footprint,
 * so what's slow to work out is only worked out for the few brushes that could be it.
 */
export function TopmostBrushCovering<B extends PlacedLike>(
    brushes: ReadonlyArray<B>,
    layers: ReadonlyArray<LayerLike>,
    cell: Vec2Like,
    footprintOf: (brush: B) => ReadonlyArray<Vec2Like>,
    accept: (brush: B) => boolean = () => true
): B | undefined {
    return TopmostWhere(
        brushes,
        layers,
        brush =>
            Math.abs(brush.position.x - cell.x) <= FootprintReach &&
            Math.abs(brush.position.y - cell.y) <= FootprintReach &&
            accept(brush) &&
            footprintOf(brush).some(c => c.x === cell.x && c.y === cell.y),
        () => true
    );
}

/** The smallest block of cells holding all of `cells` - empty (0 x 0 at the origin) for none. */
export function BoundsOfCells(cells: ReadonlyArray<Vec2Like>): CellRect {
    if (!cells.length) {
        return { x: 0, y: 0, width: 0, height: 0 };
    }
    const xs = cells.map(c => c.x);
    const ys = cells.map(c => c.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, width: Math.max(...xs) - x + 1, height: Math.max(...ys) - y + 1 };
}
