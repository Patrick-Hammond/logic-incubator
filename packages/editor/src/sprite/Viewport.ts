/**
 * Where the sprite sits in the editing canvas: a zoom and a pan, and the sums between screen pixels and sprite pixels.
 * `x`, `y` are where the sprite's top-left corner is, in the canvas's own CSS pixels. Pure - no DOM - so it runs under the
 * plain node test runner (see Viewport.test.ts).
 */

import { Point } from "./Bitmap";

export type View = { zoom: number; x: number; y: number };

/** The zoom steps, whole numbers from 2 up so pixels stay square and crisp (below 1 is for sprites bigger than the window). */
export const ZoomLevels: ReadonlyArray<number> = [0.25, 0.5, 1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64];
export const MinZoom = ZoomLevels[0];
export const MaxZoom = ZoomLevels[ZoomLevels.length - 1];

export function ClampZoom(zoom: number): number {
    return Math.max(MinZoom, Math.min(MaxZoom, zoom));
}

/** The sprite-pixel coordinates (fractional) under a point of the canvas. */
export function ScreenToImage(view: View, sx: number, sy: number): { x: number; y: number } {
    return { x: (sx - view.x) / view.zoom, y: (sy - view.y) / view.zoom };
}

/** The sprite pixel under a point of the canvas (may be outside the sprite). */
export function ImageCell(view: View, sx: number, sy: number): Point {
    const p = ScreenToImage(view, sx, sy);
    return { x: Math.floor(p.x), y: Math.floor(p.y) };
}

/** Where a sprite-pixel coordinate lands on the canvas. */
export function ImageToScreen(view: View, ix: number, iy: number): { x: number; y: number } {
    return { x: view.x + ix * view.zoom, y: view.y + iy * view.zoom };
}

/** The view at another zoom, with whatever's under (sx, sy) staying under it. */
export function ZoomAt(view: View, zoom: number, sx: number, sy: number): View {
    const next = ClampZoom(zoom);
    const p = ScreenToImage(view, sx, sy);
    return { zoom: next, x: sx - p.x * next, y: sy - p.y * next };
}

/** The next zoom level up (`direction` 1) or down (-1) from `zoom`, whatever it is now; stays put at the ends. */
export function StepZoom(zoom: number, direction: 1 | -1): number {
    if (direction > 0) {
        const next = ZoomLevels.filter(level => level > zoom + 1e-9)[0];
        return next === undefined ? MaxZoom : next;
    }
    const below = ZoomLevels.filter(level => level < zoom - 1e-9);
    return below.length ? below[below.length - 1] : MinZoom;
}

/** The sprite centred in the box. */
export function CenterView(zoom: number, imageWidth: number, imageHeight: number, boxWidth: number, boxHeight: number): View {
    return { zoom, x: Math.round((boxWidth - imageWidth * zoom) / 2), y: Math.round((boxHeight - imageHeight * zoom) / 2) };
}

/** The biggest zoom level at which the whole sprite fits the box with `margin` spare on each side, and centred. */
export function FitView(imageWidth: number, imageHeight: number, boxWidth: number, boxHeight: number, margin = 24): View {
    const room = { w: Math.max(1, boxWidth - margin * 2), h: Math.max(1, boxHeight - margin * 2) };
    let zoom = MinZoom;
    ZoomLevels.forEach(level => {
        if (imageWidth * level <= room.w && imageHeight * level <= room.h) {
            zoom = level;
        }
    });
    return CenterView(zoom, imageWidth, imageHeight, boxWidth, boxHeight);
}

/** The view panned by (dx, dy) screen pixels, not letting the sprite leave the box entirely (at least `keep` of it stays in sight). */
export function PanBy(view: View, dx: number, dy: number, imageWidth: number, imageHeight: number, boxWidth: number, boxHeight: number, keep = 48): View {
    const w = imageWidth * view.zoom;
    const h = imageHeight * view.zoom;
    const x = Math.max(keep - w, Math.min(boxWidth - keep, view.x + dx));
    const y = Math.max(keep - h, Math.min(boxHeight - keep, view.y + dy));
    return { zoom: view.zoom, x: Math.round(x), y: Math.round(y) };
}
