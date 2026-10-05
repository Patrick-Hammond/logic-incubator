// Pure RGBA image helpers for the UI art tools: crop, background removal, area downsampling, palette quantising, nearest upscaling, compositing.
// An image is { width, height, data } with data a Uint8Array/Buffer of straight (not premultiplied) RGBA. Nothing here touches the disk or a browser, so
// it is tested under plain node (image.test.mjs).

export function CreateImage(width, height, fill = [0, 0, 0, 0]) {
    const data = new Uint8Array(width * height * 4);
    if (fill[0] || fill[1] || fill[2] || fill[3]) {
        for (let i = 0; i < data.length; i += 4) {
            data[i] = fill[0];
            data[i + 1] = fill[1];
            data[i + 2] = fill[2];
            data[i + 3] = fill[3];
        }
    }
    return { width, height, data };
}

/** The part of `img` inside the box (clipped to the image). */
export function Crop(img, x, y, w, h) {
    const x0 = Math.max(0, x), y0 = Math.max(0, y);
    const x1 = Math.min(img.width, x + w), y1 = Math.min(img.height, y + h);
    const out = CreateImage(Math.max(0, x1 - x0), Math.max(0, y1 - y0));
    for (let row = 0; row < out.height; row++) {
        const from = ((y0 + row) * img.width + x0) * 4;
        out.data.set(img.data.subarray(from, from + out.width * 4), row * out.width * 4);
    }
    return out;
}

/** The colour most of the image's border pixels are (the page background around a crop), as [r, g, b]. */
export function BorderColour(img) {
    const counts = new Map();
    const note = (x, y) => {
        const o = (y * img.width + x) * 4;
        // 4 levels per channel: the mockups' background drifts by a level or two.
        const key = (img.data[o] >> 2) + "," + (img.data[o + 1] >> 2) + "," + (img.data[o + 2] >> 2);
        const entry = counts.get(key) || { n: 0, r: 0, g: 0, b: 0 };
        entry.n++;
        entry.r += img.data[o];
        entry.g += img.data[o + 1];
        entry.b += img.data[o + 2];
        counts.set(key, entry);
    };
    for (let x = 0; x < img.width; x++) {
        note(x, 0);
        note(x, img.height - 1);
    }
    for (let y = 1; y < img.height - 1; y++) {
        note(0, y);
        note(img.width - 1, y);
    }
    let best = null;
    counts.forEach(entry => {
        if (!best || entry.n > best.n) {
            best = entry;
        }
    });
    return best ? [Math.round(best.r / best.n), Math.round(best.g / best.n), Math.round(best.b / best.n)] : [0, 0, 0];
}

/**
 * Makes the page background around a component transparent: a flood fill from the image's border through pixels within `tolerance` (Euclidean RGB
 * distance) of `background`. A fill, not a colour key, so interiors that happen to be near the background colour stay opaque. Returns a new image.
 */
export function RemoveBackground(img, background = BorderColour(img), tolerance = 14) {
    const out = { width: img.width, height: img.height, data: new Uint8Array(img.data) };
    const near = i => {
        const dr = out.data[i * 4] - background[0], dg = out.data[i * 4 + 1] - background[1], db = out.data[i * 4 + 2] - background[2];
        return dr * dr + dg * dg + db * db <= tolerance * tolerance;
    };
    const seen = new Uint8Array(img.width * img.height);
    const stack = [];
    const push = (x, y) => {
        const i = y * img.width + x;
        if (!seen[i] && near(i)) {
            seen[i] = 1;
            stack.push(i);
        }
    };
    for (let x = 0; x < img.width; x++) {
        push(x, 0);
        push(x, img.height - 1);
    }
    for (let y = 0; y < img.height; y++) {
        push(0, y);
        push(img.width - 1, y);
    }
    while (stack.length) {
        const i = stack.pop();
        out.data[i * 4 + 3] = 0;
        const x = i % img.width, y = (i - x) / img.width;
        if (x > 0) push(x - 1, y);
        if (x < img.width - 1) push(x + 1, y);
        if (y > 0) push(x, y - 1);
        if (y < img.height - 1) push(x, y + 1);
    }
    return out;
}

