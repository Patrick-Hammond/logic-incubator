/**
 * Where a tooltip goes: above the thing it points at if there is room (its tail pointing down), otherwise below it; centred on it, shifted to stay inside the bounds, with the
 * tail still pointing at the thing's middle. Rectangles are { x, y, width, height } in one coordinate space. Pure.
 */

export type Rect = { x: number; y: number; width: number; height: number };

export type TooltipPlace = {
    /** The tooltip's top-left. */
    x: number;
    y: number;
    /** True when it is below the target (the tail points up). */
    below: boolean;
    /** Where the tail's centre is, along the tooltip's width, from its left edge. */
    tailX: number;
};

/**
 * `tail` is the pointer's height, `gap` the space between its tip and the target. The tail's x is kept at least `tailMargin` from the tooltip's corners.
 */
export function PlaceTooltip(target: Rect, size: { width: number; height: number }, bounds: Rect, gap: number, tail: number, tailMargin = 6): TooltipPlace {
    const room = size.height + tail + gap;
    const spaceAbove = target.y - bounds.y;
    const spaceBelow = bounds.y + bounds.height - (target.y + target.height);
    // Above if it fits there; otherwise below - and if it fits in neither, on the side with more room.
    const below = spaceAbove < room && (spaceBelow >= room || spaceBelow > spaceAbove);
    const centre = target.x + target.width / 2;
    const x = Math.round(Math.max(bounds.x, Math.min(bounds.x + bounds.width - size.width, centre - size.width / 2)));
    const y = Math.round(below ? target.y + target.height + gap + tail : target.y - gap - tail - size.height);
    const tailX = Math.round(Math.max(tailMargin, Math.min(size.width - tailMargin, centre - x)));
    return { x, y, below, tailX };
}
