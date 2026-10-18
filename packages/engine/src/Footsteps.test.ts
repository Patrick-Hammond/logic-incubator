import { describe, expect, it } from "vitest";
import Footsteps from "./Footsteps";

/** Steps taken walking `frames` frames `speed` pixels each, along x from `from`. */
function Walk(steps: Footsteps, frames: number, speed: number, from = 0): number {
    let taken = 0;
    for (let i = 0; i <= frames; i++) {
        taken += steps.Update([{ x: from + i * speed, y: 0 }]);
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
            expect(steps.Update([{ x: 0, y: 0 }])).toBe(0);
        }
        expect(Walk(steps, 5, 1)).toBe(1);
    });

    it("counts each hero's steps, and none for one who isn't walking", () => {
        const steps = new Footsteps(10);
        let taken = 0;
        for (let i = 0; i <= 25; i++) {
            taken += steps.Update([{ x: i, y: 0 }, null, { x: 0, y: i }]);
        }
        // 5, 15 and 25 for each walker.
        expect(taken).toBe(6);
    });

    it("doesn't count a jump - a warp, a restart - as walking", () => {
        const steps = new Footsteps(10);
        steps.Update([{ x: 0, y: 0 }]);
        expect(steps.Update([{ x: 500, y: 0 }])).toBe(0);
        steps.Reset();
        expect(steps.Update([{ x: 0, y: 0 }])).toBe(0);
    });
});