/**
 * Shrinks by a (possibly fractional) `factor` by area averaging: each result pixel is the coverage-weighted mean of the source pixels it spans,
 * premultiplied by alpha so transparent pixels don't bleed their colour in. The result is round(size / factor), at least 1x1.
 */
export function BoxDownsample(img, factor) {
    const [w, h] = ShrunkSize(img, factor);
    const out = CreateImage(w, h);
    const fx = img.width / w, fy = img.height / h;
    for (let y = 0; y < h; y++) {
        const sy0 = y * fy, sy1 = (y + 1) * fy;
        for (let x = 0; x < w; x++) {
            const sx0 = x * fx, sx1 = (x + 1) * fx;
            let r = 0, g = 0, b = 0, a = 0, weight = 0;
            for (let sy = Math.floor(sy0); sy < Math.ceil(sy1) && sy < img.height; sy++) {
                const wy = Math.min(sy + 1, sy1) - Math.max(sy, sy0);
                for (let sx = Math.floor(sx0); sx < Math.ceil(sx1) && sx < img.width; sx++) {
                    const wx = Math.min(sx + 1, sx1) - Math.max(sx, sx0);
                    const o = (sy * img.width + sx) * 4;
                    const wgt = wx * wy, alpha = img.data[o + 3] / 255;
                    r += img.data[o] * alpha * wgt;
                    g += img.data[o + 1] * alpha * wgt;
                    b += img.data[o + 2] * alpha * wgt;
                    a += alpha * wgt;
                    weight += wgt;
                }
            }
            const o = (y * w + x) * 4;
            if (a > 0) {
                out.data[o] = Math.round(r / a);
                out.data[o + 1] = Math.round(g / a);
                out.data[o + 2] = Math.round(b / a);
            }
            out.data[o + 3] = weight > 0 ? Math.round((a / weight) * 255) : 0;
        }
    }
    return out;
}

/** The result size of shrinking by `factor`: round(size / factor), at least 1x1. */
function ShrunkSize(img, factor) {
    return [Math.max(1, Math.round(img.width / factor)), Math.max(1, Math.round(img.height / factor))];
}

/** Shrinks by taking the source pixel at the middle of each block: crisp and flat-coloured, but a thin line can fall between samples and vanish. */
export function DownsampleNearest(img, factor) {
    const [w, h] = ShrunkSize(img, factor);
    const out = CreateImage(w, h);
    for (let y = 0; y < h; y++) {
        const sy = Math.min(img.height - 1, Math.floor((y + 0.5) * (img.height / h)));
        for (let x = 0; x < w; x++) {
            const sx = Math.min(img.width - 1, Math.floor((x + 0.5) * (img.width / w)));
            const from = (sy * img.width + sx) * 4, to = (y * w + x) * 4;
            out.data.set(img.data.subarray(from, from + 4), to);
        }
    }
    return out;
}

/**
 * Shrinks by taking, for each block, the colour most of it is - a mode filter: colours are bucketed (`levels` per channel) so noise and soft shading
 * count as one colour, the biggest bucket wins (by coverage), and the result is that bucket's real average, not a blend of neighbours. Edges stay crisp
 * and fills stay flat, which is what pixel art wants; a block is opaque when at least half of it is. Transparent pixels never vote for a colour.
 */
