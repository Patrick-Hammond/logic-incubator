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
 * Splits a sparse `[x][y]` boolean grid (`Level.doorData`, painted with the
 * `DOOR` data brush) into 4-connected islands - one per door, however many
 * cells the author painted for it (the docs describe a 2x2 footprint under a
 * 32x32 door sprite, but nothing here assumes that exact shape or count).
 * Each island is tested against the player independently at runtime (see
 * `Level.UpdateDoors`), so two doorways a tile apart never open together.
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
