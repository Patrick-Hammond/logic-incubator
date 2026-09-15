/**
 * Door-bounded region partitioning. Pure - no pixi - so it runs under the
 * plain node test runner (see Regions.test.ts), same reasoning as Doors.ts.
 */

import { Vec2Like } from "../../../_lib/math/Geometry";

/** Orthogonal-only, for the flood fill itself - matches real player reachability (the player's box can't cut through a solid diagonal corner any more than TileCollision already prevents). */
const ORTHOGONAL_OFFSETS: ReadonlyArray<Vec2Like> = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 }
];

/**
 * Orthogonal + diagonal, for boundary-touch only. A rectangular room's own
 * corner wall tile has NO orthogonally-adjacent floor cell at all - its
 * nearest floor cell is diagonal to it (the floor starts one cell in on both
 * axes). Scored only against `ORTHOGONAL_OFFSETS`, every room's four corner
 * tiles would touch zero regions and never render, no matter how ordinary the
 * room. This is purely a rendering-visibility concern, not a reachability
 * one, so it's fine (and necessary) for it to use a more permissive rule than
 * the flood fill.
 */
const ALL_NEIGHBOUR_OFFSETS: ReadonlyArray<Vec2Like> = [
    ...ORTHOGONAL_OFFSETS,
    { x: 1, y: 1 },
    { x: 1, y: -1 },
    { x: -1, y: 1 },
    { x: -1, y: -1 }
];

export type Region = { id: number; cells: Vec2Like[] };

export type RegionMap = {
    /** [x][y] -> region id for a walkable (non-collision, non-door) cell. Absent for wall/door/out-of-bounds cells. */
    regionData: number[][];
    /** [x][y] -> distinct region ids touching a wall/door cell's 8 neighbours (orthogonal + diagonal - see `ALL_NEIGHBOUR_OFFSETS`). Absent wherever regionData is present, and absent for a boundary cell touching no region at all. */
    boundaryRegionData: number[][][];
    /** One entry per connected walkable component; regions[i].id === i. */
    regions: Region[];
};

/** Region id is a real id starting at 0, not a sentinel - every lookup here uses `!== undefined`, never a truthy check, so region 0 isn't mistaken for "no region". */
function IdAt(grid: ReadonlyArray<ReadonlyArray<number>>, x: number, y: number): number | undefined {
    const column = grid[x];
    return column ? column[y] : undefined;
}

/**
 * Partitions the map into regions: connected components of cells that are
 * neither solid (`collisionData`) nor a door (`doorData`), which act as hard
 * boundaries the flood fill never crosses. `width`/`height` are required
 * explicitly (from `Level.boundRect`) because walkable space is defined by
 * *absence* from two other sparse grids - unlike `FindDoorGroups`, which
 * groups a grid's own painted entries, there's no way to enumerate "absent"
 * cells without a bounded dense scan.
 */
export function FindRegions(
    collisionData: ReadonlyArray<ReadonlyArray<boolean>>,
    doorData: ReadonlyArray<ReadonlyArray<boolean>>,
    width: number,
    height: number
): RegionMap {
    const isBoundary = (x: number, y: number): boolean => {
        const c = collisionData[x];
        const d = doorData[x];
        return (c && c[y]) === true || (d && d[y]) === true;
    };

    const regionData: number[][] = [];
    const regions: Region[] = [];

    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
            if (isBoundary(x, y) || IdAt(regionData, x, y) !== undefined) {
                continue;
            }

            const id = regions.length;
            const cells: Vec2Like[] = [];
            const stack: Vec2Like[] = [{ x, y }];
            if (regionData[x] == null) {
                regionData[x] = [];
            }
            regionData[x][y] = id;

            while (stack.length) {
                const cell = stack.pop();
                cells.push(cell);

                ORTHOGONAL_OFFSETS.forEach(offset => {
                    const nx = cell.x + offset.x;
                    const ny = cell.y + offset.y;
                    // Bounded explicitly (not left to isBoundary's graceful
                    // out-of-range undefined) - otherwise a map that isn't
                    // fully walled on every edge would flood-fill outward
                    // into unbounded "open" space past its own bounds.
                    if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
                        return;
                    }
                    if (isBoundary(nx, ny) || IdAt(regionData, nx, ny) !== undefined) {
                        return;
                    }
                    if (regionData[nx] == null) {
                        regionData[nx] = [];
                    }
                    regionData[nx][ny] = id;
                    stack.push({ x: nx, y: ny });
                });
            }

            regions.push({ id, cells });
        }
    }

    const boundaryRegionData: number[][][] = [];
    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
            if (!isBoundary(x, y)) {
                continue;
            }

            const touching = new Set<number>();
            ALL_NEIGHBOUR_OFFSETS.forEach(offset => {
                const regionId = IdAt(regionData, x + offset.x, y + offset.y);
                if (regionId !== undefined) {
                    touching.add(regionId);
                }
            });

            if (touching.size > 0) {
                if (boundaryRegionData[x] == null) {
                    boundaryRegionData[x] = [];
                }
                boundaryRegionData[x][y] = Array.from(touching);
            }
        }
    }

    return { regionData, boundaryRegionData, regions };
}

/** Deduped union of `boundaryRegionData`'s touching-region ids across every cell in `cells` - used to make a multi-cell door one visibility unit regardless of which cell its sprite happens to anchor on (see `Level.ts`). */
export function RegionIdsTouching(
    boundaryRegionData: ReadonlyArray<ReadonlyArray<ReadonlyArray<number>>>,
    cells: ReadonlyArray<Vec2Like>
): number[] {
    const ids = new Set<number>();
    cells.forEach(cell => {
        const column = boundaryRegionData[cell.x];
        const touching = column && column[cell.y];
        if (touching) {
            touching.forEach(id => ids.add(id));
        }
    });
    return Array.from(ids);
}