export function DownsampleMode(img, factor, levels = 12) {
    const [w, h] = ShrunkSize(img, factor);
    const out = CreateImage(w, h);
    const fx = img.width / w, fy = img.height / h;
    const step = 256 / levels;
    for (let y = 0; y < h; y++) {
        const sy0 = y * fy, sy1 = (y + 1) * fy;
        for (let x = 0; x < w; x++) {
            const sx0 = x * fx, sx1 = (x + 1) * fx;
            const buckets = new Map();
            let opaque = 0, total = 0;
            for (let sy = Math.floor(sy0); sy < Math.ceil(sy1) && sy < img.height; sy++) {
                const wy = Math.min(sy + 1, sy1) - Math.max(sy, sy0);
                for (let sx = Math.floor(sx0); sx < Math.ceil(sx1) && sx < img.width; sx++) {
                    const wgt = (Math.min(sx + 1, sx1) - Math.max(sx, sx0)) * wy;
                    const o = (sy * img.width + sx) * 4;
                    total += wgt;
                    if (img.data[o + 3] < 128) continue;
                    opaque += wgt;
                    const key = Math.floor(img.data[o] / step) * levels * levels + Math.floor(img.data[o + 1] / step) * levels + Math.floor(img.data[o + 2] / step);
                    const bucket = buckets.get(key) || { weight: 0, r: 0, g: 0, b: 0 };
                    bucket.weight += wgt;
                    bucket.r += img.data[o] * wgt;
                    bucket.g += img.data[o + 1] * wgt;
                    bucket.b += img.data[o + 2] * wgt;
                    buckets.set(key, bucket);
                }
            }
            if (opaque * 2 < total || !buckets.size) continue;
            let best = null;
            buckets.forEach(bucket => {
                if (!best || bucket.weight > best.weight) best = bucket;
            });
            const o = (y * w + x) * 4;
            out.data[o] = Math.round(best.r / best.weight);
            out.data[o + 1] = Math.round(best.g / best.weight);
            out.data[o + 2] = Math.round(best.b / best.weight);
            out.data[o + 3] = 255;
        }
    }
    return out;
}

/** Whole-number enlargement with no smoothing: the way the game's NEAREST scaling shows pixel art. */
export function UpscaleNearest(img, scale) {
    const out = CreateImage(img.width * scale, img.height * scale);
    for (let y = 0; y < out.height; y++) {
        const sy = Math.floor(y / scale);
        for (let x = 0; x < out.width; x++) {
            const from = (sy * img.width + Math.floor(x / scale)) * 4, to = (y * out.width + x) * 4;
            out.data[to] = img.data[from];
            out.data[to + 1] = img.data[from + 1];
            out.data[to + 2] = img.data[from + 2];
            out.data[to + 3] = img.data[from + 3];
        }
    }
    return out;
}

/** Alpha-blends `src` onto `dst` with its top-left at (x, y), clipped to `dst`, in place. `opacity` scales src's alpha. */
export function Composite(dst, src, x, y, opacity = 1) {
    for (let sy = 0; sy < src.height; sy++) {
        const dy = y + sy;
        if (dy < 0 || dy >= dst.height) continue;
        for (let sx = 0; sx < src.width; sx++) {
            const dx = x + sx;
            if (dx < 0 || dx >= dst.width) continue;
            const s = (sy * src.width + sx) * 4, d = (dy * dst.width + dx) * 4;
            const sa = (src.data[s + 3] / 255) * opacity;
            if (sa <= 0) continue;
            const da = dst.data[d + 3] / 255;
            const oa = sa + da * (1 - sa);
            for (let c = 0; c < 3; c++) {
                dst.data[d + c] = Math.round((src.data[s + c] * sa + dst.data[d + c] * da * (1 - sa)) / oa);
            }
            dst.data[d + 3] = Math.round(oa * 255);
        }
    }
}

/** Multiplies the colour of every pixel by `factor` (darkens a backdrop so the UI on it reads), in place. */
export function Dim(img, factor) {
    for (let i = 0; i < img.data.length; i += 4) {
        img.data[i] = Math.round(img.data[i] * factor);
        img.data[i + 1] = Math.round(img.data[i + 1] * factor);
        img.data[i + 2] = Math.round(img.data[i + 2] * factor);
    }
}

/**
 * Reduces the picture to at most `colours` colours (median cut over the opaque pixels), and makes alpha binary (opaque from 50%): what indexed pixel art
 * is. Returns { image, palette } with palette as [r, g, b] triples.
 */
