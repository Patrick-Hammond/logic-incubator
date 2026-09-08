import { describe, expect, it } from "vitest";
import { TileSize } from "../../Constants";
import Level from "./Level";
import TileCollision from "./TileCollision";

/**
 * These tests pin down the exact behaviour of TileCollision.TestX / TestY that
 * the player-movement code (and any gap-entry assist built on top of it) relies
 * on. They exist because that behaviour was repeatedly reasoned about wrongly by
 * hand; every assertion below is a fact the fix must be designed around.
 *
 * collisionData is indexed [tileX][tileY]; a cell is solid when truthy.
 * TileSize is 16, so tile N spans pixels [N*16, N*16 + 16).
 */

/** Build a collider from an ASCII map. '#' = solid, anything else = open. */
function collider(map: string): TileCollision {
    const rows = map.replace(/^\n/, "").replace(/\n\s*$/, "").split("\n").map(r => r.replace(/\s+$/, ""));
    const width = Math.max(...rows.map(r => r.length));
    const data: boolean[][] = [];
    for (let x = 0; x < width; x++) {
        data[x] = [];
        for (let y = 0; y < rows.length; y++) {
            data[x][y] = rows[y][x] === "#";
        }
    }
    return new TileCollision({ collisionData: data } as unknown as Level);
}

describe("TileCollision geometry constants", () => {
    it("uses a player box one pixel smaller than a tile on each axis", () => {
        // tileX 1 solid (px 16..31); tileX 0 open.
        const wall = collider(`
.#
.#
`);
        // Moving right by 1px: right edge = 0 + 1 + (TileSize-1) = 16 -> tile 1 -> hit.
        expect(wall.TestX({ x: 0, y: 0 }, 1)).not.toBeNull();
        // Moving right by 0.9px: right edge = 15.9 -> tile 0 -> clear.
        expect(wall.TestX({ x: 0, y: 0 }, 0.9)).toBeNull();
    });
});

describe("TestY against a flush wall row (the 'wall lip' case)", () => {
    // Player on tile row 0; tile row 1 solid under both bottom corners.
    const c = collider(`
..
##
..
`);

    it("does NOT report a collision until the downward step is at least 1px", () => {
        // bottom edge after step = from.y + dir + (TileSize-1) = 0 + dir + 15.
        // It only reaches tile row 1 (y >= 16) when dir >= 1.
        expect(c.TestY({ x: 0, y: 0 }, 0.5)).toBeNull();
        expect(c.TestY({ x: 0, y: 0 }, 0.99)).toBeNull();
        expect(c.TestY({ x: 0, y: 0 }, 1)).not.toBeNull();
        expect(c.TestY({ x: 0, y: 0 }, 2)).not.toBeNull();
    });

    it("snaps back to the top of the row above the wall", () => {
        // hit row 1 -> returns (floor(bottomEdge/16) - 1) * 16 = 0.
        expect(c.TestY({ x: 0, y: 0 }, 2)).toBe(0);
    });
});

describe("TestX along a wall lip", () => {
    // Wall solid at tileX 3, tile row 1 only. Tile row 0 fully open.
    const c = collider(`
....
...#
....
`);

    it("ignores a wall one row below the player (uses from.y, not the stepped Y)", () => {
        // Player at x=40 (tile 2), y=0 (tile row 0), stepping right by 5.
        // TestX checks rows floor(0/16)=0 and floor(15/16)=0 -> both open.
        expect(c.TestX({ x: 40, y: 0 }, 5)).toBeNull();
    });
});

