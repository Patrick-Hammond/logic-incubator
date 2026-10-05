/**
 * Which look a button has, from what is happening to it: pure, so the rules (a disabled button ignores the pointer, pressing beats hovering, a focus ring
 * only when nothing stronger applies) are tested without Pixi. `UiControl` feeds it the pointer and focus and draws whatever it answers.
 */

import { ButtonSkin, ButtonState } from "../skin/Skin";

export type ButtonInput = {
    disabled: boolean;
    /** The pointer is pressed on the button (and hasn't left it). */
    pressed: boolean;
    /** The pointer is over it. */
    hover: boolean;
    /** Keyboard or gamepad focus is on it. */
    focused: boolean;
};

/** The state to draw: disabled beats everything, then pressed, then hover, then focus. */
export function ButtonStateOf(input: ButtonInput): ButtonState {
    if (input.disabled) return "disabled";
    if (input.pressed) return "pressed";
    if (input.hover) return "hover";
    if (input.focused) return "focused";
    return "normal";
}

/** What a skin gives a state of something with a normal look and perhaps others: the state's own, or - for a state the skin doesn't draw - the normal one. */
export function PickState<T>(states: { normal: T } & Partial<Record<Exclude<ButtonState, "normal">, T>>, state: ButtonState): T {
    const own = state === "normal" ? undefined : states[state];
    return own === undefined ? states.normal : own;
}

/** The frame a skin gives a state - or `normal`'s, for a state the skin doesn't draw. */
export function ButtonFrameFor(skin: ButtonSkin, state: ButtonState) {
    return PickState(skin.states, state);
}

/** The label colour a skin gives a state - or `normal`'s. */
export function ButtonTextColourFor(skin: ButtonSkin, state: ButtonState): number {
    return PickState(skin.textColour, state);
}
