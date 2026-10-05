/**
 * Which gamepad controls do what in a UI, for the standard layout lib's `GamePad` reads: the d-pad (as buttons 12 to 15, or as the single axis some pads
 * report it on), the left stick past its dead zone, A to accept, B to cancel and the shoulder buttons for tabs. `PadSample` is a snapshot of whatever pad
 * there is; `ActionsFromPad` says which actions it is holding. Pure.
 */

import { Direction, UiAction } from "./UiAction";

export type PadSample = {
    /** Whether button `index` of the standard layout is down. */
    button(index: number): boolean;
    /** The left stick, each axis -1 to 1. */
    stick: { x: number; y: number };
    /** The d-pad where the pad reports it as an axis rather than buttons, or "none". */
    dpad: Direction | "none";
};

export const PadButton = { accept: 0, cancel: 1, tabPrev: 4, tabNext: 5, up: 12, down: 13, left: 14, right: 15 } as const;

/** The actions the pad is holding right now (a stick held diagonally counts as its stronger axis, so it doesn't fire two directions at once). */
export function ActionsFromPad(pad: PadSample, deadZone = 0.5): UiAction[] {
    const held: UiAction[] = [];
    const add = (action: UiAction) => {
        if (held.indexOf(action) < 0) held.push(action);
    };

    (["up", "down", "left", "right"] as const).forEach(direction => pad.button(PadButton[direction]) && add(direction));
    if (pad.dpad !== "none") add(pad.dpad);

    const { x, y } = pad.stick;
    if (Math.abs(x) >= deadZone || Math.abs(y) >= deadZone) {
        if (Math.abs(x) > Math.abs(y)) add(x < 0 ? "left" : "right");
        else add(y < 0 ? "up" : "down");
    }

    (["accept", "cancel", "tabPrev", "tabNext"] as const).forEach(action => pad.button(PadButton[action]) && add(action));
    return held;
}
