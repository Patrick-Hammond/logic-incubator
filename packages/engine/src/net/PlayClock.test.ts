import { describe, expect, it } from "vitest";
import PlayClock, { DrawDelayMs } from "./PlayClock";

const StepMs = 1000 / 60;

/** Snapshots every third step, arriving `latency` ms (plus whatever `extra` says for each) after the host made them, from host step `from`; the clock advanced a 60th of a second between. Returns the clock and the time it got to. */
function Run(clock: PlayClock, steps: number, latency: number, extra: (step: number) => number = () => 0, start = 0): number {
    let now = start;
    for (let step = 1; step <= steps; step++) {
        now = start + step * StepMs;
        if (step % 3 === 0) {
            // The snapshot of host step `step` arrives `latency` later: what the clock sees then.
            clock.Observe(step, now + latency + extra(step));
        }
        clock.Advance(now + latency, 1);
    }
    return now + latency;
}

describe("PlayClock", () => {
    it("draws DrawDelayMs behind the host's newest step", () => {
        const clock = new PlayClock();
        expect(clock.Started).toBe(false);
        Run(clock, 120, 80);
        expect(clock.Started).toBe(true);
        // The newest snapshot (step 120) arrived just now; drawing is 100 ms - 6 steps - behind it.
        expect(clock.Tick).toBeCloseTo(120 - DrawDelayMs / StepMs, 1);
    });

    it("isn't pulled back by a snapshot that came late - the line was slow, not the host", () => {
        const clock = new PlayClock();
        Run(clock, 120, 80, step => (step === 117 ? 200 : 0));
        expect(clock.Tick).toBeCloseTo(120 - DrawDelayMs / StepMs, 0);
    });

    it("moves to a host that stalled - a slow frame, a level loading - rather than holding back on it", () => {
        const clock = new PlayClock();
        let now = Run(clock, 60, 80);
        // The host stops for two seconds, then carries on from step 60.
        for (let step = 61; step <= 180; step++) {
            now += StepMs;
            if (step % 3 === 0) {
                clock.Observe(step, now + 2000);
            }
            clock.Advance(now + 2000, 1);
        }
        expect(clock.Tick).toBeCloseTo(180 - DrawDelayMs / StepMs, 0);
    });

    it("goes on at the frames' pace between snapshots, without jumping", () => {
        const clock = new PlayClock();
        const now = Run(clock, 60, 50);
        const before = clock.Tick;
        clock.Advance(now + StepMs, 1);
        expect(clock.Tick - before).toBeCloseTo(1, 1);
    });

    it("starts afresh on Reset", () => {
        const clock = new PlayClock();
        Run(clock, 30, 50);
        clock.Reset();
        expect(clock.Started).toBe(false);
        expect(clock.Tick).toBe(0);
    });
});
