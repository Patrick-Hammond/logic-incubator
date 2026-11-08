import { describe, expect, it } from "vitest";
import Footsteps from "./Footsteps";

/** Steps taken walking `frames` frames `speed` pixels each over `seconds` a frame, along x from `from`. */
function Walk(steps: Footsteps, frames: number, speed: number, seconds = 0.1, from = 0, movementPenalty = 0, pushing = true): number {
    let taken = 0;
    for (let i = 0; i <= frames; i++) {
        taken += steps.Update([{ x: from + i * speed, y: 0, movementPenalty, pushing }], seconds).length;
    }
    return taken;
}

describe("Footsteps", () => {
    it("takes a step every set time while moving, the first at half of it", () => {
        const steps = new Footsteps(1, 10);
        // Steps at 0.5, 1.5 and 2.5 seconds.
        expect(Walk(steps, 25, 1, 0.1)).toBe(3);
    });

    it("hears nothing from a hero standing still", () => {
        const steps = new Footsteps(1, 10);
        for (let i = 0; i < 100; i++) {
            expect(steps.Update([{ x: 0, y: 0 }], 0.1)).toEqual([]);
        }
    });

    it("steps the moment their player pushes them off, however short the walk - each time", () => {
        const steps = new Footsteps(1, 10);
        let x = 0;
        steps.Update([{ x, y: 0 }], 0.1);
        for (let tap = 0; tap < 3; tap++) {
            // Pushed for two frames, two pixels; then let go, sliding a pixel to a stop and standing a while.
            expect(steps.Update([{ x: (x += 1), y: 0, pushing: true }], 0.1)).toEqual([0]);
            expect(steps.Update([{ x: (x += 1), y: 0, pushing: true }], 0.1)).toEqual([]);
            expect(steps.Update([{ x: (x += 1), y: 0 }], 0.1)).toEqual([]);
            for (let i = 0; i < 10; i++) {
                expect(steps.Update([{ x, y: 0 }], 0.1)).toEqual([]);
            }
        }
    });

    it("steps next a whole wait after the push, while it's held", () => {
        const steps = new Footsteps(1, 10);
        const taken: number[] = [];
        for (let i = 0; i <= 25; i++) {
            if (steps.Update([{ x: i, y: 0, pushing: true }], 0.1).length) {
                taken.push(i);
            }
        }
        expect(taken).toEqual([0, 10, 20]);
    });

    it("steps once for a push against a wall, and no more while it's held", () => {
        const steps = new Footsteps(1, 10);
        expect(steps.Update([{ x: 0, y: 0, pushing: true }], 0.1)).toEqual([0]);
        for (let i = 0; i < 100; i++) {
            expect(steps.Update([{ x: 0, y: 0, pushing: true }], 0.1)).toEqual([]);
        }
    });

    it("hears a push from one who wasn't walking - fallen, say - when they're back", () => {
        const steps = new Footsteps(1, 10);
        steps.Update([{ x: 0, y: 0, pushing: true }], 0.1);
        steps.Update([null], 0.1);
        expect(steps.Update([{ x: 0, y: 0, pushing: true }], 0.1)).toEqual([0]);
    });

    it("says whose steps they were, and none for one who isn't walking", () => {
        const steps = new Footsteps(1, 10);
        const taken: number[] = [];
        for (let i = 0; i <= 25; i++) {
            taken.push(...steps.Update([{ x: i, y: 0, pushing: true }, null, { x: 0, y: i, pushing: true }], 0.1));
        }
        // 0.5, 1.5 and 2.5 seconds for each walker.
        expect(taken).toEqual([0, 2, 0, 2, 0, 2]);
    });

    it("doesn't keep stepping while sliding with no push held", () => {
        const steps = new Footsteps(1, 10);
        let x = 0;
        steps.Update([{ x, y: 0 }], 0.1);
        expect(steps.Update([{ x: (x += 1), y: 0, pushing: true }], 0.1)).toEqual([0]);
        for (let i = 0; i < 40; i++) {
            expect(steps.Update([{ x: (x += 0.5), y: 0 }], 0.1)).toEqual([]);
        }
    });

    it("keeps timing by time, only stretching it a little with movement penalty", () => {
        const steps = new Footsteps(1, 10);
        const count = (speed: number, movementPenalty = 0): number => {
            steps.Reset();
            let taken = 0;
            for (let frame = 0; frame <= 120; frame++) {
                taken += steps.Update([{ x: frame * speed, y: 0, movementPenalty, pushing: true }], 0.1).length;
            }
            return taken;
        };
        const full = count(1, 0);
        const slowedWithoutPenalty = count(0.4, 0);
        const slowedWithPenalty = count(0.4, 0.6);
        expect(full).toBe(slowedWithoutPenalty);
        expect(slowedWithPenalty).toBeLessThan(slowedWithoutPenalty);
    });

    it("takes one step a frame at most, however long the frame", () => {
        const steps = new Footsteps(1, 10);
        steps.Update([{ x: 0, y: 0, pushing: true }], 0.1);
        expect(steps.Update([{ x: 5, y: 0, pushing: true }], 2.5)).toEqual([0]);
        expect(steps.Update([{ x: 6, y: 0, pushing: true }], 0.5)).toEqual([0]);
    });

    it("doesn't count a jump - a warp, a restart - as walking", () => {
        const steps = new Footsteps(1, 10);
        steps.Update([{ x: 0, y: 0 }], 0.1);
        expect(steps.Update([{ x: 500, y: 0 }], 0.1)).toEqual([]);
        steps.Reset();
        expect(steps.Update([{ x: 0, y: 0 }], 0.1)).toEqual([]);
    });
});
