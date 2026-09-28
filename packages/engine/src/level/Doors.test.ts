import { describe, expect, it } from "vitest";
import { DoorFootprint, FindDoorGroups } from "./Doors";
import { FindRegions } from "./Regions";

/** Build a door-id grid from an ASCII map. Any non-'.' character is a door cell, its id being that character's char code (so '#' and '$' are automatically different ids) - '.' is unpainted. */
function grid(map: string): (number | undefined)[][] {
    const rows = map.replace(/^\n/, "").replace(/\n\s*$/, "").split("\n").map(r => r.replace(/\s+$/, ""));
    const width = Math.max(...rows.map(r => r.length));
    const data: (number | undefined)[][] = [];
    for (let x = 0; x < width; x++) {
        data[x] = [];
        for (let y = 0; y < rows.length; y++) {
            if (rows[y][x] !== "." && rows[y][x] !== undefined) {
                data[x][y] = rows[y][x].charCodeAt(0);
            }
        }
    }
    return data;
}

function keys(group: { x: number; y: number }[]): string[] {
    return group.map(c => `${c.x},${c.y}`).sort();
}

describe("FindDoorGroups", () => {
    it("returns nothing for an empty or fully unpainted grid", () => {
        expect(FindDoorGroups([])).toEqual([]);
        expect(FindDoorGroups(grid("..\n.."))).toEqual([]);
    });

    it("groups a 2x2 door (the documented footprint) into one island", () => {
        const groups = FindDoorGroups(grid(`
##
##
`));
        expect(groups.length).toBe(1);
        expect(keys(groups[0])).toEqual(["0,0", "0,1", "1,0", "1,1"]);
    });

    it("keeps two doors one tile apart as separate islands", () => {
        const groups = FindDoorGroups(grid(`
##.##
##.##
`));
        expect(groups.length).toBe(2);
        expect(groups.map(g => g.length).sort()).toEqual([4, 4]);
    });

    it("does not connect cells that only touch diagonally", () => {
        const groups = FindDoorGroups(grid(`
#.
.#
`));
        expect(groups.length).toBe(2);
        expect(groups[0].length).toBe(1);
        expect(groups[1].length).toBe(1);
    });

    it("handles an irregularly-shaped or odd-sized door", () => {
        const groups = FindDoorGroups(grid(`
.#.
###
.#.
`));
        expect(groups.length).toBe(1);
        expect(groups[0].length).toBe(5);
    });

    it("is not thrown off by sparse/ragged columns", () => {
        const data: (number | undefined)[][] = [];
        data[3] = [];
        data[3][5] = 1;
        data[3][6] = 1;
        const groups = FindDoorGroups(data);
        expect(groups.length).toBe(1);
        expect(keys(groups[0])).toEqual(["3,5", "3,6"]);
    });

    it("keeps two different door types on directly-adjacent cells as separate islands", () => {
        // '#' and '$' are different ids (different char codes) - this is the exact case that used to
        // merge into one group and leave one of the two door types never wired up to trigger.
        const groups = FindDoorGroups(grid(`
##$$
`));
        expect(groups.length).toBe(2);
        expect(groups.map(g => keys(g)).sort()).toEqual([
            ["0,0", "1,0"],
            ["2,0", "3,0"]
        ]);
    });

    it("still merges same-id cells into one island even when a different id is adjacent", () => {
        const groups = FindDoorGroups(grid(`
###$
`));
        expect(groups.length).toBe(2);
        expect(groups.map(g => g.length).sort()).toEqual([1, 3]);
    });
});

describe("DoorFootprint", () => {
    const TILE = 16;
    const noOffset = { x: 0, y: 0 };

    it("covers the full 2x2 block of a 32x32 door leaf, not just its anchor cell", () => {
        expect(keys(DoorFootprint({ x: 59, y: 28 }, { width: 32, height: 32 }, noOffset, TILE)))
            .toEqual(["59,28", "59,29", "60,28", "60,29"]);
    });

    it("is a single cell for a one-tile sprite", () => {
        expect(keys(DoorFootprint({ x: 3, y: 4 }, { width: 16, height: 16 }, noOffset, TILE))).toEqual(["3,4"]);
    });

    it("rounds a partially-covered cell up to included", () => {
        expect(keys(DoorFootprint({ x: 0, y: 0 }, { width: 20, height: 16 }, noOffset, TILE))).toEqual(["0,0", "1,0"]);
    });

    it("follows pixelOffset the way TileMap draws it (subtracted from the anchor's top-left)", () => {
        // Nudged half a tile left/up: the 32x32 box now straddles a 3x3 block.
        expect(keys(DoorFootprint({ x: 5, y: 5 }, { width: 32, height: 32 }, { x: 8, y: 8 }, TILE)))
            .toEqual(["4,4", "4,5", "4,6", "5,4", "5,5", "5,6", "6,4", "6,5", "6,6"]);
        // Nudged a whole tile down/right (negative offset): same size, shifted.
        expect(keys(DoorFootprint({ x: 5, y: 5 }, { width: 32, height: 32 }, { x: -16, y: -16 }, TILE)))
            .toEqual(["6,6", "6,7", "7,6", "7,7"]);
    });

    it("extends into negative cells rather than clipping (editor maps aren't normalised)", () => {
        expect(keys(DoorFootprint({ x: 0, y: -4 }, { width: 32, height: 32 }, { x: 16, y: 0 }, TILE)))
            .toEqual(["-1,-3", "-1,-4", "0,-3", "0,-4"]);
    });

    it("still returns the anchor for a degenerate zero-size texture", () => {
        expect(keys(DoorFootprint({ x: 2, y: 2 }, { width: 0, height: 0 }, noOffset, TILE))).toEqual(["2,2"]);
    });

    it("splits the rooms either side of a 2-wide doorway once the whole footprint is marked", () => {
        // A 2-thick vertical wall with a 2-tall gap at x=2..3, y=2..3, and a
        // 32x32 door anchored at the gap's top-left - the layout that used to
        // leave three of the gap's four cells as floor and merge both rooms.
        const width = 6;
        const height = 6;
        const collision: boolean[][] = [];
        for (let x = 2; x <= 3; x++) {
            collision[x] = [];
            [0, 1, 4, 5].forEach(y => (collision[x][y] = true));
        }
        const doors: boolean[][] = [];
        DoorFootprint({ x: 2, y: 2 }, { width: 32, height: 32 }, noOffset, TILE).forEach(c => {
            (doors[c.x] = doors[c.x] || [])[c.y] = true;
        });

        const { regions, regionData } = FindRegions(collision, doors, width, height);
        expect(regions.length).toBe(2);
        expect(regionData[0][2]).not.toBe(regionData[5][2]);

        // And the anchor-only marking this replaces really did leak.
        const anchorOnly: boolean[][] = [];
        anchorOnly[2] = [];
        anchorOnly[2][2] = true;
        expect(FindRegions(collision, anchorOnly, width, height).regions.length).toBe(1);
    });
});
