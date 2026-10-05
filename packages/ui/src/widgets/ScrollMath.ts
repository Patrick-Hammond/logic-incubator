/**
 * The arithmetic of scrolling: how far content can scroll, how big the scrollbar's thumb is and where it sits, which scroll a thumb position means, how a mouse wheel's
 * movement becomes pixels, and the least scrolling that brings an item into view. Sizes and positions are in one unit (UI pixels) along one axis. Pure.
 */

/** The most the content can scroll: how much of it is out of view (0 if it all fits). */
export function MaxScroll(content: number, viewport: number): number {
    return Math.max(0, content - viewport);
}

export function ClampScroll(scroll: number, content: number, viewport: number): number {
    return Math.max(0, Math.min(MaxScroll(content, viewport), scroll));
}

/** How long the thumb is: the track's length times the fraction of the content in view, at least `minThumb` and at most the track (all of it when everything fits). */
export function ThumbLength(content: number, viewport: number, track: number, minThumb: number): number {
    if (!(content > viewport) || !(track > 0)) {
        return Math.max(0, track);
    }
    return Math.min(track, Math.max(minThumb, Math.round((viewport / content) * track)));
}

/** Where the thumb's start is along the track for a scroll (0 at the top, the track less the thumb at the bottom). */
export function ThumbOffset(scroll: number, content: number, viewport: number, track: number, thumb: number): number {
    const max = MaxScroll(content, viewport);
    const room = Math.max(0, track - thumb);
    return max > 0 ? Math.round((ClampScroll(scroll, content, viewport) / max) * room) : 0;
}

/** The scroll a thumb dragged to `offset` along the track stands for (the inverse of `ThumbOffset`). */
export function ScrollFromThumb(offset: number, content: number, viewport: number, track: number, thumb: number): number {
    const room = Math.max(0, track - thumb);
    if (room <= 0) {
        return 0;
    }
    return ClampScroll((Math.max(0, Math.min(room, offset)) / room) * MaxScroll(content, viewport), content, viewport);
}

/** A wheel event's movement as pixels: `deltaMode` 0 is already pixels, 1 is lines, 2 is pages. */
export function WheelPixels(delta: number, deltaMode: number, lineHeight: number, pageHeight: number): number {
    return deltaMode === 1 ? delta * lineHeight : deltaMode === 2 ? delta * pageHeight : delta;
}

/**
 * The scroll that shows the item spanning [`start`, `end`) in a viewport of `viewport` with the least movement: the same scroll if it is already in view, otherwise the one that puts
 * its near edge `margin` inside the viewport (or, for an item taller than the viewport, its start).
 */
export function ScrollToReveal(scroll: number, viewport: number, start: number, end: number, margin = 0): number {
    if (start - margin < scroll) {
        return Math.max(0, start - margin);
    }
    if (end + margin > scroll + viewport) {
        return Math.max(0, Math.min(start - margin, end + margin - viewport));
    }
    return scroll;
}
