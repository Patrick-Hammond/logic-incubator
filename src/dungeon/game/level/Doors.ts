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
 * Splits a sparse `[x][y]` boolean grid (`Level.doorData`, derived from any
 * placed tile whose `AssetMetadata` has a `door` id) into 4-connected islands
 * - one per door, however many cells it spans (nothing here assumes a
 * particular shape or count). Each island is tested against the player
 * independently at runtime (see `Level.UpdateDoors`), so two doorways a tile
 * apart never open together.
 *
 * Blind to door *type* - the grid only says "door here", not which one - so
 * two different door types placed on directly-adjacent cells would flood-fill
 * into a single group and `Level.FindDoorTile` would pick just one of their
 * sprite pairs for the whole group. Not handled here; keep different door
 * types at least a cell apart until this is worth solving properly.
 */
export function FindDoorGroups(doorData: ReadonlyArray<ReadonlyArray<boolean>>): Vec2Like[][] {
    const isPainted = (x: number, y: number): boolean => {
        const column = doorData[x];
        return !!column && !!column[y];
    };

    const visited = new Set<string>();
    const groups: Vec2Like[][] = [];

    doorData.forEach((column, x) => {
        if (!column) {
            return;
        }
        column.forEach((painted, y) => {
            const key = x + "," + y;
            if (!painted || visited.has(key)) {
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
                    if (!visited.has(nKey) && isPainted(nx, ny)) {
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