describe("TestY across a ONE-tile gap", () => {
    // Wall = tile row 1, solid everywhere except the gap at tileX 5 (px 80..95).
    const c = collider(`
............
#####.######
............
`);
    const DIR = 2; // any dir >= 1 puts the bottom edge into tile row 1

    it("only clears when BOTH bottom corners are inside the gap column", () => {
        // Player width 15. Need floor(x/16)==5 AND floor((x+15)/16)==5
        //   -> x in [80, 96) AND x in [65, 81)  ->  x in [80, 81).
        expect(c.TestY({ x: 80, y: 0 }, DIR)).toBeNull();
        expect(c.TestY({ x: 80.99, y: 0 }, DIR)).toBeNull();
    });

    it("blocks one pixel to either side of that window", () => {
        expect(c.TestY({ x: 79.99, y: 0 }, DIR)).not.toBeNull(); // left corner in tile 4
        expect(c.TestY({ x: 81, y: 0 }, DIR)).not.toBeNull();    // right corner in tile 6
    });

    it("the pass-through window is exactly 1px wide", () => {
        let clear = 0;
        for (let x = 60; x < 100; x += 0.05) {
            if (c.TestY({ x, y: 0 }, DIR) === null) { clear++; }
        }
        // 0.05 step over a 1px window -> ~20 samples; allow for float edges.
        expect(clear).toBeGreaterThanOrEqual(18);
        expect(clear).toBeLessThanOrEqual(22);
    });
});

describe("TestY across a TWO-tile gap", () => {
    // Gap at tileX 5 and 6 (px 80..111).
    const c = collider(`
............
#####..#####
............
`);
    const DIR = 2;

    it("has a 17px-wide pass-through window (fits the 15px player with slack)", () => {
        // floor(x/16) in {5,6} AND floor((x+15)/16) in {5,6}
        //   -> x in [80, 112) AND x+15 in [80, 112) -> x in [80, 97).
        expect(c.TestY({ x: 80, y: 0 }, DIR)).toBeNull();
        expect(c.TestY({ x: 96.99, y: 0 }, DIR)).toBeNull();
        expect(c.TestY({ x: 97, y: 0 }, DIR)).not.toBeNull();
        expect(c.TestY({ x: 79.99, y: 0 }, DIR)).not.toBeNull();
    });
});

describe("directional snap-back values", () => {
    const c = collider(`
....
.##.
.##.
....
`); // solid block at tileX 1..2, tileY 1..2  (px x 16..47, y 16..47)

    it("moving right returns the left edge of the tile column that was hit, minus one tile", () => {
        // right edge lands in tile 1 -> (1 - 1) * 16 = 0
        expect(c.TestX({ x: 0, y: 16 }, 2)).toBe(0);
    });

    it("moving left returns the right edge of the hit column, plus one tile", () => {
        // from x=48 (tile 3), step -4 -> left edge = 44 -> tile 2 (solid) -> (2 + 1) * 16 = 48
        expect(c.TestX({ x: 48, y: 16 }, -4)).toBe(48);
    });

    it("moving down returns the row above the hit row", () => {
        // from y=0, step 2 -> bottom edge 17 -> tile row 1 -> (1 - 1) * 16 = 0
        expect(c.TestY({ x: 16, y: 0 }, 2)).toBe(0);
    });

    it("moving up returns the row below the hit row", () => {
        // from y=48 (tile 3), step -4 -> top edge 44 -> tile row 2 (solid) -> (2 + 1) * 16 = 48
        expect(c.TestY({ x: 16, y: 48 }, -4)).toBe(48);
    });
});

describe("off-map cells are treated as open", () => {
    const c = collider(`
.
`);
    it("does not throw and reports no collision outside the data", () => {
        expect(c.TestX({ x: 1000, y: 1000 }, 4)).toBeNull();
        expect(c.TestY({ x: 1000, y: 1000 }, 4)).toBeNull();
    });
});

describe("TileSize assumption", () => {
    it("is 16", () => {
        expect(TileSize).toBe(16);
    });
});