export function Quantise(img, colours) {
    const pixels = [];
    for (let i = 0; i < img.width * img.height; i++) {
        if (img.data[i * 4 + 3] >= 128) {
            pixels.push(i);
        }
    }
    const channel = (i, c) => img.data[i * 4 + c];
    let boxes = [pixels];
    while (boxes.length < colours) {
        // Split the box with the widest colour range at the median of that channel.
        let pick = -1, pickRange = 0, pickChannel = 0;
        boxes.forEach((box, index) => {
            if (box.length < 2) return;
            for (let c = 0; c < 3; c++) {
                let lo = 255, hi = 0;
                for (const i of box) {
                    const v = channel(i, c);
                    if (v < lo) lo = v;
                    if (v > hi) hi = v;
                }
                if (hi - lo > pickRange) {
                    pickRange = hi - lo;
                    pick = index;
                    pickChannel = c;
                }
            }
        });
        if (pick < 0) break;
        const box = boxes[pick].slice().sort((a, b) => channel(a, pickChannel) - channel(b, pickChannel));
        const mid = box.length >> 1;
        boxes.splice(pick, 1, box.slice(0, mid), box.slice(mid));
    }
    const palette = boxes.filter(box => box.length).map(box => {
        let r = 0, g = 0, b = 0;
        for (const i of box) {
            r += channel(i, 0);
            g += channel(i, 1);
            b += channel(i, 2);
        }
        return [Math.round(r / box.length), Math.round(g / box.length), Math.round(b / box.length)];
    });
    const out = CreateImage(img.width, img.height);
    const cache = new Map();
    for (const i of pixels) {
        const key = (channel(i, 0) << 16) | (channel(i, 1) << 8) | channel(i, 2);
        let colour = cache.get(key);
        if (!colour) {
            let best = Infinity;
            for (const p of palette) {
                const d = (p[0] - channel(i, 0)) ** 2 + (p[1] - channel(i, 1)) ** 2 + (p[2] - channel(i, 2)) ** 2;
                if (d < best) {
                    best = d;
                    colour = p;
                }
            }
            cache.set(key, colour);
        }
        out.data[i * 4] = colour[0];
        out.data[i * 4 + 1] = colour[1];
        out.data[i * 4 + 2] = colour[2];
        out.data[i * 4 + 3] = 255;
    }
    return { image: out, palette };
}

/** The tightest box around the pixels that aren't fully transparent: { image, x, y } with (x, y) where the box sits in `img`. A fully transparent image comes back 1x1. */
export function TrimToOpaque(img) {
    let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1;
    for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
            if (img.data[(y * img.width + x) * 4 + 3] > 0) {
                if (x < x0) x0 = x;
                if (x > x1) x1 = x;
                if (y < y0) y0 = y;
                if (y > y1) y1 = y;
            }
        }
    }
    if (x1 < 0) {
        return { image: CreateImage(1, 1), x: 0, y: 0 };
    }
    return { image: Crop(img, x0, y0, x1 - x0 + 1, y1 - y0 + 1), x: x0, y: y0 };
}

/** One shared palette (at most `colours` [r, g, b] triples) for several images: median cut over all their opaque pixels together, so every piece of a kit uses the same colours. */
export function BuildPalette(images, colours) {
    let count = 0;
    images.forEach(img => {
        for (let i = 0; i < img.width * img.height; i++) if (img.data[i * 4 + 3] >= 128) count++;
    });
    const strip = CreateImage(Math.max(1, count), 1);
    let at = 0;
    images.forEach(img => {
        for (let i = 0; i < img.width * img.height; i++) {
            if (img.data[i * 4 + 3] >= 128) {
                strip.data.set(img.data.subarray(i * 4, i * 4 + 3), at * 4);
                strip.data[at * 4 + 3] = 255;
                at++;
            }
        }
    });
    return Quantise(strip, colours).palette;
}

