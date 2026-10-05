/**
 * The layout of an ornamental border line (see `BorderStyleSkin`): a cap at each end, an ornament in the middle and the repeating piece filling what is
 * left on either side of it. Whole pixels; a line too short for the ornament drops it, and one too short for the caps is raised to fit them. Pure.
 */

export type BorderPieceSizes = {
    capLeft: number;
    capRight: number;
    /** The ornament's width, or 0 for a style without one. */
    centre: number;
    /** The repeating piece's width, or 0 for a style without one (the gaps are left empty). */
    mid: number;
};

export type BorderPiece = {
    part: "capLeft" | "capRight" | "centre" | "mid";
    x: number;
    /** For `mid`, the room to fill by repeating the piece; for the others, the piece's own width. */
    width: number;
};

/** The pieces of a line `width` pixels wide, left to right. The line is raised to the caps' combined width if it is narrower. */
export function BorderRects(width: number, sizes: BorderPieceSizes): BorderPiece[] {
    const caps = sizes.capLeft + sizes.capRight;
    const total = Math.max(caps, Math.round(width));
    const room = total - caps;
    const pieces: BorderPiece[] = [{ part: "capLeft", x: 0, width: sizes.capLeft }];

    const showCentre = sizes.centre > 0 && room >= sizes.centre;
    if (showCentre) {
        // The ornament sits in the middle of the room between the caps, on a whole pixel.
        const centreX = sizes.capLeft + Math.floor((room - sizes.centre) / 2);
        const leftGap = centreX - sizes.capLeft;
        const rightGap = total - sizes.capRight - (centreX + sizes.centre);
        if (sizes.mid > 0 && leftGap > 0) pieces.push({ part: "mid", x: sizes.capLeft, width: leftGap });
        pieces.push({ part: "centre", x: centreX, width: sizes.centre });
        if (sizes.mid > 0 && rightGap > 0) pieces.push({ part: "mid", x: centreX + sizes.centre, width: rightGap });
    } else if (sizes.mid > 0 && room > 0) {
        pieces.push({ part: "mid", x: sizes.capLeft, width: room });
    }

    pieces.push({ part: "capRight", x: total - sizes.capRight, width: sizes.capRight });
    return pieces;
}
