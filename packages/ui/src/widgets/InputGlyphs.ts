/**
 * Which button-prompt picture stands for a key, a pad button, a stick or a mouse button: the frame names of the kit's prompts (`key_e`, `pad_a`, `stick_l_u`, `mouse_left`), so a
 * hint can show the control itself rather than spell it out. Keys are key codes (`KeyboardEvent.keyCode`, what lib's `Keyboard` reports) and pad buttons the standard layout's
 * indices (what lib's `GamePad` reads). Only the controls the art draws have a picture; anything else is null, for the caller to write out instead. Pure.
 */

import { Direction } from "../input/UiAction";

const NamedKeys: { [keyCode: number]: string } = {
    9: "key_tab",
    13: "key_enter",
    16: "key_shift",
    17: "key_ctrl",
    18: "key_alt",
    32: "key_space"
};

const PadButtons: { [index: number]: string } = {
    0: "pad_a",
    1: "pad_b",
    2: "pad_x",
    3: "pad_y",
    4: "pad_l",
    5: "pad_r",
    6: "pad_l2",
    7: "pad_r2",
    12: "pad_dpad_u",
    13: "pad_dpad_d",
    14: "pad_dpad_l",
    15: "pad_dpad_r"
};

const Ways: { [direction in Direction]: string } = { up: "u", down: "d", left: "l", right: "r" };

/** The picture of a key: letters, digits, Space, Enter, Tab, Shift, Ctrl and Alt. */
export function KeyGlyph(keyCode: number): string | null {
    if (keyCode >= 65 && keyCode <= 90) return "key_" + String.fromCharCode(keyCode + 32);
    if (keyCode >= 48 && keyCode <= 57) return "key_" + String.fromCharCode(keyCode);
    // The number pad's digits are drawn as the main row's.
    if (keyCode >= 96 && keyCode <= 105) return "key_" + String.fromCharCode(keyCode - 48);
    return NamedKeys[keyCode] || null;
}

/** The picture of a pad button: A, B, X, Y, the shoulders and triggers, and the d-pad's directions. */
export function PadButtonGlyph(index: number): string | null {
    return PadButtons[index] || null;
}

/** The d-pad pushed one way, or the whole d-pad (for "move"). */
export function DpadGlyph(direction?: Direction): string {
    return direction ? "pad_dpad_" + Ways[direction] : "pad_dpad";
}

/** A stick pushed one way. */
export function StickGlyph(stick: "left" | "right", direction: Direction): string {
    return (stick === "left" ? "stick_l_" : "stick_r_") + Ways[direction];
}

/** A mouse button (0 left, 2 right) or the wheel. */
export function MouseGlyph(button: number | "wheel"): string | null {
    return button === "wheel" ? "mouse_wheel" : button === 0 ? "mouse_left" : button === 2 ? "mouse_right" : null;
}

/** The pressed look of a prompt (the pad's buttons have one): `pad_a` is `pad_a_pressed`. */
export function PressedGlyph(glyph: string): string {
    return glyph + "_pressed";
}
