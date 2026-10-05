/**
 * Which of a row of icons are full, half or empty for an amount: three hearts of two halves each showing 5 of 6 is full, full, half. Pure.
 */

export type IconState = "full" | "half" | "empty";

/**
 * `count` icons standing for `max` units (each icon is `max / count`, so 6 units over 3 icons is 2 each); `value` units are filled from the left. A half is used only where
 * `halves` is true (a skin with a half icon); otherwise a partly filled icon is full if more than half of it is, else empty.
 */
export function IconStates(value: number, max: number, count: number, halves: boolean): IconState[] {
    const states: IconState[] = [];
    const per = count > 0 ? max / count : 0;
    const clamped = Math.max(0, Math.min(max, value));
    for (let i = 0; i < count; i++) {
        const filled = per > 0 ? (clamped - i * per) / per : 0;
        if (filled >= 1) states.push("full");
        else if (filled <= 0) states.push("empty");
        else if (halves) states.push(filled >= 0.75 ? "full" : filled >= 0.25 ? "half" : "empty");
        else states.push(filled > 0.5 ? "full" : "empty");
    }
    return states;
}
