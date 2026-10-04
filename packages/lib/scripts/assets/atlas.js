"use strict";

/**
 * Packs frames into atlas pages - the job SpriteSheetPacker.exe used to do. Pure: it takes decoded
 * images and returns decoded page images plus the frame table; reading and writing files is the
 * caller's.
 *
 * The result must be the same for the same input on every machine (it's hashed for cache-busting
 * and committed art shouldn't churn), so nothing here depends on input order, locale or time: the
 * frames are sorted by (longest edge desc, height desc, key) before they reach the packer, and
 * the packer is fed one rect at a time rather than through `addArray`, whose own sort has no
 * tie-break for the many equal-sized tiles a dungeon sheet is full of.
 */

const { MaxRectsPacker } = require("maxrects-packer");
const { CompareKeys } = require("./ids");
const { Blit, Crop, Extrude, NewImage, TrimBounds } = require("./image");

const DEFAULT_ATLAS_OPTIONS = {
    maxSize: 4096,
    padding: 0,
    extrude: 1,
    trim: true,
    alphaThreshold: 0,
    pot: false
};

function NextPowerOfTwo(n) {
    let p = 1;
    while (p < n) {
        p *= 2;
    }
    return p;
}

/**
 * @param {{ key: string, image: { width: number, height: number, data: Buffer } }[]} frames `key` is the final frame key
 * @param {object} [options] see DEFAULT_ATLAS_OPTIONS
 * @returns {{ pages: { width: number, height: number, image: object, frames: object[] }[], diagnostics: { level: string, message: string }[] }}
 */
function PackAtlas(frames, options) {
    const opts = Object.assign({}, DEFAULT_ATLAS_OPTIONS, options);
    const diagnostics = [];
    const e = opts.extrude;

    const prepared = frames.map(({ key, image }) => {
        let bounds = opts.trim ? TrimBounds(image, opts.alphaThreshold) : { x: 0, y: 0, w: image.width, h: image.height };
        if (!bounds) {
            diagnostics.push({ level: "warning", message: `frame "${key}" is fully transparent - packed as a 1x1 pixel.` });
            bounds = { x: 0, y: 0, w: 1, h: 1 };
        }
        const trimmed = bounds.w !== image.width || bounds.h !== image.height;
        return {
            key,
            bounds,
            trimmed,
            sourceSize: { w: image.width, h: image.height },
            pixels: trimmed || !opts.trim ? Crop(image, bounds) : image,
            width: bounds.w + 2 * e,
            height: bounds.h + 2 * e
        };
    });

    const oversize = prepared.filter(f => f.width > opts.maxSize || f.height > opts.maxSize);
    oversize.forEach(f => {
        diagnostics.push({
            level: "error",
            message: `frame "${f.key}" is ${f.bounds.w}x${f.bounds.h} (${f.width}x${f.height} with its ${e}px extrude) - larger than the ${opts.maxSize}px atlas page.`
        });
    });
    if (oversize.length) {
        return { pages: [], diagnostics };
    }

    prepared.sort((a, b) => Math.max(b.width, b.height) - Math.max(a.width, a.height) || b.height - a.height || CompareKeys(a.key, b.key));

    const packer = new MaxRectsPacker(opts.maxSize, opts.maxSize, opts.padding, { smart: true, pot: false, square: false, allowRotation: false, border: 0 });
    prepared.forEach(f => packer.add(f.width, f.height, f));

    const pages = packer.bins.map(bin => {
        let width = 0;
        let height = 0;
        bin.rects.forEach(r => {
            width = Math.max(width, r.x + r.width);
            height = Math.max(height, r.y + r.height);
        });
        if (opts.pot) {
            width = NextPowerOfTwo(width);
            height = NextPowerOfTwo(height);
        }
        const image = NewImage(width, height);
        const placed = bin.rects.map(r => {
            const f = r.data;
            Blit(image, f.pixels, r.x + e, r.y + e);
            if (e > 0) {
                Extrude(image, { x: r.x + e, y: r.y + e, w: f.bounds.w, h: f.bounds.h }, e);
            }
            return {
                key: f.key,
                frame: { x: r.x + e, y: r.y + e, w: f.bounds.w, h: f.bounds.h },
                trimmed: f.trimmed,
                spriteSourceSize: { x: f.bounds.x, y: f.bounds.y, w: f.bounds.w, h: f.bounds.h },
                sourceSize: f.sourceSize
            };
        });
        placed.sort((a, b) => CompareKeys(a.key, b.key));
        return { width, height, image, frames: placed };
    });

    return { pages, diagnostics };
}

/**
 * The pixi 5 spritesheet JSON for one page. `trimmed:false` frames carry no trim data on purpose:
 * pixi 5.2.1 builds `texture.trim`/`orig` for every frame it isn't told is untrimmed.
 */
function AtlasJson(page, imageName) {
    const frames = {};
    page.frames.forEach(f => {
        frames[f.key] = {
            frame: f.frame,
            rotated: false,
            trimmed: f.trimmed,
            spriteSourceSize: f.spriteSourceSize,
            sourceSize: f.sourceSize
        };
    });
    return {
        frames,
        meta: { app: "logic-incubator-assets", image: imageName, format: "RGBA8888", size: { w: page.width, h: page.height }, scale: "1" }
    };
}

module.exports = { DEFAULT_ATLAS_OPTIONS, PackAtlas, AtlasJson };
