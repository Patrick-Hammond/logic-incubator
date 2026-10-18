/**
 * When the heroes' feet land (`SoundTable.footstep`): each hero takes a step every `stride` pixels they walk, the first a little sooner,
 * so a hero who sets off is heard at once. A hero who isn't walking - fallen, away, or jumped further than a step in one frame (a warp,
 * a restart) - starts again from where they are. Pure - no pixi - so it runs under the plain node test runner.
 */

import type { Vec2Like } from "@logic-incubator/lib/math/Geometry";

/** Pixels a hero walks between steps: about five a second at a hero's full speed (some 4 pixels a step of play). */
export const DefaultStride = 48;

export default class Footsteps {
    /** By slot: where each hero was last frame (null for one not walking), and how far they've walked since their last step. */
    private last: Array<{ x: number; y: number } | null> = [];
    private walked: number[] = [];

    constructor(private readonly stride: number = DefaultStride) {}

    /** Forgets everyone's walking - at the start of a level. */
    Reset(): void {
        this.last = [];
        this.walked = [];
    }

    /** Once a frame: where each hero is, by slot, in pixels - null for one not walking. How many steps were taken since the last. */
    Update(positions: ReadonlyArray<Vec2Like | null>): number {
        let steps = 0;
        positions.forEach((position, i) => {
            const last = this.last[i];
            if (!position) {
                this.last[i] = null;
                return;
            }
            const moved = last ? Math.sqrt((position.x - last.x) * (position.x - last.x) + (position.y - last.y) * (position.y - last.y)) : 0;
            if (!last || moved > this.stride) {
                // Setting off, or somewhere new all at once: the first step comes at half a stride.
                this.walked[i] = this.stride / 2;
            } else if (moved > 0) {
                this.walked[i] += moved;
                if (this.walked[i] >= this.stride) {
                    this.walked[i] -= this.stride;
                    steps++;
                }
            } else {
                // Standing still: the next step is a fresh start.
                this.walked[i] = this.stride / 2;
            }
            this.last[i] = { x: position.x, y: position.y };
        });
        this.last.length = positions.length;
        return steps;
    }
}
