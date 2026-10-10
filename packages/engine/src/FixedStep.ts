/**
 * Runs play in steps of a fixed length whatever the display's frame rate, so it
 * comes out the same on a 60 Hz screen, a 144 Hz one or a slow phone - and on
 * every machine in a game played together. Drawing goes between the last two
 * steps by `Alpha`. Pure - no pixi - so it runs under the plain node test runner.
 */

import { Vec2Like } from "@logic-incubator/lib/math/Geometry";

/** Seconds in one step of play: 60 a second, the rate movement was tuned at (a `dt` of 1 frame). */
export const StepSeconds = 1 / 60;
/** Most seconds one display frame counts for - as pixi's ticker already caps it - so a stall slows play down rather than running a burst of steps. */
export const MaxFrameSeconds = 0.1;
/**
 * Share of a step it may run early by. A 60 Hz display's frames come a hair either side of 1/60 s
 * apart, so without it some frames would run no step and the next two, and movement would judder.
 */
const StepTolerance = 0.1;

/** `out` set to the point `alpha` (0 to 1) of the way from `from` to `to` - where to draw something between its last two steps. */
export function Between(from: Vec2Like, to: Vec2Like, alpha: number, out: Vec2Like): Vec2Like {
    out.x = from.x + (to.x - from.x) * alpha;
    out.y = from.y + (to.y - from.y) * alpha;
    return out;
}

export default class FixedStep {
    private saved = 0;

    constructor(private stepSeconds = StepSeconds) {}

    /** How far the time so far is between the last step and the next, 0 to 1 - what drawing goes between the last two steps by. */
    get Alpha(): number {
        return Math.min(1, Math.max(0, this.saved / this.stepSeconds));
    }

    /** Adds a display frame's `seconds` and returns how many steps are due now. */
    Advance(seconds: number): number {
        this.saved += Math.min(Math.max(0, seconds), MaxFrameSeconds);
        const steps = Math.floor(this.saved / this.stepSeconds + StepTolerance);
        this.saved -= steps * this.stepSeconds;
        return steps;
    }

    /** Forgets the time saved towards the next step - for a fresh start, so a level doesn't open with a burst of steps. */
    Reset(): void {
        this.saved = 0;
    }
}
