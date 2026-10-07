import { describe, expect, it } from "vitest";
import { BorderColour, BoxDownsample, BuildNineSlice, Composite, CreateImage, Crop, Dim, DownsampleMode, DownsampleNearest, Quantise, RemoveBackground, RenderNineSlice, TilePeriod, UpscaleNearest } from "./image.mjs";

const px = (img, x, y) => Array.from(img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4));
const set = (img, x, y, rgba) => img.data.set(rgba, (y * img.width + x) * 4);
const solid = (w, h, rgba) => CreateImage(w, h, rgba);

describe("Crop", () => {
    it("copies the box and clips what's outside the image", () => {
        const img = solid(4, 4, [0, 0, 0, 255]);
        set(img, 2, 1, [9, 8, 7, 255]);
        const crop = Crop(img, 2, 1, 5, 5);
        expect([crop.width, crop.height]).toEqual([2, 3]);
        expect(px(crop, 0, 0)).toEqual([9, 8, 7, 255]);
    });
});

describe("RemoveBackground", () => {
    it("clears the background around a shape but keeps the same colour inside a closed outline", () => {
        const bg = [10, 12, 23, 255];
        const img = solid(7, 7, bg);
        // A closed 5x5 ring of light pixels with a background-coloured hole in the middle.
        for (let i = 1; i <= 5; i++) {
            [[i, 1], [i, 5], [1, i], [5, i]].forEach(([x, y]) => set(img, x, y, [200, 200, 255, 255]));
        }
        const out = RemoveBackground(img, [10, 12, 23], 6);
        expect(px(out, 0, 0)[3]).toBe(0);
        expect(px(out, 6, 6)[3]).toBe(0);
        expect(px(out, 1, 1)).toEqual([200, 200, 255, 255]);
        expect(px(out, 3, 3)).toEqual(bg);
    });

    it("tolerates a background that drifts by a level or two", () => {
        const img = solid(3, 3, [10, 12, 23, 255]);
        set(img, 1, 0, [11, 13, 22, 255]);
        const out = RemoveBackground(img, [10, 12, 23], 4);
        expect(px(out, 1, 0)[3]).toBe(0);
    });

    it("leaves the input alone", () => {
        const img = solid(2, 2, [1, 1, 1, 255]);
        RemoveBackground(img, [1, 1, 1], 2);
        expect(px(img, 0, 0)[3]).toBe(255);
    });
});

describe("BorderColour", () => {
    it("is the colour most border pixels are", () => {
        const img = solid(5, 5, [30, 40, 50, 255]);
        set(img, 2, 2, [255, 0, 0, 255]);
        set(img, 0, 0, [1, 2, 3, 255]);
        expect(BorderColour(img)).toEqual([30, 40, 50]);
    });
});

describe("BoxDownsample", () => {
    it("averages whole blocks", () => {
        const img = solid(2, 2, [0, 0, 0, 255]);
        set(img, 0, 0, [100, 200, 40, 255]);
        set(img, 1, 1, [100, 200, 40, 255]);
        expect(px(BoxDownsample(img, 2), 0, 0)).toEqual([50, 100, 20, 255]);
    });

    it("sizes the result by round(size / factor), at least 1x1", () => {
        const img = solid(316, 64, [5, 5, 5, 255]);
        const out = BoxDownsample(img, 4.8);
        expect([out.width, out.height]).toEqual([66, 13]);
        expect(BoxDownsample(solid(3, 3, [1, 1, 1, 255]), 100).width).toBe(1);
    });

    it("handles a fractional factor by coverage", () => {
        // 3 source pixels -> 2 result pixels: each result pixel spans 1.5 source pixels.
        const img = solid(3, 1, [0, 0, 0, 255]);
        set(img, 0, 0, [0, 0, 0, 255]);
        set(img, 1, 0, [120, 120, 120, 255]);
        set(img, 2, 0, [240, 240, 240, 255]);
        const out = BoxDownsample(img, 1.5);
        expect(px(out, 0, 0)[0]).toBe(40); // (0*1 + 120*0.5) / 1.5
        expect(px(out, 1, 0)[0]).toBe(200); // (120*0.5 + 240*1) / 1.5
    });

    it("doesn't let transparent pixels bleed their colour in", () => {
        const img = solid(2, 1, [255, 0, 0, 0]);
        set(img, 0, 0, [0, 0, 255, 255]);
        const out = BoxDownsample(img, 2);
        expect(px(out, 0, 0)).toEqual([0, 0, 255, 128]);
    });
});

