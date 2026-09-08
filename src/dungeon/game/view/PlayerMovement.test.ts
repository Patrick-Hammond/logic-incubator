import { describe, expect, it } from "vitest";
import Level from "../level/Level";
import TileCollision from "../level/TileCollision";
import { MoveCollider, ResolveMove } from "./PlayerMovement";

/**
 * Frame-by-frame simulations of the real movement loop:
 *
 *   each frame:  velocity += normalisedInput   (GetInput)
 *                ResolveMove(position, velocity, dt, collider)
 *
 * They verify - against the actual code, not a hand trace - that a player
 * driving diagonally at a one-tile gap now slips through it (the "head-start"
 * rule): a column gap in a horizontal wall (fall through the floor) and a row
 * gap in a vertical wall (a doorway), without the assist misfiring on a plain
 * wall.
 */

const TILE = 16;
const LIP_Y = 3 * TILE;   // player rests here, one row above the wall
const WALL_ROW = 4;       // solid tile row (y 64..79)

/** A long horizontal wall on tile row 4 with a `gapWidth`-tile hole at `gapTile`. */
function wallWithGap(gapTile: number, gapWidth: number, totalTiles = 120, rows = 40): TileCollision {
    const data: boolean[][] = [];
    for (let x = 0; x < totalTiles; x++) {
        data[x] = [];
        for (let y = 0; y < rows; y++) {
            data[x][y] = y === WALL_ROW && !(x >= gapTile && x < gapTile + gapWidth);
        }
    }
    return new TileCollision({ collisionData: data } as unknown as Level);
}

function inputVector(keys: { up?: boolean; down?: boolean; left?: boolean; right?: boolean }): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (keys.up) { y -= 1; }
    if (keys.down) { y += 1; }
    if (keys.left) { x -= 1; }
    if (keys.right) { x += 1; }
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }   // PlayerControl only normalises when length > 1
    return { x, y };
}

interface Frame { n: number; x: number; y: number; vx: number; vy: number; stepX: number; stepY: number; }

/** A full-height vertical wall on tile column `wallCol` with a one-tile doorway at `doorRow`. */
function verticalWall(wallCol: number, doorRow: number, cols = 40, rows = 4000): TileCollision {
    const data: boolean[][] = [];
    for (let x = 0; x < cols; x++) {
        data[x] = [];
        for (let y = 0; y < rows; y++) {
            data[x][y] = x === wallCol && y !== doorRow;
        }
    }
    return new TileCollision({ collisionData: data } as unknown as Level);
}

function simulate(opts: {
    collider: MoveCollider;
    start: { x: number; y: number };
    keys: { up?: boolean; down?: boolean; left?: boolean; right?: boolean };
    frames: number;
    dt?: number;
}): Frame[] {
    const dt = opts.dt ?? 1;
    const input = inputVector(opts.keys);
    const pos = { ...opts.start };
    const vel = { x: 0, y: 0 };
    const trace: Frame[] = [];
    for (let n = 0; n < opts.frames; n++) {
        vel.x += input.x;
        vel.y += input.y;
        const bx = pos.x;
        const by = pos.y;
        ResolveMove(pos, vel, dt, opts.collider);
        trace.push({ n, x: pos.x, y: pos.y, vx: vel.x, vy: vel.y, stepX: pos.x - bx, stepY: pos.y - by });
    }
    return trace;
}

const maxY = (t: Frame[]) => Math.max(...t.map(f => f.y));
const entered = (t: Frame[]) => t.some(f => f.y > (WALL_ROW + 1) * TILE);

// ---------------------------------------------------------------------------

describe("input pipeline", () => {
    it("normalises a diagonal so each axis contributes ~0.707 per frame", () => {
        const v = inputVector({ down: true, right: true });
        expect(v.x).toBeCloseTo(Math.SQRT1_2, 6);
        expect(v.y).toBeCloseTo(Math.SQRT1_2, 6);
    });

    it("leaves a single held direction at full strength", () => {
        expect(inputVector({ down: true })).toEqual({ x: 0, y: 1 });
    });
});

describe("open floor, holding right+down", () => {
    const floor = new TileCollision({ collisionData: [] } as unknown as Level);

    it("settles to a horizontal step of ~2.8px/frame at dt=1", () => {
        const t = simulate({ collider: floor, start: { x: 0, y: 0 }, keys: { down: true, right: true }, frames: 60 });
        const step = t[t.length - 1].x - t[t.length - 2].x;
        expect(step).toBeGreaterThan(2.7);
        expect(step).toBeLessThan(2.9);
    });
});

describe("driving right+down into a ONE-tile gap - the head-start fix", () => {
    const c = wallWithGap(30, 1);

    it("drops through, from every sub-pixel start alignment", () => {
        for (let offset = 0; offset < 16; offset++) {
            const t = simulate({
                collider: c,
                start: { x: 10 * TILE + offset, y: LIP_Y },
                keys: { down: true, right: true },
                frames: 220,
            });
            expect(entered(t), `offset ${offset}`).toBe(true);
            expect(maxY(t), `offset ${offset}`).toBeGreaterThan((WALL_ROW + 4) * TILE);
        }
    });

    it("the assist is a head-start, not a slide: sideways step stays under half a tile while entering", () => {
        for (let offset = 0; offset < 16; offset++) {
            const t = simulate({
                collider: c,
                start: { x: 10 * TILE + offset, y: LIP_Y },
                keys: { down: true, right: true },
                frames: 220,
            });
            const worstStepWhileInWall = Math.max(
                ...t.filter(f => f.y > 40 && f.y < 80).map(f => Math.abs(f.stepX)),
            );
            expect(worstStepWhileInWall, `offset ${offset}`).toBeLessThan(TILE / 2);
        }
    });

    it("works the same driving left+down (mirror)", () => {
        const t = simulate({
            collider: c,
            start: { x: 50 * TILE, y: LIP_Y },
            keys: { down: true, left: true },
            frames: 260,
        });
        expect(entered(t)).toBe(true);
    });

    it("works across frame rates (dt), given enough frames to reach the gap", () => {
        for (const dt of [0.25, 0.5, 1, 1.5, 2]) {
            const t = simulate({
                collider: c,
                start: { x: 26 * TILE, y: LIP_Y }, // near the gap so the (frame-rate-scaled) travel is short
                keys: { down: true, right: true },
                frames: Math.ceil(600 / dt),
                dt,
            });
            expect(entered(t), `dt ${dt}`).toBe(true);
        }
    });
});