/** A copy of the image with every opaque pixel moved to the nearest palette colour (and alpha made binary). */
export function ApplyPalette(img, palette) {
    const out = CreateImage(img.width, img.height);
    const cache = new Map();
    for (let i = 0; i < img.width * img.height; i++) {
        if (img.data[i * 4 + 3] < 128) continue;
        const r = img.data[i * 4], g = img.data[i * 4 + 1], b = img.data[i * 4 + 2];
        const key = (r << 16) | (g << 8) | b;
        let colour = cache.get(key);
        if (!colour) {
            let best = Infinity;
            for (const p of palette) {
                const d = (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2;
                if (d < best) {
                    best = d;
                    colour = p;
                }
            }
            cache.set(key, colour);
        }
        out.data[i * 4] = colour[0];
        out.data[i * 4 + 1] = colour[1];
        out.data[i * 4 + 2] = colour[2];
        out.data[i * 4 + 3] = 255;
    }
    return out;
}

const DIGITS = {
    0: "111101101101111", 1: "010110010010111", 2: "111001111100111", 3: "111001111001111", 4: "101101111001001",
    5: "111100111001111", 6: "111100111101111", 7: "111001001001001", 8: "111101111101111", 9: "111101111001111"
};

/**
 * A sheet of images for looking at: each enlarged `scale` times on a checkerboard, numbered from 0 in a 3x5 pixel font, with a grid line every `grid` art pixels
 * (stronger every fifth) so insets and sizes can be read off. Returns the sheet image.
 */
export function ContactSheet(images, { scale = 6, cols = 3, grid = 4 } = {}) {
    const margin = 10, label = 14;
    const cellW = Math.max(...images.map(i => i.width)) * scale + margin * 2;
    const cellH = Math.max(...images.map(i => i.height)) * scale + margin * 2 + label;
    const rows = Math.ceil(images.length / cols);
    const sheet = CreateImage(cellW * cols, cellH * rows);
    const put = (x, y, r, g, b) => {
        if (x < 0 || y < 0 || x >= sheet.width || y >= sheet.height) return;
        sheet.data.set([r, g, b, 255], (y * sheet.width + x) * 4);
    };
    for (let y = 0; y < sheet.height; y++) {
        for (let x = 0; x < sheet.width; x++) {
            const c = ((x >> 3) + (y >> 3)) & 1 ? 50 : 62;
            put(x, y, c, c, c + 8);
        }
    }
    images.forEach((img, i) => {
        const cx = (i % cols) * cellW + margin, cy = Math.floor(i / cols) * cellH + margin + label;
        String(i).split("").forEach((d, n) => {
            for (let k = 0; k < 15; k++) {
                if (DIGITS[d][k] === "1") {
                    for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) put(cx + n * 8 + (k % 3) * 2 + sx, cy - label + 2 + Math.floor(k / 3) * 2 + sy, 255, 220, 80);
                }
            }
        });
        const draw = UpscaleNearest(img, scale);
        Composite(sheet, draw, cx, cy);
        for (let g = 0; g <= img.width; g += grid) {
            const strong = (g / grid) % 5 === 0;
            for (let y = 0; y < img.height * scale; y++) put(cx + g * scale, cy + y, strong ? 255 : 120, strong ? 220 : 120, strong ? 80 : 160);
        }
        for (let g = 0; g <= img.height; g += grid) {
            const strong = (g / grid) % 5 === 0;
            for (let x = 0; x < img.width * scale; x++) put(cx + x, cy + g * scale, strong ? 255 : 120, strong ? 220 : 120, strong ? 80 : 160);
        }
    });
    return sheet;
}