describe("GapAlignX - the head-start target when a downward step is blocked", () => {
    // Wall = tile row 1, solid everywhere except a one-tile gap at tileX 5 (px 80..95).
    const oneTile = collider(`
............
#####.######
............
`);
    const DIR = 2; // downward step big enough to reach tile row 1

    it("returns the gap column's left edge when the player straddles it, centre over the gap", () => {
        // Player 15px wide at x=74: left corner tile 4 (solid), right corner (89) tile 5 (gap),
        // centre (81.5) tile 5 (gap) -> lined up, snap target = 5 * 16 = 80.
        expect(oneTile.GapAlignX({ x: 74, y: 0 }, DIR)).toBe(80);
        // Approaching from the right: x=82, left corner tile 5, right corner (97) tile 6 (solid).
        expect(oneTile.GapAlignX({ x: 82, y: 0 }, DIR)).toBe(80);
    });

    it("returns null when the player fits entirely in one column (a real wall)", () => {
        // x=16: both corners in tile 1, which is solid -> not a gap.
        expect(oneTile.GapAlignX({ x: 16, y: 0 }, DIR)).toBeNull();
    });

    it("returns null when the player's centre is not over the gap", () => {
        // x=64: left corner tile 4 (solid), right corner (79) tile 4 (solid), centre (71.5) tile 4.
        expect(oneTile.GapAlignX({ x: 64, y: 0 }, DIR)).toBeNull();
    });

    it("returns null when neither straddled column is solid (nothing was blocking)", () => {
        const twoTile = collider(`
............
#####..#####
............
`);
        // x=88 straddles tiles 5 and 6, both part of the gap -> TestY would not have blocked.
        expect(twoTile.GapAlignX({ x: 88, y: 0 }, DIR)).toBeNull();
    });

    it("returns null for a zero step", () => {
        expect(oneTile.GapAlignX({ x: 74, y: 0 }, 0)).toBeNull();
    });

    it("also works for an upward step into a ceiling gap", () => {
        // Ceiling = tile row 1; player below it at y=32 (tile row 2) stepping up.
        const ceiling = collider(`
............
#####.######
............
............
`);
        expect(ceiling.GapAlignX({ x: 74, y: 32 }, -2)).toBe(80);
    });

    it("returns null for a lone tile the player merely clipped (wall does not continue past the gap)", () => {
        // Row 1 has a single solid tile at tileX 5, nothing either side. A player
        // straddling tiles 4/5 while descending would clip its corner on that tile,
        // but it is not a wall-with-a-hole, so no head-start.
        const loneTile = collider(`
............
.....#......
............
`);
        expect(loneTile.GapAlignX({ x: 66, y: 0 }, DIR)).toBeNull(); // centre (73.5) over open tile 4, tile 5 solid
    });
});

describe("GapAlignY - the head-start target when a sideways step is blocked (doorways)", () => {
    // Vertical wall at tileX 5 (px 80..95), solid except a one-tile doorway at row 5 (py 80..95).
    const wall = collider(`
.....#......
.....#......
.....#......
.....#......
.....#......
............
.....#......
.....#......
.....#......
`);
    const DIR = 2; // rightward step big enough to reach tileX 5

    it("returns the doorway row's top when the player straddles it, centre over the door", () => {
        // Player at y=74: top corner row 4 (solid), bottom corner (89) row 5 (door),
        // centre (81.5) row 5 -> lined up, snap target = 5 * 16 = 80.
        expect(wall.GapAlignY({ x: 64, y: 74 }, DIR)).toBe(80);
        // Approaching from below: y=82, centre (89.5) row 5, bottom corner (97) row 6 (solid).
        expect(wall.GapAlignY({ x: 64, y: 82 }, DIR)).toBe(80);
    });

    it("returns null when the player fits entirely in one row (a real wall)", () => {
        expect(wall.GapAlignY({ x: 64, y: 16 }, DIR)).toBeNull();
    });

    it("returns null when the player's centre is not over the doorway", () => {
        // y=40: straddles rows 2 and 3, centre (47.5) row 2 -> solid wall, not the door.
        expect(wall.GapAlignY({ x: 64, y: 40 }, DIR)).toBeNull();
    });

    it("returns null for a zero step", () => {
        expect(wall.GapAlignY({ x: 64, y: 74 }, 0)).toBeNull();
    });

    it("returns null for a lone tile (wall does not continue past the gap row)", () => {
        const loneTile = collider(`
............
............
............
............
............
.....#......
............
............
`);
        expect(loneTile.GapAlignY({ x: 64, y: 66 }, DIR)).toBeNull();
    });

    it("also works for a leftward step into a doorway", () => {
        // Player in the corridor right of the wall (tileX 6) stepping left to reach tileX 5.
        expect(wall.GapAlignY({ x: 100, y: 74 }, -6)).toBe(80);
    });
});