describe("the head-start must NOT misfire", () => {
    it("solid wall, no gap: slides right+down for a long time and never descends", () => {
        const c = wallWithGap(500, 1); // gap unreachable
        const t = simulate({ collider: c, start: { x: TILE, y: LIP_Y }, keys: { down: true, right: true }, frames: 400 });
        expect(maxY(t)).toBeLessThan(LIP_Y + 2);
    });

    it("one-tile gap present but DOWN not held: player slides across it, does not drop", () => {
        const c = wallWithGap(30, 1);
        const t = simulate({ collider: c, start: { x: 10 * TILE, y: LIP_Y }, keys: { right: true }, frames: 240 });
        expect(maxY(t)).toBeLessThan(LIP_Y + 2);
        expect(t[t.length - 1].x).toBeGreaterThan(40 * TILE); // travelled well past the gap
    });
});

describe("cases that already worked still work", () => {
    it("falls into a TWO-tile gap from every sub-pixel alignment", () => {
        const c = wallWithGap(30, 2);
        for (let offset = 0; offset < 16; offset++) {
            const t = simulate({
                collider: c,
                start: { x: 10 * TILE + offset, y: LIP_Y },
                keys: { down: true, right: true },
                frames: 220,
            });
            expect(entered(t), `offset ${offset}`).toBe(true);
        }
    });

    it("drops straight down through a one-tile gap the player is column-aligned with", () => {
        const c = wallWithGap(30, 1);
        const t = simulate({ collider: c, start: { x: 30 * TILE, y: LIP_Y }, keys: { down: true }, frames: 120 });
        expect(entered(t)).toBe(true);
    });

    it("slides along a solid wall and never descends", () => {
        const c = wallWithGap(60, 1);
        const t = simulate({ collider: c, start: { x: TILE, y: LIP_Y }, keys: { down: true, right: true }, frames: 120 });
        expect(maxY(t)).toBeLessThan(LIP_Y + 2);
    });
});

describe("driving into a ONE-tile DOORWAY in a vertical wall - the mirror head-start", () => {
    // Wall on column 10; doorway at row 40 (y 640..655). Player runs the corridor
    // at column 5, drives diagonally into the wall, should slip through the door.
    const c = verticalWall(10, 40);
    const pastWall = (t: Frame[]) => t.some(f => f.x > 12 * TILE);
    const worstStepYBefore = (t: Frame[]) => {
        const i = t.findIndex(f => f.x > 12 * TILE);
        return Math.max(...t.slice(0, i < 0 ? t.length : i).map(f => Math.abs(f.stepY)));
    };

    it("slips through going up+right, from every sub-pixel vertical alignment", () => {
        for (let yoff = 0; yoff < 16; yoff++) {
            const t = simulate({ collider: c, start: { x: 5 * TILE, y: 60 * TILE + yoff }, keys: { up: true, right: true }, frames: 300 });
            expect(pastWall(t), `yoff ${yoff}`).toBe(true);
        }
    });

    it("slips through going down+right, from every sub-pixel vertical alignment", () => {
        for (let yoff = 0; yoff < 16; yoff++) {
            const t = simulate({ collider: c, start: { x: 5 * TILE, y: 20 * TILE + yoff }, keys: { down: true, right: true }, frames: 300 });
            expect(pastWall(t), `yoff ${yoff}`).toBe(true);
        }
    });

    it("slips through going up+left (mirror, wall on the player's left)", () => {
        const t = simulate({ collider: c, start: { x: 15 * TILE, y: 60 * TILE }, keys: { up: true, left: true }, frames: 300 });
        expect(t.some(f => f.x < 9 * TILE)).toBe(true);
    });

    it("the vertical snap is a head-start (< half a tile), not a teleport", () => {
        for (let yoff = 0; yoff < 16; yoff++) {
            for (const keys of [{ up: true, right: true }, { down: true, right: true }]) {
                const startY = (keys.up ? 60 : 20) * TILE + yoff;
                const t = simulate({ collider: c, start: { x: 5 * TILE, y: startY }, keys, frames: 300 });
                expect(worstStepYBefore(t), `yoff ${yoff} ${JSON.stringify(keys)}`).toBeLessThan(TILE / 2 + 1);
            }
        }
    });

    it("does NOT misfire on a solid vertical wall with no doorway", () => {
        const solid = verticalWall(10, -1);
        const t = simulate({ collider: solid, start: { x: 5 * TILE, y: 60 * TILE }, keys: { up: true, right: true }, frames: 300 });
        expect(t.some(f => f.x > 11 * TILE)).toBe(false); // never gets past the wall column
    });

    it("does NOT drop through / slip when only running along the wall (single key)", () => {
        const t = simulate({ collider: c, start: { x: 5 * TILE, y: 60 * TILE }, keys: { up: true }, frames: 300 });
        expect(t.some(f => f.x > 10 * TILE)).toBe(false); // stays in the corridor, never enters the wall column
    });
});
