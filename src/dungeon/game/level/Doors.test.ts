import { describe, expect, it } from "vitest";
import { FindDoorGroups } from "./Doors";

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
