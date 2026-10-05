import type { DisplayObject, interaction } from "pixi.js";
import type { Cancel } from "../game/Timing";

export interface DragOptions {
    /** Round the position to a multiple of this while dragging, in the parent's units. Default 1 (whole pixels); 0 moves freely. */
    snap?: number;
    /** Log the position to the console when the object is dropped, as `label: {x:120, y:70}`. Default true. */
    log?: boolean;
    /** Name for that log line. Default the object's `name`, else its class. */
    label?: string;
}

/** `value` rounded to the nearest multiple of `step`; a `step` of 0 or less leaves it alone. */
function SnapTo(value: number, step: number): number {
    return step > 0 ? Math.round(value / step) * step : value;
}

/** Up to two decimals, so a free (unsnapped) drag logs `12.5`, not `12.499999999999998`. */
function Tidy(value: number): number {
    return Math.round(value * 100) / 100;
}

/**
 * Makes any display object draggable with the mouse, a finger or a pen, for positioning it by eye: press on it, drag, let go,
 * and its position (in its parent's space) is logged as an object literal - `title: {x:120, y:70}` - ready to paste into the
 * code. A development aid.
 *
 * The position logged is the object's own `position`, so drag the thing you are placing: a container that sits at (0, 0) with its
 * contents laid out inside it reports only how far it was dragged.
 *
 * - The object is moved in its parent's space, so a scaled, rotated or offset parent is no problem, and it keeps the point you
 *   grabbed under the pointer.
 * - A drag is followed wherever the pointer goes, off the object and off the canvas, and ends when it is released anywhere.
 * - Needs the object in the stage's interaction tree when it is pressed: shown, with no ancestor that has
 *   `interactiveChildren = false` (a scene that isn't showing, and some of the engine's own layers, have), and not covered by
 *   another interactive object, which takes the press instead. A plain `Container` works when something inside it is under the pointer.
 * - Pressing starts the drag and stops the press reaching the object's ancestors, so a drag-enabled parent doesn't move too.
 *   Anything else listening for `pointerdown` on the object itself still hears it.
 *
 * Returns a function that stops it and puts back the `interactive` and `cursor` the object had.
 */
export function DragObject(target: DisplayObject, options: DragOptions = {}): Cancel {
    const snap = options.snap === undefined ? 1 : options.snap;
    const log = options.log !== false;

    const wasInteractive = target.interactive;
    const wasCursor = target.cursor;
    target.interactive = true;
    target.cursor = "move";

    // The grab offset is kept in the parent's space, where the object's position lives.
    let drag: { pointerId: number; dx: number; dy: number } | null = null;

    const onDown = (event: interaction.InteractionEvent): void => {
        if (drag || !target.parent || event.data.button > 0) {
            return;
        }
        const pointer = event.data.getLocalPosition(target.parent);
        drag = { pointerId: event.data.pointerId, dx: target.x - pointer.x, dy: target.y - pointer.y };
        event.stopPropagation();
    };

    const onMove = (event: interaction.InteractionEvent): void => {
        if (!drag || event.data.pointerId !== drag.pointerId || !target.parent) {
            return;
        }
        const pointer = event.data.getLocalPosition(target.parent);
        target.position.set(SnapTo(pointer.x + drag.dx, snap), SnapTo(pointer.y + drag.dy, snap));
    };

    const onUp = (event: interaction.InteractionEvent): void => {
        if (!drag || event.data.pointerId !== drag.pointerId) {
            return;
        }
        drag = null;
        if (log) {
            const label = options.label || target.name || target.constructor.name;
            console.log(`${label}: {x:${Tidy(target.x)}, y:${Tidy(target.y)}}`);
        }
    };

    target.on("pointerdown", onDown);
    target.on("pointermove", onMove);
    target.on("pointerup", onUp);
    target.on("pointerupoutside", onUp);
    target.on("pointercancel", onUp);

    return () => {
        target.off("pointerdown", onDown);
        target.off("pointermove", onMove);
        target.off("pointerup", onUp);
        target.off("pointerupoutside", onUp);
        target.off("pointercancel", onUp);
        drag = null;
        target.interactive = wasInteractive;
        target.cursor = wasCursor;
    };
}