/** A copy with only the biggest 8-connected group of non-transparent pixels kept (the component itself, not a neighbour's edge caught in the crop). */
export function KeepLargestComponent(img) {
    const label = new Int32Array(img.width * img.height).fill(-1);
    const sizes = [];
    for (let start = 0; start < label.length; start++) {
        if (label[start] >= 0 || img.data[start * 4 + 3] === 0) continue;
        const id = sizes.length;
        let size = 0;
        const stack = [start];
        label[start] = id;
        while (stack.length) {
            const i = stack.pop();
            size++;
            const x = i % img.width, y = (i - x) / img.width;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const nx = x + dx, ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= img.width || ny >= img.height) continue;
                    const n = ny * img.width + nx;
                    if (label[n] < 0 && img.data[n * 4 + 3] !== 0) {
                        label[n] = id;
                        stack.push(n);
                    }
                }
            }
        }
        sizes.push(size);
    }
    let keep = 0;
    sizes.forEach((size, id) => {
        if (size > sizes[keep]) keep = id;
    });
    const out = CreateImage(img.width, img.height);
    for (let i = 0; i < label.length; i++) {
        if (label[i] === keep && sizes.length) out.data.set(img.data.subarray(i * 4, i * 4 + 4), i * 4);
    }
    return out;
}

/** The colour most opaque pixels in the box are, as [r, g, b] (exact match, so flat fills win over shading), or null if the box has none. */
export function DominantColour(img, x, y, w, h) {
    const counts = new Map();
    let best = null;
    for (let py = Math.max(0, y); py < Math.min(img.height, y + h); py++) {
        for (let px = Math.max(0, x); px < Math.min(img.width, x + w); px++) {
            const o = (py * img.width + px) * 4;
            if (img.data[o + 3] < 128) continue;
            const key = (img.data[o] << 16) | (img.data[o + 1] << 8) | img.data[o + 2];
            const n = (counts.get(key) || 0) + 1;
            counts.set(key, n);
            if (!best || n > best.n) best = { n, key };
        }
    }
    return best ? [best.key >> 16, (best.key >> 8) & 255, best.key & 255] : null;
}

/**
 * The smallest picture that nine-slices to the same frame: the four corners as they are, each edge reduced to a `band`-pixel strip taken from one
 * line of the original (so a label, a title pill or an ornament in the middle of an edge doesn't come along), and the middle one flat colour - the
 * most common colour inside the border. `insets` are { left, top, right, bottom } in pixels; `samples` can say where along each edge to take its strip
 * from ({ top: x, bottom: x, left: y, right: y }, counted from the image's own edge; by default one pixel inside the corner). `centreBox` ([x, y, w, h]) is
 * where to take the middle colour from instead of the whole inside - a bar's empty end, when the rest of its inside is filled.
 */
export function BuildNineSlice(art, insets, band = 2, samples = {}, centreBox = null) {
    const { left: l, top: t, right: r, bottom: b } = insets;
    if (l + r >= art.width || t + b >= art.height) {
        throw new Error("The insets (" + [l, t, r, b].join(", ") + ") leave nothing of a " + art.width + "x" + art.height + " picture.");
    }
    const out = CreateImage(l + band + r, t + band + b);
    const blit = (src, sx, sy, sw, sh, dx, dy) => Composite(out, Crop(src, sx, sy, sw, sh), dx, dy);
    const w = art.width, h = art.height;
    blit(art, 0, 0, l, t, 0, 0);
    blit(art, w - r, 0, r, t, l + band, 0);
    blit(art, 0, h - b, l, b, 0, t + band);
    blit(art, w - r, h - b, r, b, l + band, t + band);
    const along = (name, from, to, fallback) => Math.min(to - 1, Math.max(from, samples[name] === undefined ? fallback : samples[name]));
    const sx = (name) => along(name, l, w - r, l + 1), sy = (name) => along(name, t, h - b, t + 1);
    for (let i = 0; i < band; i++) {
        blit(art, sx("top"), 0, 1, t, l + i, 0);
        blit(art, sx("bottom"), h - b, 1, b, l + i, t + band);
        blit(art, 0, sy("left"), l, 1, 0, t + i);
        blit(art, w - r, sy("right"), r, 1, l + band, t + i);
    }
    const centre = (centreBox ? DominantColour(art, ...centreBox) : DominantColour(art, l, t, w - l - r, h - t - b)) || [0, 0, 0];
    for (let y = 0; y < band; y++) for (let x = 0; x < band; x++) out.data.set([centre[0], centre[1], centre[2], 255], ((t + y) * out.width + l + x) * 4);
    return out;
}

