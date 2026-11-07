import { describe, expect, it } from "vitest";
import Footsteps from "./Footsteps";

/** Steps taken walking `frames` frames `speed` pixels each, along x from `from`. */
function Walk(steps: Footsteps, frames: number, speed: number, from = 0): number {
    let taken = 0;
    for (let i = 0; i <= frames; i++) {
        taken += steps.Update([{ x: from + i * speed, y: 0 }]).length;
    }
    return taken;
}

describe("Footsteps", () => {
    it("takes a step every stride walked, the first at half of one", () => {
        const steps = new Footsteps(10);
        // 45 pixels: steps at 5, 15, 25, 35 and 45.
        expect(Walk(steps, 45, 1)).toBe(5);
    });

    it("hears nothing from a hero standing still", () => {
        const steps = new Footsteps(10);
        for (let i = 0; i < 100; i++) {
            expect(steps.Update([{ x: 0, y: 0 }])).toEqual([]);
        }
    });

    it("steps the moment their player pushes them off, however short the walk - each time", () => {
        const steps = new Footsteps(10);
        let x = 0;
        steps.Update([{ x, y: 0 }]);
        for (let tap = 0; tap < 3; tap++) {
            // Pushed for two frames, two pixels; then let go, sliding a pixel to a stop and standing a while.
            expect(steps.Update([{ x: (x += 1), y: 0, pushing: true }])).toEqual([0]);
            expect(steps.Update([{ x: (x += 1), y: 0, pushing: true }])).toEqual([]);
            expect(steps.Update([{ x: (x += 1), y: 0 }])).toEqual([]);
            for (let i = 0; i < 10; i++) {
                expect(steps.Update([{ x, y: 0 }])).toEqual([]);
            }
        }
    });

    it("steps next a whole stride after the push, while it's held", () => {
        const steps = new Footsteps(10);
        const taken: number[] = [];
        for (let i = 0; i <= 25; i++) {
            if (steps.Update([{ x: i, y: 0, pushing: true }]).length) {
                taken.push(i);
            }
        }
        expect(taken).toEqual([0, 10, 20]);
    });

    it("steps once for a push against a wall, and no more while it's held", () => {
        const steps = new Footsteps(10);
        expect(steps.Update([{ x: 0, y: 0, pushing: true }])).toEqual([0]);
        for (let i = 0; i < 100; i++) {
            expect(steps.Update([{ x: 0, y: 0, pushing: true }])).toEqual([]);
        }
    });

    it("hears a push from one who wasn't walking - fallen, say - when they're back", () => {
        const steps = new Footsteps(10);
        steps.Update([{ x: 0, y: 0, pushing: true }]);
        steps.Update([null]);
        expect(steps.Update([{ x: 0, y: 0, pushing: true }])).toEqual([0]);
    });

    it("says whose steps they were, and none for one who isn't walking", () => {
        const steps = new Footsteps(10);
        const taken: number[] = [];
        for (let i = 0; i <= 25; i++) {
            taken.push(...steps.Update([{ x: i, y: 0 }, null, { x: 0, y: i }]));
        }
        // 5, 15 and 25 for each walker.
        expect(taken).toEqual([0, 2, 0, 2, 0, 2]);
    });

    it("steps as much less often as a floor slows the hero - 0.4 as fast, 0.4 as many steps", () => {
        const steps = new Footsteps(10);
        const count = (speed: number): number => {
            steps.Reset();
            let taken = 0;
            for (let frame = 0; frame <= 250; frame++) {
                taken += steps.Update([{ x: frame * speed, y: 0 }]).length;
            }
            return taken;
        };
        // 250 pixels at full speed, 100 on water: the first at 5 pixels, then every 10.
        expect(count(1)).toBe(25);
        expect(count(0.4)).toBe(10);
    });

    it("takes one step a frame at most, however far it went", () => {
        const steps = new Footsteps(10);
        steps.Update([{ x: 0, y: 0 }]);
        // Setting off at half a stride, 4.5 more is all but a step; 9 more in one frame is almost two, but makes one - the next half a stride on.
        expect(steps.Update([{ x: 4.5, y: 0 }])).toEqual([]);
        expect(steps.Update([{ x: 13.5, y: 0 }])).toEqual([0]);
        expect(steps.Update([{ x: 18.4, y: 0 }])).toEqual([]);
        expect(steps.Update([{ x: 18.6, y: 0 }])).toEqual([0]);
    });

    it("doesn't count a jump - a warp, a restart - as walking", () => {
        const steps = new Footsteps(10);
        steps.Update([{ x: 0, y: 0 }]);
        expect(steps.Update([{ x: 500, y: 0 }])).toEqual([]);
        steps.Reset();
        expect(steps.Update([{ x: 0, y: 0 }])).toEqual([]);
    });
});
