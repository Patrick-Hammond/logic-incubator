/**
 * When the heroes' feet land (`SoundTable.footstep`, or on a floor overlay `SoundTable.footsteps`): a step the moment their player
 * pushes them off (`Walker.pushing`), however briefly, then one every so many seconds while they keep moving with that push held.
 * Sliding on inertia (not being pushed) makes no continuing steps. Floors can stretch that time a little through
 * `Walker.movementPenalty` (0 none, 1 most) so slower footing still sounds slower, without binding footsteps to distance. A hero who
 * isn't walking - fallen, away, or jumped further than a step in one frame (a warp, a restart) - starts again from where they are.
 * Pure - no pixi - so it runs under the plain node test runner.
 */

import type { Vec2Like } from "@logic-incubator/lib/math/Geometry";

/** Seconds between footsteps at full pace while moving. */
export const DefaultStepSeconds = 0.2;
/** If a hero jumps this many pixels in a frame, treat it as a warp (teleport, restart), not walking. */
export const DefaultWarpDistance = 32;
/** How much `movementPenalty` stretches `DefaultStepSeconds` (0 none, 0.3 means up to 30% longer). */
const PenaltyStretch = 2;

/**
 * A hero walking, for `Footsteps.Update`: where they are, in pixels, and whether their player is pushing them along - a direction held
 * - as of the last step of play. Each push that starts is a step, there and then, and further steps come only while that push is held.
 * `movementPenalty` (0 to 1) stretches the time between steps a little. Left out, not pushing, no penalty.
 */
export type Walker = Vec2Like & { pushing?: boolean; movementPenalty?: number };

export default class Footsteps {
    /**
     * By slot: where each hero was last frame (null for one not walking), how long since their last step and whether they were being
     * pushed along.
     */
    private last: Array<{ x: number; y: number } | null> = [];
    private waited: number[] = [];
    private pushing: boolean[] = [];
    private readonly stepped: number[] = [];

    constructor(private readonly stepSeconds: number = DefaultStepSeconds, private readonly warpDistance: number = DefaultWarpDistance) {}

    /** Forgets everyone's walking - at the start of a level. */
    Reset(): void {
        this.last = [];
        this.waited = [];
        this.pushing = [];
        this.stepped.length = 0;
    }

    /** How long this walker waits between steps while moving. */
    private StepDuration(penalty: number | undefined): number {
        const clamped = Math.max(0, Math.min(1, penalty || 0));
        return this.stepSeconds * (1 + clamped * PenaltyStretch);
    }

    /**
     * Once a frame: where each hero is and whether they're being pushed along, by slot - null for one not walking. Returns the slots
     * of those who took a step since the last, in slot order (the same list each time, so read it before the next).
     */
    Update(walkers: ReadonlyArray<Walker | null>, seconds: number): ReadonlyArray<number> {
        const stepped = this.stepped;
        stepped.length = 0;
        walkers.forEach((walker, i) => {
            const last = this.last[i];
            if (!walker) {
                this.last[i] = null;
                this.pushing[i] = false;
                return;
            }
            const duration = this.StepDuration(walker.movementPenalty);
            const pushed = !!walker.pushing && !this.pushing[i];
            this.pushing[i] = !!walker.pushing;
            const moved = last ? Math.sqrt((walker.x - last.x) * (walker.x - last.x) + (walker.y - last.y) * (walker.y - last.y)) : 0;
            if (!last || moved > this.warpDistance) {
                // Setting off, or somewhere new all at once: the first step comes at half the usual wait.
                this.waited[i] = duration * 0.5;
            } else if (moved > 1e-9 && this.pushing[i]) {
                this.waited[i] += seconds;
            }
            this.last[i] = { x: walker.x, y: walker.y };
            if (pushed) {
                // A key just pressed, a stick just pushed: a step, heard at once however short the walk - the next after a full wait.
                this.waited[i] = 0;
                stepped.push(i);
            } else if (moved > 1e-9 && this.pushing[i] && this.waited[i] >= duration - 1e-9) {
                // A hair short counts. One step a frame at most - the next no more than half a wait on.
                this.waited[i] = Math.min(duration * 0.5, this.waited[i] - duration);
                stepped.push(i);
            }
        });
        this.last.length = walkers.length;
        return stepped;
    }
}
