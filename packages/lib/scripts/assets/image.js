"use strict";

/**
 * Pixel operations on `{ width, height, data }` images (8-bit RGBA, row-major, `data` a Buffer or
 * Uint8Array) - what the atlas packer needs to trim a frame, lay it into a page and extrude its
 * edge. No file or PNG knowledge (see png.js), so each is testable on a hand-made few-pixel image.
 */

function NewImage(width, height) {
    return { width, height, data: Buffer.alloc(width * height * 4) };
}

/**
 * The bounding box of the pixels whose alpha is above `threshold`, as `{ x, y, w, h }`; null if
 * there are none (a fully transparent image).
 */
function TrimBounds(img, threshold) {
    let minX = img.width;
    let minY = img.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
            if (img.data[(y * img.width + x) * 4 + 3] > threshold) {
                if (x < minX) { minX = x; }
                if (x > maxX) { maxX = x; }
                if (y < minY) { minY = y; }
                if (y > maxY) { maxY = y; }
            }
        }
    }
    return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** A copy of the `rect` (`{ x, y, w, h }`) part of `img`. */
function Crop(img, rect) {
    const out = NewImage(rect.w, rect.h);
    for (let row = 0; row < rect.h; row++) {
        const from = ((rect.y + row) * img.width + rect.x) * 4;
        Buffer.from(img.data.buffer, img.data.byteOffset + from, rect.w * 4).copy(out.data, row * rect.w * 4);
    }
    return out;
}

/** Copies all of `src` into `dst` with its top-left at (dx, dy), row by row. The destination must have room. */
function Blit(dst, src, dx, dy) {
    for (let row = 0; row < src.height; row++) {
        const from = row * src.width * 4;
        Buffer.from(src.data.buffer, src.data.byteOffset + from, src.width * 4).copy(dst.data, ((dy + row) * dst.width + dx) * 4);
    }
}

/**
 * Fills the `e`-pixel gutter around the `rect` (`{ x, y, w, h }`) already blitted into `img` with
 * copies of its nearest edge pixel (corners from the corner pixel). With the texture filtered
 * smoothly (or sampled a hair off), a sprite then bleeds its own edge colour rather than its
 * neighbour's - without it, tiles in a packed sheet show seams.
 */
function Extrude(img, rect, e) {
    for (let y = rect.y - e; y < rect.y + rect.h + e; y++) {
        for (let x = rect.x - e; x < rect.x + rect.w + e; x++) {
            const inside = x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
            if (inside) {
                continue;
            }
            const sx = Math.min(Math.max(x, rect.x), rect.x + rect.w - 1);
            const sy = Math.min(Math.max(y, rect.y), rect.y + rect.h - 1);
            const from = (sy * img.width + sx) * 4;
            const to = (y * img.width + x) * 4;
            img.data[to] = img.data[from];
            img.data[to + 1] = img.data[from + 1];
            img.data[to + 2] = img.data[from + 2];
            img.data[to + 3] = img.data[from + 3];
        }
    }
}

module.exports = { NewImage, TrimBounds, Crop, Blit, Extrude };
