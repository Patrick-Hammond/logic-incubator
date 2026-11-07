/**
 * When the heroes' feet land (`SoundTable.footstep`, or on a floor overlay `SoundTable.footsteps`): each hero takes a step every
 * `stride` pixels they walk - shorter where the floor slows them (`Walker.pace`), so their feet keep time with their legs - the
 * first a little sooner, so a hero who sets off is heard at once. A hero who isn't walking - fallen, away, or jumped further than a
 * step in one frame (a warp, a restart) - starts again from where they are. Pure - no pixi - so it runs under the plain node test runner.
 */

import type { Vec2Like } from "@logic-incubator/lib/math/Geometry";

/** Pixels a hero walks between steps: about five a second at a hero's full speed (some 4 pixels a step of play). */
export const DefaultStride = 48;

/** The shortest a stride gets, as a share of a full one - however slow the floor, a step every few pixels at most. */
const ShortestPace = 0.05;

/**
 * A hero walking, for `Footsteps.Update`: where they are, in pixels, and `pace`, how fast their legs are carrying them as a share of a
 * walk on bare floor - the speed the floor under them lets them walk at (its `Footing.speed`) - their stride is that share of a full
 * one, so they step as often as ever however slowly they go. 1 left out.
 */
export type Walker = Vec2Like & { pace?: number };

export default class Footsteps {
    /** By slot: where each hero was last frame (null for one not walking), and how far they've walked since their last step, in strides. */
    private last: Array<{ x: number; y: number } | null> = [];
    private walked: number[] = [];
    private readonly stepped: number[] = [];

    constructor(private readonly stride: number = DefaultStride) {}

    /** Forgets everyone's walking - at the start of a level. */
    Reset(): void {
        this.last = [];
        this.walked = [];
        this.stepped.length = 0;
    }

    /**
     * Once a frame: where each hero is, by slot - null for one not walking. Returns the slots of those who took a step since the
     * last, in slot order (the same list each time, so read it before the next).
     */
    Update(walkers: ReadonlyArray<Walker | null>): ReadonlyArray<number> {
        const stepped = this.stepped;
        stepped.length = 0;
        walkers.forEach((walker, i) => {
            const last = this.last[i];
            if (!walker) {
                this.last[i] = null;
                return;
            }
            const moved = last ? Math.sqrt((walker.x - last.x) * (walker.x - last.x) + (walker.y - last.y) * (walker.y - last.y)) : 0;
            if (!last || moved > this.stride) {
                // Setting off, or somewhere new all at once: the first step comes at half a stride.
                this.walked[i] = 0.5;
            } else if (moved > 0) {
                const pace = walker.pace === undefined ? 1 : Math.max(ShortestPace, walker.pace);
                this.walked[i] += moved / (this.stride * pace);
                // A hair short counts: a tenth of a stride added ten times doesn't quite make one.
                if (this.walked[i] >= 1 - 1e-9) {
                    // One step a frame, however far it went - the next at most half a stride on.
                    this.walked[i] = Math.min(0.5, this.walked[i] - 1);
                    stepped.push(i);
                }
            } else {
                // Standing still: the next step is a fresh start.
                this.walked[i] = 0.5;
            }
            this.last[i] = { x: walker.x, y: walker.y };
        });
        this.last.length = walkers.length;
        return stepped;
    }
}
