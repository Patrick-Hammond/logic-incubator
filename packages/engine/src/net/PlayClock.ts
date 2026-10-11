/**
 * Which moment of the host's play a guest draws: a little behind the newest
 * snapshot, so there's nearly always one either side of it to draw between
 * (see `Replica`). Each snapshot names the host's step; the clock learns from
 * when they arrive how far the host's steps are ahead of this machine's own
 * clock, trusting the quickest arrivals - a late one is the line being slow,
 * not the host - and moves smoothly when that changes. Pure - no pixi - so it
 * runs under the plain node test runner.
 */

import { StepSeconds } from "../FixedStep";

/** How far behind the host's newest step a guest draws, in milliseconds: two snapshots' worth, so one late snapshot doesn't leave a gap. */
export const DrawDelayMs = 100;
/** A snapshot this much later than the clock expects means the host itself stalled (a slow frame, a level loading), not the line - start again from it. */
const ResyncMs = 300;
/** Share of the way the estimate moves towards a snapshot that came later than expected. */
const LateWeight = 0.05;
/** Share of the gap to where it should be that the drawn moment closes each 60th of a second. */
const CatchUp = 0.1;
/** A drawn moment further than this from where it should be jumps there. */
const JumpMs = 250;

const StepMs = StepSeconds * 1000;

export default class PlayClock {
    /** The host's step time minus this machine's clock at the quickest arrival lately, in milliseconds - null before the first. */
    private offset: number | null = null;
    /** The host's moment being drawn, in milliseconds of its steps. */
    private drawn = 0;

    constructor(private delayMs = DrawDelayMs) {}

    /** The host's step being drawn - fractional, between two steps. */
    get Tick(): number {
        return this.drawn / StepMs;
    }

    /** Whether a snapshot has come since the last `Reset`. */
    get Started(): boolean {
        return this.offset !== null;
    }

    /** Snapshot of step `tick` arrived at `nowMs` (this machine's clock). */
    Observe(tick: number, nowMs: number): void {
        const sample = tick * StepMs - nowMs;
        const first = this.offset === null;
        if (this.offset === null || sample > this.offset || this.offset - sample > ResyncMs) {
            this.offset = sample;
        } else {
            this.offset += (sample - this.offset) * LateWeight;
        }
        if (first) {
            this.drawn = this.Target(nowMs);
        }
    }

    /** Moves the drawn moment on to `nowMs`, `frames` 60ths of a second after the last call. */
    Advance(nowMs: number, frames: number): void {
        if (this.offset === null) {
            return;
        }
        const target = this.Target(nowMs);
        this.drawn += frames * StepMs;
        const gap = target - this.drawn;
        if (Math.abs(gap) > JumpMs) {
            this.drawn = target;
        } else {
            this.drawn += gap * Math.min(1, CatchUp * frames);
        }
    }

    /** Forgets the host's timing - for a level starting over. */
    Reset(): void {
        this.offset = null;
        this.drawn = 0;
    }

    private Target(nowMs: number): number {
        return nowMs + (this.offset || 0) - this.delayMs;
    }
}
