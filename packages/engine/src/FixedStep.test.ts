import { describe, expect, it } from "vitest";
import FixedStep, { Between, MaxFrameSeconds, StepSeconds } from "./FixedStep";

/** Steps run for each of `frames` display frames `seconds` apart. */
function Run(step: FixedStep, seconds: number, frames: number): number[] {
    const counts: number[] = [];
    for (let i = 0; i < frames; i++) {
        counts.push(step.Advance(seconds));
    }
    return counts;
}

describe("FixedStep", () => {
    it("runs one step a frame on a 60 Hz display, even with its frames a hair either side of 1/60 s", () => {
        const step = new FixedStep();
        const counts: number[] = [];
        for (let i = 0; i < 600; i++) {
            counts.push(step.Advance(StepSeconds + (i % 2 ? 0.0004 : -0.0004)));
        }
        expect(counts.every(n => n === 1)).toBe(true);
    });

    it("keeps to 60 steps a second at other frame rates", () => {
        [30, 75, 120, 144, 240].forEach(rate => {
            const step = new FixedStep();
            const total = Run(step, 1 / rate, rate * 10).reduce((sum, n) => sum + n, 0);
            expect(Math.abs(total - 600)).toBeLessThanOrEqual(1);
        });
    });

    it("runs several steps in one slow frame", () => {
        expect(new FixedStep().Advance(StepSeconds * 3)).toBe(3);
    });

    it("lets a stall count for no more than MaxFrameSeconds", () => {
        expect(new FixedStep().Advance(5)).toBe(Math.round(MaxFrameSeconds / StepSeconds));
    });

    it("has Alpha the share of the way to the next step, between 0 and 1", () => {
        const step = new FixedStep();
        expect(step.Advance(StepSeconds * 0.5)).toBe(0);
        expect(step.Alpha).toBeCloseTo(0.5);
        expect(step.Advance(StepSeconds * 0.25)).toBe(0);
        expect(step.Alpha).toBeCloseTo(0.75);
        expect(step.Advance(StepSeconds * 0.5)).toBe(1);
        expect(step.Alpha).toBeCloseTo(0.25);
        // Run a hair early, so it's owed a hair less than nothing: drawn at the step just run.
        step.Reset();
        step.Advance(StepSeconds * 0.95);
        expect(step.Alpha).toBe(0);
    });

    it("starts again from nothing after Reset", () => {
        const step = new FixedStep();
        step.Advance(StepSeconds * 0.8);
        step.Reset();
        expect(step.Alpha).toBe(0);
        expect(step.Advance(StepSeconds * 0.5)).toBe(0);
    });

    it("ignores time running backwards", () => {
        const step = new FixedStep();
        expect(step.Advance(-1)).toBe(0);
        expect(step.Alpha).toBe(0);
    });
});

describe("Between", () => {
    it("is the point that share of the way along", () => {
        const out = { x: 0, y: 0 };
        expect(Between({ x: 0, y: 10 }, { x: 8, y: 2 }, 0, out)).toEqual({ x: 0, y: 10 });
        expect(Between({ x: 0, y: 10 }, { x: 8, y: 2 }, 0.25, out)).toEqual({ x: 2, y: 8 });
        expect(Between({ x: 0, y: 10 }, { x: 8, y: 2 }, 1, out)).toBe(out);
        expect(out).toEqual({ x: 8, y: 2 });
    });
});
