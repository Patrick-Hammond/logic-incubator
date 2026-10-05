/**
 * What a player can ask of a UI, whatever they asked with: the same few actions come from the keyboard, a gamepad and (for the ones that make sense) the
 * pointer, and the focus manager and the widgets only ever see these. Pure.
 */

export type Direction = "up" | "down" | "left" | "right";

/** `accept` is Enter / Space / the pad's A; `cancel` is Escape / the pad's B; `tabPrev` / `tabNext` step through tabs and pages (Q and E, the pad's shoulder buttons). */
export type UiAction = Direction | "accept" | "cancel" | "tabPrev" | "tabNext";

export const Directions: ReadonlyArray<Direction> = ["up", "down", "left", "right"];

export function IsDirection(action: UiAction): action is Direction {
    return action === "up" || action === "down" || action === "left" || action === "right";
}

/** Where a key comes from, so the focus ring can be shown for the keyboard and gamepad and hidden once the pointer takes over. */
export type InputSource = "keyboard" | "pad" | "pointer";
