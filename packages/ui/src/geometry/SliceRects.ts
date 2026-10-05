/**
 * The geometry of a nine-slice: given the frame's size, its insets and the size wanted, which rectangle of the frame goes to which rectangle of the result.
 * Everything is whole pixels - the kit draws pixel art at an integer scale, and a stretched edge that lands on a fraction of a pixel looks wrong - and the
 * result is never smaller than the corners need (a request below that is raised to it). Pure; the Pixi side (`NineSlice`) only turns these into sprites.
 */

import { Insets, InsetsHeight, InsetsWidth } from "../skin/Skin";

export type Rect = { x: number; y: number; width: number; height: number };

export type SlicePart = "topLeft" | "top" | "topRight" | "left" | "centre" | "right" | "bottomLeft" | "bottom" | "bottomRight";

export type Slice = {
    part: SlicePart;
    /** Where it comes from in the frame. */
    src: Rect;
    /** Where it goes in the result. */
    dst: Rect;
};

/** The smallest a nine-slice with these insets can be: the corners, touching. */
export function MinSliceSize(insets: Insets): { width: number; height: number } {
    return { width: InsetsWidth(insets), height: InsetsHeight(insets) };
}

/**
 * The nine slices for a `frame` cut at `insets` and drawn at `target` size, left to right, top to bottom. A part that would be empty (no middle
 * because the result is only as big as its corners, or an inset of 0) is left out. Throws if the insets leave nothing of the frame.
 */
export function SliceRects(frame: { width: number; height: number }, insets: Insets, target: { width: number; height: number }): Slice[] {
    const { left, top, right, bottom } = insets;
    if (left + right >= frame.width || top + bottom >= frame.height) {
        throw new Error(`Insets ${left},${top},${right},${bottom} leave nothing of a ${frame.width}x${frame.height} frame.`);
    }
    const min = MinSliceSize(insets);
    const width = Math.max(min.width, Math.round(target.width));
    const height = Math.max(min.height, Math.round(target.height));

    const srcX = [0, left, frame.width - right];
    const srcW = [left, frame.width - left - right, right];
    const dstX = [0, left, width - right];
    const dstW = [left, width - left - right, right];
    const srcY = [0, top, frame.height - bottom];
    const srcH = [top, frame.height - top - bottom, bottom];
    const dstY = [0, top, height - bottom];
    const dstH = [top, height - top - bottom, bottom];

    const parts: SlicePart[][] = [
        ["topLeft", "top", "topRight"],
        ["left", "centre", "right"],
        ["bottomLeft", "bottom", "bottomRight"]
    ];
    const slices: Slice[] = [];
    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
            if (srcW[col] <= 0 || srcH[row] <= 0 || dstW[col] <= 0 || dstH[row] <= 0) {
                continue;
            }
            slices.push({
                part: parts[row][col],
                src: { x: srcX[col], y: srcY[row], width: srcW[col], height: srcH[row] },
                dst: { x: dstX[col], y: dstY[row], width: dstW[col], height: dstH[row] }
            });
        }
    }
    return slices;
}