describe("UpscaleNearest", () => {
    it("repeats each pixel scale x scale times", () => {
        const img = solid(2, 1, [0, 0, 0, 255]);
        set(img, 1, 0, [9, 9, 9, 255]);
        const out = UpscaleNearest(img, 3);
        expect([out.width, out.height]).toEqual([6, 3]);
        expect(px(out, 2, 2)).toEqual([0, 0, 0, 255]);
        expect(px(out, 3, 0)).toEqual([9, 9, 9, 255]);
    });
});

describe("Composite", () => {
    it("blends by alpha, clips to the destination and scales alpha by opacity", () => {
        const dst = solid(2, 1, [0, 0, 0, 255]);
        const src = solid(2, 1, [200, 100, 0, 255]);
        Composite(dst, src, 1, 0, 0.5);
        expect(px(dst, 0, 0)).toEqual([0, 0, 0, 255]);
        expect(px(dst, 1, 0)).toEqual([100, 50, 0, 255]);
    });
});

describe("Dim", () => {
    it("scales colour but not alpha", () => {
        const img = solid(1, 1, [100, 50, 10, 200]);
        Dim(img, 0.5);
        expect(px(img, 0, 0)).toEqual([50, 25, 5, 200]);
    });
});

describe("Quantise", () => {
    it("keeps at most the asked number of colours, and every pixel is one of them", () => {
        const img = solid(16, 16, [0, 0, 0, 255]);
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) set(img, x, y, [x * 16, y * 16, (x + y) * 8, 255]);
        const { image, palette } = Quantise(img, 8);
        expect(palette.length).toBeLessThanOrEqual(8);
        const seen = new Set();
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) seen.add(px(image, x, y).slice(0, 3).join());
        expect(seen.size).toBeLessThanOrEqual(8);
        seen.forEach(c => expect(palette.some(p => p.join() === c)).toBe(true));
    });

    it("makes alpha binary: transparent stays transparent, mostly-opaque becomes opaque", () => {
        const img = solid(3, 1, [10, 20, 30, 255]);
        set(img, 0, 0, [10, 20, 30, 40]);
        set(img, 1, 0, [10, 20, 30, 130]);
        const { image } = Quantise(img, 4);
        expect([px(image, 0, 0)[3], px(image, 1, 0)[3], px(image, 2, 0)[3]]).toEqual([0, 255, 255]);
    });

    it("returns two colours exactly when there are two", () => {
        const img = solid(4, 1, [255, 0, 0, 255]);
        set(img, 2, 0, [0, 0, 255, 255]);
        set(img, 3, 0, [0, 0, 255, 255]);
        const { palette } = Quantise(img, 16);
        expect(palette.map(p => p.join()).sort()).toEqual(["0,0,255", "255,0,0"]);
    });
});

describe("DownsampleNearest", () => {
    it("takes the pixel at the middle of each block, so colours are never blended", () => {
        const img = solid(4, 1, [0, 0, 0, 255]);
        set(img, 0, 0, [10, 0, 0, 255]);
        set(img, 1, 0, [20, 0, 0, 255]);
        set(img, 2, 0, [30, 0, 0, 255]);
        set(img, 3, 0, [40, 0, 0, 255]);
        const out = DownsampleNearest(img, 2);
        expect([out.width, px(out, 0, 0)[0], px(out, 1, 0)[0]]).toEqual([2, 20, 40]);
    });
});

