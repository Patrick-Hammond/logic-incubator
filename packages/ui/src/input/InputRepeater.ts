/**
 * Turns "held" into steps: an action fires the moment it is pressed, and - for the ones that repeat (directions, tabs) - after `delay` ms again every
 * `interval` ms for as long as it stays held. A press that is over before the next update still fires once, so a quick tap is never lost between frames.
 * Pure: time comes in as the `deltaMs` of each `Update`.
 */

import { UiAction } from "./UiAction";

export type RepeatOptions = {
    /** Wait after the first step before repeating (ms). */
    delay: number;
    /** Between repeats (ms). */
    interval: number;
    /** The actions that repeat while held; the rest fire once per press. */
    repeats: ReadonlyArray<UiAction>;
};

export const DefaultRepeat: RepeatOptions = { delay: 350, interval: 120, repeats: ["up", "down", "left", "right", "tabPrev", "tabNext"] };

export default class InputRepeater {
    /** Each held action's time left until it repeats. */
    private readonly active = new Map<UiAction, number>();

    constructor(private readonly options: RepeatOptions = DefaultRepeat) {}

    /**
     * The actions that fire this update. `held` is what is down now, `justPressed` what went down since the last update (even if it is already up again).
     */
    Update(held: ReadonlySet<UiAction>, justPressed: ReadonlySet<UiAction>, deltaMs: number): UiAction[] {
        Array.from(this.active.keys()).forEach(action => {
            if (!held.has(action)) this.active.delete(action);
        });

        const fired: UiAction[] = [];
        const consider = new Set<UiAction>();
        held.forEach(action => consider.add(action));
        justPressed.forEach(action => consider.add(action));
        consider.forEach(action => {
            const left = this.active.get(action);
            if (left === undefined) {
                fired.push(action);
                if (held.has(action)) this.active.set(action, this.options.delay);
            } else if (this.options.repeats.indexOf(action) >= 0) {
                const remaining = left - deltaMs;
                if (remaining <= 0) {
                    fired.push(action);
                    // Catching up after a long frame: one step, then a full interval, rather than a burst.
                    this.active.set(action, this.options.interval);
                } else {
                    this.active.set(action, remaining);
                }
            }
        });
        return fired;
    }

    /** Forgets everything held (the window lost focus, the UI went away). */
    Reset(): void {
        this.active.clear();
    }
}
