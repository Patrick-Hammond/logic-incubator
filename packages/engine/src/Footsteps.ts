/**
 * When the heroes' feet land (`SoundTable.footstep`, or on a floor overlay `SoundTable.footsteps`): a step the moment their player
 * pushes them off (`Walker.pushing`), however briefly, then one every `stride` pixels they walk. By distance, so how often is in
 * step with how fast they go: on a floor that slows them to 0.4 of their speed (water), their steps come 0.4 as often. A hero
 * who isn't walking - fallen, away, or jumped further than a step in one frame (a warp, a restart) - starts again from where they
 * are. Pure - no pixi - so it runs under the plain node test runner.
 */

import type { Vec2Like } from "@logic-incubator/lib/math/Geometry";

/** Pixels a hero walks between steps: about five a second at a hero's full speed (some 4 pixels a step of play). */
export const DefaultStride = 48;

/**
 * A hero walking, for `Footsteps.Update`: where they are, in pixels, and whether their player is pushing them along - a direction
 * held - as of the last step of play. Each push that starts is a step, there and then. Left out, not pushing.
 */
export type Walker = Vec2Like & { pushing?: boolean };

export default class Footsteps {
    /**
     * By slot: where each hero was last frame (null for one not walking), how far they've walked since their last step, in strides,
     * and whether they were being pushed along.
     */
    private last: Array<{ x: number; y: number } | null> = [];
    private walked: number[] = [];
    private pushing: boolean[] = [];
    private readonly stepped: number[] = [];

    constructor(private readonly stride: number = DefaultStride) {}

    /** Forgets everyone's walking - at the start of a level. */
    Reset(): void {
        this.last = [];
        this.walked = [];
        this.pushing = [];
        this.stepped.length = 0;
    }

    /**
     * Once a frame: where each hero is and whether they're being pushed along, by slot - null for one not walking. Returns the slots
     * of those who took a step since the last, in slot order (the same list each time, so read it before the next).
     */
    Update(walkers: ReadonlyArray<Walker | null>): ReadonlyArray<number> {
        const stepped = this.stepped;
        stepped.length = 0;
        walkers.forEach((walker, i) => {
            const last = this.last[i];
            if (!walker) {
                this.last[i] = null;
                this.pushing[i] = false;
                return;
            }
            const pushed = !!walker.pushing && !this.pushing[i];
            this.pushing[i] = !!walker.pushing;
            const moved = last ? Math.sqrt((walker.x - last.x) * (walker.x - last.x) + (walker.y - last.y) * (walker.y - last.y)) : 0;
            if (!last || moved > this.stride) {
                // Setting off, or somewhere new all at once: the first step comes at half a stride.
                this.walked[i] = 0.5;
            } else {
                this.walked[i] += moved / this.stride;
            }
            this.last[i] = { x: walker.x, y: walker.y };
            if (pushed) {
                // A key just pressed, a stick just pushed: a step, heard at once however short the walk - the next a whole stride on.
                this.walked[i] = 0;
                stepped.push(i);
            } else if (this.walked[i] >= 1 - 1e-9) {
                // A hair short counts: a tenth of a stride added ten times doesn't quite make one. One step a frame, however far it went - the
                // next at most half a stride on.
                this.walked[i] = Math.min(0.5, this.walked[i] - 1);
                stepped.push(i);
            }
        });
        this.last.length = walkers.length;
        return stepped;
    }
}
