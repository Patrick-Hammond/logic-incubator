import { describe, expect, it } from "vitest";
import { FindRegions, RegionIdsTouching } from "./Regions";

/** Build collision+door grids from one ASCII map. '#' = collision, 'D' = door, anything else = open floor. */
function parse(map: string): { collisionData: boolean[][]; doorData: boolean[][]; width: number; height: number } {
    const rows = map.replace(/^\n/, "").replace(/\n\s*$/, "").split("\n").map(r => r.replace(/\s+$/, ""));
    const width = Math.max(...rows.map(r => r.length));
    const height = rows.length;
    const collisionData: boolean[][] = [];
    const doorData: boolean[][] = [];
    for (let x = 0; x < width; x++) {
        collisionData[x] = [];
        doorData[x] = [];
        for (let y = 0; y < height; y++) {
            const ch = rows[y][x];
            if (ch === "#") {
                collisionData[x][y] = true;
            } else if (ch === "D") {
                doorData[x][y] = true;
            }
        }
    }
    return { collisionData, doorData, width, height };
}

describe("FindRegions", () => {
    it("groups a two-room map split by one door into two regions, both touching it", () => {
        const { collisionData, doorData, width, height } = parse(`
.....#.....
.....D.....
.....#.....
`);
        const { regionData, boundaryRegionData, regions } = FindRegions(collisionData, doorData, width, height);

        expect(regions.length).toBe(2);
        expect(regionData[0][0]).not.toBe(regionData[10][0]);

        const touching = RegionIdsTouching(boundaryRegionData, [{ x: 5, y: 1 }]);
        expect(touching.sort()).toEqual([0, 1]);
    });

    it("a door at the map edge touches exactly one region, with no out-of-bounds throw", () => {
        const { collisionData, doorData, width, height } = parse("D....");
        expect(() => FindRegions(collisionData, doorData, width, height)).not.toThrow();

        const { boundaryRegionData } = FindRegions(collisionData, doorData, width, height);
        expect(RegionIdsTouching(boundaryRegionData, [{ x: 0, y: 0 }])).toEqual([0]);
    });

    it("a door at a junction can touch 3+ distinct regions", () => {
        const { collisionData, doorData, width, height } = parse(`
#.#
.D.
#.#
`);
        const { boundaryRegionData, regions } = FindRegions(collisionData, doorData, width, height);

        expect(regions.length).toBe(4);
        const touching = RegionIdsTouching(boundaryRegionData, [{ x: 1, y: 1 }]);
        expect(touching.sort()).toEqual([0, 1, 2, 3]);
    });

    it("keeps regions separated by a solid wall with no gap as distinct, unconnected regions", () => {
        const { collisionData, doorData, width, height } = parse(`
...#...
...#...
`);
        const { regions } = FindRegions(collisionData, doorData, width, height);

        expect(regions.length).toBe(2);
        expect(regions[0].cells.length).toBe(6);
        expect(regions[1].cells.length).toBe(6);
    });

    it("uses a dense bounded scan, not a sparse forEach over collisionData/doorData", () => {
        // Genuinely sparse input: a single painted cell far from the origin,
        // nothing else assigned anywhere in either grid. A sparse `forEach`
        // over these arrays would visit nothing near the origin at all.
        const collisionData: boolean[][] = [];
        collisionData[15] = [];
        collisionData[15][15] = true;
        const doorData: boolean[][] = [];

        const { regionData, regions } = FindRegions(collisionData, doorData, 20, 20);

        expect(regionData[0][0]).toBeDefined();
        expect(regionData[5][5]).toBeDefined();
        const wallColumn = regionData[15];
        expect(wallColumn ? wallColumn[15] : undefined).toBeUndefined();
        expect(regions.length).toBe(1);
        expect(regions[0].cells.length).toBe(20 * 20 - 1);
    });

    it("with zero doors and zero walls, produces exactly one region covering every cell", () => {
        const { collisionData, doorData, width, height } = parse(`
....
....
....
....
`);
        const { regions } = FindRegions(collisionData, doorData, width, height);

        expect(regions.length).toBe(1);
        expect(regions[0].cells.length).toBe(16);
    });

    it("assigns region id 0 to the first region, and boundaryRegionData reports it correctly (not confused with 'no region')", () => {
        const { collisionData, doorData, width, height } = parse("..#");
        const { boundaryRegionData, regions } = FindRegions(collisionData, doorData, width, height);

        expect(regions[0].id).toBe(0);
        expect(boundaryRegionData[2][0]).toEqual([0]);
    });

    it("a rectangular room's own corner wall touches its room, even though its nearest floor cell is only diagonal to it", () => {
        // The corner cell (0,0) has no orthogonally-adjacent floor at all -
        // (1,0) and (0,1) are both wall, its only nearby floor is the
        // diagonal (1,1). Every ordinary rectangular room has this shape at
        // all four corners, so this is the regression test for the bug
        // reported live: room corners were rendering as invisible.
        const { collisionData, doorData, width, height } = parse(`
##.
#..
...
`);
        const { boundaryRegionData } = FindRegions(collisionData, doorData, width, height);

        expect(RegionIdsTouching(boundaryRegionData, [{ x: 0, y: 0 }])).toEqual([0]);
    });

    it("keeps two floor cells separate when they touch only diagonally through solid walls on both sides (the flood fill itself stays orthogonal-only)", () => {
        const { collisionData, doorData, width, height } = parse(`
.#
#.
`);
        const { regions } = FindRegions(collisionData, doorData, width, height);

        expect(regions.length).toBe(2);
    });
});

describe("RegionIdsTouching", () => {
    it("dedupes when multiple cells touch overlapping regions", () => {
        const { collisionData, doorData, width, height } = parse(`
#.#
.D.
#.#
`);
        const { boundaryRegionData } = FindRegions(collisionData, doorData, width, height);

        // Passing the same door cell twice must not double up the result.
        const touching = RegionIdsTouching(boundaryRegionData, [{ x: 1, y: 1 }, { x: 1, y: 1 }]);
        expect(touching.sort()).toEqual([0, 1, 2, 3]);
    });

    it("unions a multi-cell-deep door's touching regions, even though neither cell alone reaches both sides", () => {
        // A single-wide, 2-cell-deep vertical door: the top door cell's only
        // open neighbour is the region to its north, the bottom door cell's
        // only open neighbour is the region to its south - mirrors a real
        // door painted 2 cells deep in the direction of travel.
        const { collisionData, doorData, width, height } = parse(`
.
D
D
.
`);
        const { boundaryRegionData } = FindRegions(collisionData, doorData, width, height);

        const northCell = { x: 0, y: 1 };
        const southCell = { x: 0, y: 2 };
        expect(RegionIdsTouching(boundaryRegionData, [northCell])).toEqual([0]);
        expect(RegionIdsTouching(boundaryRegionData, [southCell])).toEqual([1]);

        const union = RegionIdsTouching(boundaryRegionData, [northCell, southCell]);
        expect(union.sort()).toEqual([0, 1]);
    });

    it("region id 0 is not dropped when it's the only touching region", () => {
        const { collisionData, doorData, width, height } = parse("..#");
        const { boundaryRegionData } = FindRegions(collisionData, doorData, width, height);

        expect(RegionIdsTouching(boundaryRegionData, [{ x: 2, y: 0 }])).toEqual([0]);
    });

    it("returns an empty array for cells with no boundary data at all", () => {
        const { boundaryRegionData } = FindRegions([], [], 3, 3);
        expect(RegionIdsTouching(boundaryRegionData, [{ x: 0, y: 0 }])).toEqual([]);
    });
});
