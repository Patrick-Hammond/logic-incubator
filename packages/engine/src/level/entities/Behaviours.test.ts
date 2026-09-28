import { describe, expect, it } from "vitest";
import { Vec2Like } from "@logic-incubator/lib/math/Geometry";
import { Chase, KeepDistance, MonsterContext, Separation, Wander } from "./Behaviours";
import FlowField from "./FlowField";

const TILE = 16;

/** A monster at `tile` (box aligned to it) on an open 20x5 corridor, with the player's box at `playerTile`. */
function Context(tile: Vec2Like, playerTile: Vec2Like, random = () => 0.5): MonsterContext {
    const flow = new FlowField(20, 5, () => false);
    flow.Update(playerTile.x, playerTile.y);
    return {
        position: { x: tile.x * TILE, y: tile.y * TILE },
        tile,
        player: { x: playerTile.x * TILE, y: playerTile.y * TILE },
        flow,
        tileSize: TILE,
        dt: 1 / 60,
        random
    };
}

describe("Chase", () => {
    it("heads down the flow field towards the player", () => {
        const steer = new Chase().Steer(Context({ x: 10, y: 2 }, { x: 2, y: 2 }));
        expect(steer.x).toBeCloseTo(-1);
        expect(steer.y).toBeCloseTo(0);
    });

    it("goes straight for the player once within a tile", () => {
        const context = Context({ x: 3, y: 2 }, { x: 2, y: 2 });
        context.position = { x: 3 * TILE + 4, y: 2 * TILE + 3 };
        const steer = new Chase().Steer(context);
        expect(steer.x).toBeLessThan(0);
        expect(steer.y).toBeLessThan(0);
    });

    it("walks round a wall rather than into it", () => {
        // Wall across x=5 except at y=0: from (8,4) to (2,4) it must head up towards the gap.
        const flow = new FlowField(10, 5, (x, y) => x === 5 && y > 0);
        flow.Update(2, 4);
        const steer = new Chase().Steer({
            position: { x: 6 * TILE, y: 4 * TILE },
            tile: { x: 6, y: 4 },
            player: { x: 2 * TILE, y: 4 * TILE },
            flow,
            tileSize: TILE,
            dt: 1 / 60,
            random: () => 0.5
        });
        expect(steer.y).toBeLessThan(0);
    });
});

describe("KeepDistance", () => {
    const behaviour = new KeepDistance({ range: 5, slack: 1 });

    it("closes in from further than its range", () => {
        expect(behaviour.Steer(Context({ x: 15, y: 2 }, { x: 2, y: 2 })).x).toBeLessThan(0);
    });

    it("holds still around its range", () => {
        expect(behaviour.Steer(Context({ x: 7, y: 2 }, { x: 2, y: 2 }))).toEqual({ x: 0, y: 0 });
    });

    it("backs off when the player closes in", () => {
        expect(behaviour.Steer(Context({ x: 4, y: 2 }, { x: 2, y: 2 })).x).toBeGreaterThan(0);
    });
});

describe("Wander", () => {
    it("ambles at its pace while the player's far off, and turns chaser for good once they come near", () => {
        const wander = new Wander({ aggroRange: 3, pace: 0.5 });
        const idle = wander.Steer(Context({ x: 15, y: 2 }, { x: 2, y: 2 }, () => 0.9));
        expect(Math.hypot(idle.x, idle.y)).toBeCloseTo(0.5);

        expect(wander.Steer(Context({ x: 4, y: 2 }, { x: 2, y: 2 })).x).toBeLessThan(0);
        // Still chasing after the player gets away again.
        expect(wander.Steer(Context({ x: 15, y: 2 }, { x: 2, y: 2 })).x).toBeCloseTo(-1);
    });

    it("sometimes stops to rest", () => {
        const steer = new Wander().Steer(Context({ x: 15, y: 2 }, { x: 2, y: 2 }, () => 0.1));
        expect(steer).toEqual({ x: 0, y: 0 });
    });
});

describe("Separation", () => {
    it("pushes away from close neighbours, harder the closer they are", () => {
        const near = Separation(0, [{ x: 0, y: 0 }, { x: 4, y: 0 }], 12);
        const nearer = Separation(0, [{ x: 0, y: 0 }, { x: 2, y: 0 }], 12);
        expect(near.x).toBeLessThan(0);
        expect(nearer.x).toBeLessThan(near.x);
        expect(near.y).toBe(0);
    });

    it("ignores anyone beyond its radius", () => {
        expect(Separation(0, [{ x: 0, y: 0 }, { x: 20, y: 0 }], 12)).toEqual({ x: 0, y: 0 });
    });

    it("splits two on the same spot opposite ways, and caps the push at 1", () => {
        const positions = [{ x: 5, y: 5 }, { x: 5, y: 5 }];
        expect(Separation(0, positions, 12).x).toBeLessThan(0);
        expect(Separation(1, positions, 12).x).toBeGreaterThan(0);

        const crowd = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: 1, y: -1 }];
        const push = Separation(0, crowd, 12);
        expect(Math.hypot(push.x, push.y)).toBeCloseTo(1);
    });
});