describe("DownsampleMode", () => {
    it("takes the colour most of the block is - not a blend - and ignores a stray pixel", () => {
        const img = solid(3, 3, [200, 40, 40, 255]);
        set(img, 1, 1, [10, 10, 250, 255]);
        const out = DownsampleMode(img, 3);
        expect(px(out, 0, 0)).toEqual([200, 40, 40, 255]);
    });

    it("counts near colours as one (soft shading and noise), and answers with their average", () => {
        const img = solid(2, 1, [100, 100, 100, 255]);
        set(img, 1, 0, [102, 101, 99, 255]);
        const out = DownsampleMode(img, 2);
        expect(px(out, 0, 0)).toEqual([101, 101, 100, 255]);
    });

    it("is opaque only where at least half the block is, and transparent pixels don't vote", () => {
        const img = solid(4, 1, [0, 0, 0, 0]);
        set(img, 0, 0, [50, 60, 70, 255]);
        set(img, 2, 0, [50, 60, 70, 255]);
        set(img, 3, 0, [50, 60, 70, 255]);
        const out = DownsampleMode(img, 2);
        expect(px(out, 0, 0)[3]).toBe(255); // exactly half
        expect(px(out, 1, 0)).toEqual([50, 60, 70, 255]);
        expect(px(DownsampleMode(solid(2, 2, [9, 9, 9, 0]), 2), 0, 0)[3]).toBe(0);
    });
});

describe("RenderNineSlice", () => {
    it("keeps the corners, repeats the edge strips and fills the middle with the flat colour", () => {
        // A 3x3 source: four distinct corners, a one-pixel strip on each edge, a flat middle.
        const src = solid(3, 3, [50, 50, 50, 255]);
        set(src, 0, 0, [1, 0, 0, 255]);
        set(src, 2, 0, [2, 0, 0, 255]);
        set(src, 0, 2, [3, 0, 0, 255]);
        set(src, 2, 2, [4, 0, 0, 255]);
        set(src, 1, 0, [10, 0, 0, 255]);
        const out = RenderNineSlice(src, { left: 1, top: 1, right: 1, bottom: 1 }, 6, 5);
        expect([out.width, out.height]).toEqual([6, 5]);
        expect(px(out, 0, 0)[0]).toBe(1);
        expect(px(out, 5, 0)[0]).toBe(2);
        expect(px(out, 0, 4)[0]).toBe(3);
        expect(px(out, 5, 4)[0]).toBe(4);
        [1, 2, 3, 4].forEach(x => expect(px(out, x, 0)[0]).toBe(10));
        expect(px(out, 3, 2)).toEqual([50, 50, 50, 255]);
    });

    it("round-trips what BuildNineSlice reduces a frame to, at the frame's own size", () => {
        const art = solid(12, 10, [20, 20, 40, 255]);
        for (let x = 0; x < 12; x++) [0, 9].forEach(y => set(art, x, y, [200, 200, 255, 255]));
        for (let y = 0; y < 10; y++) [0, 11].forEach(x => set(art, x, y, [200, 200, 255, 255]));
        // A label in the middle that must not survive.
        set(art, 6, 5, [255, 255, 255, 255]);
        const insets = { left: 2, top: 2, right: 2, bottom: 2 };
        const full = RenderNineSlice(BuildNineSlice(art, insets), insets, 12, 10);
        expect([full.width, full.height]).toEqual([12, 10]);
        expect(px(full, 6, 5)).toEqual([20, 20, 40, 255]);
        expect(px(full, 0, 0)).toEqual(px(art, 0, 0));
        expect(px(full, 11, 9)).toEqual(px(art, 11, 9));
    });
});

describe("TilePeriod", () => {
    const strip = (width, colourAt) => {
        const img = CreateImage(width, 3);
        for (let x = 0; x < width; x++) for (let y = 0; y < 3; y++) set(img, x, y, colourAt(x, y));
        return img;
    };

    it("is 1 for a plain line", () => {
        expect(TilePeriod(strip(80, () => [40, 40, 90, 255]), 10, 70)).toBe(1);
    });

    it("finds the length a pattern repeats at, however long", () => {
        [4, 8, 16, 30].forEach(period => {
            const links = strip(120, x => (x % period < period / 2 ? [200, 200, 255, 255] : [20, 20, 40, 255]));
            expect(TilePeriod(links, 10, 110, 32)).toBe(period);
        });
    });

    it("takes the shortest repeat, not a multiple of it", () => {
        const links = strip(120, x => (x % 6 < 2 ? [255, 255, 255, 255] : [0, 0, 0, 255]));
        expect(TilePeriod(links, 0, 120, 32)).toBe(6);
    });
});