/**
 * The shortest repeat length (in columns, up to `maxPeriod`) of the picture between columns `from` and `to`: the p for which each column looks like the one p
 * further on, to within a little slack for noise - how long a tile must be to repeat a chain, a dotted line, a run of studs. 1 for a plain line.
 */
export function TilePeriod(img, from, to, maxPeriod = 16) {
    const error = p => {
        let sum = 0, n = 0;
        for (let x = from; x + p < to; x++) {
            for (let y = 0; y < img.height; y++) {
                const a = (y * img.width + x) * 4, b = (y * img.width + x + p) * 4;
                sum += Math.abs(img.data[a] - img.data[b]) + Math.abs(img.data[a + 1] - img.data[b + 1]) + Math.abs(img.data[a + 2] - img.data[b + 2]) + Math.abs(img.data[a + 3] - img.data[b + 3]);
                n++;
            }
        }
        return n ? sum / n : Infinity;
    };
    let best = 1, bestError = error(1);
    for (let p = 2; p <= maxPeriod; p++) {
        const e = error(p);
        // A longer period has to be clearly better: multiples of the true period score as well as it does.
        if (e < bestError * 0.7) {
            best = p;
            bestError = e;
        }
    }
    return best;
}

/**
 * A recoloured copy (alpha untouched): each opaque pixel's colour is first desaturated towards its grey by `1 - saturation`, then multiplied by `brightness`, then
 * mixed `amount` of the way towards `mix` ([r, g, b]). How a hover, pressed or disabled look is made from a normal one: brighter, darker, greyed.
 */
export function Tint(img, { brightness = 1, saturation = 1, mix = [0, 0, 0], amount = 0 } = {}) {
    const out = { width: img.width, height: img.height, data: new Uint8Array(img.data) };
    for (let i = 0; i < out.data.length; i += 4) {
        if (out.data[i + 3] === 0) continue;
        const grey = 0.299 * out.data[i] + 0.587 * out.data[i + 1] + 0.114 * out.data[i + 2];
        for (let c = 0; c < 3; c++) {
            let v = grey + (out.data[i + c] - grey) * saturation;
            v *= brightness;
            v += (mix[c] - v) * amount;
            out.data[i + c] = Math.max(0, Math.min(255, Math.round(v)));
        }
    }
    return out;
}

/** The image turned a quarter turn: clockwise by default. */
export function Rotate90(img, clockwise = true) {
    const out = CreateImage(img.height, img.width);
    for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
            const tx = clockwise ? img.height - 1 - y : y;
            const ty = clockwise ? x : img.width - 1 - x;
            out.data.set(img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4), (ty * out.width + tx) * 4);
        }
    }
    return out;
}

export function FlipVertical(img) {
    const out = CreateImage(img.width, img.height);
    for (let y = 0; y < img.height; y++) {
        out.data.set(img.data.subarray(y * img.width * 4, (y + 1) * img.width * 4), (img.height - 1 - y) * img.width * 4);
    }
    return out;
}

export function FlipHorizontal(img) {
    const out = CreateImage(img.width, img.height);
    for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
            out.data.set(img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4), (y * img.width + (img.width - 1 - x)) * 4);
        }
    }
    return out;
}

/** A new image from two: the first `split` columns of `left`, the rest of `right` (same size). */
export function JoinColumns(left, right, split) {
    const out = CreateImage(left.width, left.height);
    for (let y = 0; y < left.height; y++) {
        for (let x = 0; x < left.width; x++) {
            const source = x < split ? left : right;
            out.data.set(source.data.subarray((y * source.width + x) * 4, (y * source.width + x) * 4 + 4), (y * out.width + x) * 4);
        }
    }
    return out;
}
