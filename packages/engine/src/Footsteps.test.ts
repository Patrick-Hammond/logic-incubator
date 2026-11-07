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

    it("hears nothing from a hero standing still, and starts afresh when they set off", () => {
        const steps = new Footsteps(10);
        for (let i = 0; i < 100; i++) {
            expect(steps.Update([{ x: 0, y: 0 }])).toEqual([]);
        }
        expect(Walk(steps, 5, 1)).toBe(1);
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

    it("steps as often on a floor that slows the hero, their stride as much shorter", () => {
        const steps = new Footsteps(10);
        let taken = 0;
        // A third of the pace, a third of the way: as many steps as walking 45 pixels at full pace.
        for (let i = 0; i <= 45; i++) {
            taken += steps.Update([{ x: i / 3, y: 0, pace: 1 / 3 }]).length;
        }
        expect(taken).toBe(5);
    });

    it("takes one step a frame at most, however far it went", () => {
        const steps = new Footsteps(10);
        steps.Update([{ x: 0, y: 0, pace: 0.1 }]);
        // Nine pixels at a tenth of the pace is nine strides, but one step - the next half a stride on.
        expect(steps.Update([{ x: 9, y: 0, pace: 0.1 }])).toEqual([0]);
        expect(steps.Update([{ x: 9.4, y: 0, pace: 0.1 }])).toEqual([]);
        expect(steps.Update([{ x: 9.6, y: 0, pace: 0.1 }])).toEqual([0]);
    });

    it("doesn't count a jump - a warp, a restart - as walking", () => {
        const steps = new Footsteps(10);
        steps.Update([{ x: 0, y: 0 }]);
        expect(steps.Update([{ x: 500, y: 0 }])).toEqual([]);
        steps.Reset();
        expect(steps.Update([{ x: 0, y: 0 }])).toEqual([]);
    });
});
