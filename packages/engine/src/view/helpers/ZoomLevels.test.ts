import { describe, expect, it } from "vitest";
import ZoomJump, { DefaultZoomLevels, MaxZoomLevels, UsableZoomLevels, ZoomJumpSeconds } from "./ZoomLevels";

const ZoomLevels = DefaultZoomLevels;

/** The camera's usual scale: 16-pixel tiles drawn 32 across. */
const UsualScale = 2;

describe("DefaultZoomLevels", () => {
    it("starts at the usual zoom, and goes in from there", () => {
        expect(ZoomLevels[0]).toBe(1);
        for (let i = 1; i < ZoomLevels.length; i++) {
            expect(ZoomLevels[i]).toBeGreaterThan(ZoomLevels[i - 1]);
        }
    });

    it("draws each pixel of art a whole number of canvas pixels across at every level", () => {
        ZoomLevels.forEach(zoom => expect(Number.isInteger(zoom * UsualScale)).toBe(true));
    });
});

describe("UsableZoomLevels", () => {
    it("keeps a game's own levels, in its order", () => {
        expect(UsableZoomLevels([1, 2, 1.5, 3])).toEqual([1, 2, 1.5, 3]);
    });

    it("drops what isn't a zoom above 0, and keeps no more than there are number keys", () => {
        expect(UsableZoomLevels([0, 1, -2, NaN, Infinity, 2])).toEqual([1, 2]);
        expect(UsableZoomLevels([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]).length).toBe(MaxZoomLevels);
    });

    it("falls back on the defaults with none to use", () => {
        expect(UsableZoomLevels()).toBe(DefaultZoomLevels);
        expect(UsableZoomLevels([])).toBe(DefaultZoomLevels);
        expect(UsableZoomLevels([0, -1])).toBe(DefaultZoomLevels);
    });
});

describe("ZoomJump", () => {
    it("starts settled at the first level", () => {
        const jump = new ZoomJump();
        expect(jump.Level).toBe(0);
        expect(jump.Value).toBe(1);
        expect(jump.Max).toBe(2);
    });

    it("picks between a game's own levels, the closest whichever key it's on", () => {
        const jump = new ZoomJump([1.5, 3, 2]);
        expect(jump.Levels).toEqual([1.5, 3, 2]);
        expect(jump.Value).toBe(1.5);
        expect(jump.Max).toBe(3);
        jump.To(1);
        jump.Step(ZoomJumpSeconds);
        expect(jump.Value).toBeCloseTo(3, 10);
    });

    it("gets to the level in ZoomJumpSeconds, quickest at first, and stays there", () => {
        const jump = new ZoomJump();
        jump.To(2);
        expect(jump.Level).toBe(2);
        expect(jump.Value).toBe(1);
        const step = ZoomJumpSeconds / 10;
        const values = [jump.Value];
        for (let i = 0; i < 10; i++) {
            jump.Step(step);
            values.push(jump.Value);
        }
        expect(values[10]).toBeCloseTo(ZoomLevels[2], 10);
        const gains = values.slice(1).map((value, i) => value / values[i]);
        for (let i = 1; i < gains.length; i++) {
            expect(gains[i]).toBeLessThanOrEqual(gains[i - 1] + 1e-12);
        }
        jump.Step(5);
        expect(jump.Value).toBeCloseTo(ZoomLevels[2], 10);
    });

    it("goes even in scale: halfway in time is past halfway in scale, eased out", () => {
        const jump = new ZoomJump();
        jump.To(2);
        jump.Step(ZoomJumpSeconds / 2);
        // An even-in-scale halfway point is the geometric mean; eased out, it's further on than that.
        expect(jump.Value).toBeGreaterThan(Math.sqrt(ZoomLevels[0] * ZoomLevels[2]));
        expect(jump.Value).toBeLessThan(ZoomLevels[2]);
    });

    it("sets off from wherever it had got to when another level is asked for midway", () => {
        const jump = new ZoomJump();
        jump.To(2);
        jump.Step(ZoomJumpSeconds / 3);
        const midway = jump.Value;
        jump.To(0);
        expect(jump.Value).toBeCloseTo(midway, 10);
        jump.Step(ZoomJumpSeconds);
        expect(jump.Value).toBeCloseTo(1, 10);
    });

    it("leaves a jump alone when its own level is asked for again - a held key repeating", () => {
        const jump = new ZoomJump();
        jump.To(1);
        jump.Step(ZoomJumpSeconds / 2);
        const value = jump.Value;
        jump.To(1);
        expect(jump.Value).toBe(value);
        jump.Step(ZoomJumpSeconds / 2);
        expect(jump.Value).toBeCloseTo(ZoomLevels[1], 10);
    });

    it("holds a level asked for to the levels there are", () => {
        const jump = new ZoomJump();
        jump.To(9);
        expect(jump.Level).toBe(ZoomLevels.length - 1);
        jump.To(-3);
        expect(jump.Level).toBe(0);
    });
});
