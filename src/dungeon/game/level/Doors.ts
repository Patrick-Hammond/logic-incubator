/**
 * Door footprint grouping. Pure - no pixi - so it runs under the plain node
 * test runner (see Doors.test.ts), same reasoning as Depth.ts.
 */

import { Vec2Like } from "../../../_lib/math/Geometry";

const NEIGHBOUR_OFFSETS: ReadonlyArray<Vec2Like> = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 }
];

/**
 * Splits a sparse `[x][y]` grid of door ids (`AssetMetadata.door.id` of
 * whichever tile occupies each cell, `undefined` where there's no door) into
 * 4-connected islands - one per door, however many cells it spans (nothing
 * here assumes a particular shape or count). Each island is tested against
 * the player independently at runtime (see `Level.UpdateDoors`), so two
 * doorways a tile apart never open together.
 *
 * Grouping requires matching ids, not just "a door" - two different door
 * types on directly-adjacent cells stay separate islands (each still finds
 * its own sprite pair in `Level.FindDoorTile`) rather than merging into one
 * that only tracks whichever tile was found first.
 */
export function FindDoorGroups(doorIds: ReadonlyArray<ReadonlyArray<number | undefined>>): Vec2Like[][] {
    const idAt = (x: number, y: number): number | undefined => {
        const column = doorIds[x];
        return column ? column[y] : undefined;
    };

    const visited = new Set<string>();
    const groups: Vec2Like[][] = [];

    doorIds.forEach((column, x) => {
        if (!column) {
            return;
        }
        column.forEach((id, y) => {
            const key = x + "," + y;
            if (id === undefined || visited.has(key)) {
                return;
            }

            const group: Vec2Like[] = [];
            const stack: Vec2Like[] = [{ x, y }];
            visited.add(key);

            while (stack.length) {
                const cell = stack.pop();
                group.push(cell);

                NEIGHBOUR_OFFSETS.forEach(offset => {
                    const nx = cell.x + offset.x;
                    const ny = cell.y + offset.y;
                    const nKey = nx + "," + ny;
                    if (!visited.has(nKey) && idAt(nx, ny) === id) {
                        visited.add(nKey);
                        stack.push({ x: nx, y: ny });
                    }
                });
            }

            groups.push(group);
        });
    });

    return groups;
}

/**
 * Every cell a door sprite covers on screen, not just the cell its brush is
 * anchored to - a 32x32 door leaf on 16px tiles spans a 2x2 block, and only
 * marking the anchor left the doorway's other cells as plain floor (so the
 * region flood fill leaked straight through, and the door only triggered from
 * its top-left tile).
 *
 * Mirrors how `TileMap` draws a tile: a `size` box at the anchor cell's
 * top-left minus `pixelOffset`. Rotation/flips are deliberately ignored -
 * `Tilemap` rotates the texture's UVs within that same box, it never moves or
 * resizes the box itself. Cells can be negative (an editor map painted left
 * of/above its origin, or a door nudged past it) - callers clip as they need.
 */
export function DoorFootprint(
    anchor: Vec2Like,
    size: { width: number; height: number },
    pixelOffset: Vec2Like,
    tileSize: number
): Vec2Like[] {
    const left = anchor.x * tileSize - pixelOffset.x;
    const top = anchor.y * tileSize - pixelOffset.y;
    const x0 = Math.floor(left / tileSize);
    const y0 = Math.floor(top / tileSize);
    // At least one cell either way, so a degenerate (0-size) texture still behaves like the old anchor-only door.
    const x1 = Math.max(x0 + 1, Math.ceil((left + size.width) / tileSize));
    const y1 = Math.max(y0 + 1, Math.ceil((top + size.height) / tileSize));

    const cells: Vec2Like[] = [];
    for (let x = x0; x < x1; x++) {
        for (let y = y0; y < y1; y++) {
            cells.push({ x, y });
        }
    }
    return cells;
}
