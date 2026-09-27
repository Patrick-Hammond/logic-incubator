/**
 * Cell maths behind the editor's map tools (see `Tools`): the cells a stamp
 * rectangle or its border covers, the region a fill spreads over, and which
 * placed brush is on top at a cell. Pure - no pixi - so it runs under the
 * plain node test runner (see ToolGeometry.test.ts).
 *
 * Every cell here is in map coordinates (a brush's stored `position`), not
 * the view-relative cells the cursor reports.
 */

import { Vec2Like } from "../../../_lib/math/Geometry";

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

/**
 * The brush drawn on top at `cell`: on the last of `layers` that has one (layers later in the list
 * draw over earlier ones, as `Canvas` stacks them), and the last painted within that layer. Hidden
 * layers, layers not in `layers`, and brushes `accept` rejects are skipped.
 */
export function TopmostBrushAt<B extends PlacedLike>(
    brushes: ReadonlyArray<B>,
    layers: ReadonlyArray<LayerLike>,
    cell: Vec2Like,
    accept: (brush: B) => boolean = () => true
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
        if (order !== undefined && order >= bestLayer && brush.position.x === cell.x && brush.position.y === cell.y && accept(brush)) {
            best = brush;
            bestLayer = order;
        }
    });
    return best;
}
