/**
 * Which key does what in a UI: arrows and WASD move, Enter and Space accept, Escape and Backspace cancel, Q/E and Page Up/Down step through tabs. Key codes
 * (`KeyboardEvent.keyCode`, which is what lib's `Keyboard` reports) rather than `key` names, so it matches the rest of the game; written out here, not
 * imported from lib's `Key`, so this stays free of Pixi. Pure.
 */

import { UiAction } from "./UiAction";

const Actions: { [keyCode: number]: UiAction } = {
    38: "up", // arrow up
    40: "down",
    37: "left",
    39: "right",
    87: "up", // W
    83: "down", // S
    65: "left", // A
    68: "right", // D
    13: "accept", // Enter
    32: "accept", // Space
    27: "cancel", // Escape
    8: "cancel", // Backspace
    81: "tabPrev", // Q
    69: "tabNext", // E
    33: "tabPrev", // Page Up
    34: "tabNext" // Page Down
};

/** The action a key stands for, or null for a key the UI doesn't use. */
export function ActionForKeyCode(keyCode: number): UiAction | null {
    return Actions[keyCode] || null;
}
