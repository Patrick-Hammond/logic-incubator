import { createRequire } from "module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { AtlasJson, PackAtlas } = require("./atlas.js");
const { Blit, Crop, Extrude, NewImage, TrimBounds } = require("./image.js");
const { ReadPng, WritePng } = require("./png.js");
const { ParseFnt, RewritePages } = require("./fnt.js");

type Img = { width: number; height: number; data: Buffer };

/** A w*h image of one RGBA colour. */
function solid(w: number, h: number, rgba: [number, number, number, number]): Img {
    const img = NewImage(w, h);
    for (let p = 0; p < w * h; p++) {
        img.data.set(rgba, p * 4);
    }
    return img;
}
const pixel = (img: Img, x: number, y: number) => Array.from(img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4));

/** A w*h transparent image with an opaque box at (bx, by, bw, bh). */
function boxed(w: number, h: number, bx: number, by: number, bw: number, bh: number, rgba: [number, number, number, number] = [255, 0, 0, 255]): Img {
    const img = NewImage(w, h);
    for (let y = by; y < by + bh; y++) {
        for (let x = bx; x < bx + bw; x++) {
            img.data.set(rgba, (y * w + x) * 4);
        }
    }
    return img;
}

describe("image", () => {
    it("finds the bounding box of the pixels above the alpha threshold", () => {
        expect(TrimBounds(boxed(8, 8, 2, 3, 4, 2), 0)).toEqual({ x: 2, y: 3, w: 4, h: 2 });
        expect(TrimBounds(solid(3, 3, [1, 2, 3, 255]), 0)).toEqual({ x: 0, y: 0, w: 3, h: 3 });
        expect(TrimBounds(boxed(1, 1, 0, 0, 1, 1, [0, 0, 0, 5]), 0)).toEqual({ x: 0, y: 0, w: 1, h: 1 });
        expect(TrimBounds(boxed(1, 1, 0, 0, 1, 1, [0, 0, 0, 5]), 10)).toBeNull();
        expect(TrimBounds(NewImage(4, 4), 0)).toBeNull();
    });

    it("crops and blits whole pixels", () => {
        const src = boxed(4, 4, 1, 1, 2, 2, [9, 8, 7, 255]);
        const crop = Crop(src, { x: 1, y: 1, w: 2, h: 2 });
        expect(crop.width).toBe(2);
        expect(pixel(crop, 0, 0)).toEqual([9, 8, 7, 255]);
        const dst = NewImage(5, 5);
        Blit(dst, crop, 3, 3);
        expect(pixel(dst, 3, 3)).toEqual([9, 8, 7, 255]);
        expect(pixel(dst, 4, 4)).toEqual([9, 8, 7, 255]);
        expect(pixel(dst, 2, 2)).toEqual([0, 0, 0, 0]);
    });

    it("extrudes an edge pixel into the gutter, corners from the corner pixel", () => {
        const img = NewImage(6, 6);
        const tile = NewImage(2, 2);
        tile.data.set([1, 0, 0, 255], 0);
        tile.data.set([2, 0, 0, 255], 4);
        tile.data.set([3, 0, 0, 255], 8);
        tile.data.set([4, 0, 0, 255], 12);
        Blit(img, tile, 2, 2);
        Extrude(img, { x: 2, y: 2, w: 2, h: 2 }, 1);
        expect(pixel(img, 1, 1)).toEqual([1, 0, 0, 255]);
        expect(pixel(img, 4, 1)).toEqual([2, 0, 0, 255]);
        expect(pixel(img, 1, 4)).toEqual([3, 0, 0, 255]);
        expect(pixel(img, 4, 4)).toEqual([4, 0, 0, 255]);
        expect(pixel(img, 1, 2)).toEqual([1, 0, 0, 255]);
        expect(pixel(img, 0, 0)).toEqual([0, 0, 0, 0]);
    });
});

describe("png", () => {
    it("round-trips RGBA pixels", () => {
        const img = boxed(5, 3, 1, 1, 2, 1, [10, 20, 30, 128]);
        const back = ReadPng(WritePng(img));
        expect(back.width).toBe(5);
        expect(back.height).toBe(3);
        expect(Buffer.from(back.data).equals(Buffer.from(img.data))).toBe(true);
    });
});

describe("PackAtlas", () => {
    const frames = () => {
        const out = [];
        for (let i = 0; i < 12; i++) {
            out.push({ key: `g.tile_${i}`, image: boxed(16, 16, i % 3, 1, 10 + (i % 4), 12, [i * 10, 0, 0, 255]) });
        }
        out.push({ key: "g.wide", image: solid(48, 20, [0, 255, 0, 255]) });
        return out;
    };

    it("is the same whatever order the frames arrive in", () => {
        const a = PackAtlas(frames(), {});
        const b = PackAtlas(frames().reverse(), {});
        expect(JSON.stringify(a.pages.map((p: { frames: unknown }) => p.frames))).toBe(JSON.stringify(b.pages.map((p: { frames: unknown }) => p.frames)));
        expect(Buffer.from(a.pages[0].image.data).equals(Buffer.from(b.pages[0].image.data))).toBe(true);
    });

    it("places every frame inside its page, without overlaps, with its pixels intact", () => {
        const input = frames();
        const { pages, diagnostics } = PackAtlas(input, { extrude: 1 });
        expect(diagnostics).toEqual([]);
        const placed = pages.flatMap((p: { frames: object[] }) => p.frames) as { key: string; frame: { x: number; y: number; w: number; h: number }; spriteSourceSize: { x: number; y: number } }[];
        expect(placed).toHaveLength(input.length);
        pages.forEach((page: { width: number; height: number; frames: typeof placed; image: Img }) => {
            page.frames.forEach(f => {
                expect(f.frame.x + f.frame.w).toBeLessThanOrEqual(page.width);
                expect(f.frame.y + f.frame.h).toBeLessThanOrEqual(page.height);
                page.frames.filter(o => o !== f).forEach(o => {
                    // rects include the 1px extrude gutter on every side
                    const apart = f.frame.x + f.frame.w + 1 <= o.frame.x - 1 || o.frame.x + o.frame.w + 1 <= f.frame.x - 1
                        || f.frame.y + f.frame.h + 1 <= o.frame.y - 1 || o.frame.y + o.frame.h + 1 <= f.frame.y - 1;
                    expect(apart, `${f.key} overlaps ${o.key}`).toBe(true);
                });
                // the page holds the source frame's (trimmed) pixels at the frame rect
                const src = input.find(i => i.key === f.key)!.image;
                expect(pixel(page.image, f.frame.x, f.frame.y)).toEqual(pixel(src, f.spriteSourceSize.x, f.spriteSourceSize.y));
            });
        });
    });

    it("trims transparent borders and records where the pixels came from", () => {
        const { pages } = PackAtlas([{ key: "g.dot", image: boxed(16, 16, 5, 6, 3, 2) }], {});
        const f = pages[0].frames[0];
        expect(f.trimmed).toBe(true);
        expect(f.frame.w).toBe(3);
        expect(f.frame.h).toBe(2);
        expect(f.spriteSourceSize).toEqual({ x: 5, y: 6, w: 3, h: 2 });
        expect(f.sourceSize).toEqual({ w: 16, h: 16 });
    });

    it("keeps an untrimmed frame whole when trim is off or there's nothing to trim", () => {
        const off = PackAtlas([{ key: "g.dot", image: boxed(16, 16, 5, 6, 3, 2) }], { trim: false });
        expect(off.pages[0].frames[0].trimmed).toBe(false);
        expect(off.pages[0].frames[0].frame.w).toBe(16);
        const full = PackAtlas([{ key: "g.full", image: solid(8, 8, [1, 1, 1, 255]) }], {});
        expect(full.pages[0].frames[0].trimmed).toBe(false);
    });

    it("packs a fully transparent frame as 1x1 with a warning", () => {
        const { pages, diagnostics } = PackAtlas([{ key: "g.empty", image: NewImage(8, 8) }], {});
        expect(pages[0].frames[0].frame.w).toBe(1);
        expect(diagnostics[0].level).toBe("warning");
    });

    it("spills onto more pages when one isn't enough, and rejects a frame that can't fit any", () => {
        const many = Array.from({ length: 9 }, (_, i) => ({ key: `g.t${i}`, image: solid(20, 20, [1, 1, 1, 255]) }));
        const multi = PackAtlas(many, { maxSize: 48, extrude: 0 });
        expect(multi.pages.length).toBeGreaterThan(1);
        expect(multi.pages.flatMap((p: { frames: object[] }) => p.frames)).toHaveLength(9);
        const big = PackAtlas([{ key: "g.huge", image: solid(100, 10, [1, 1, 1, 255]) }], { maxSize: 64 });
        expect(big.pages).toEqual([]);
        expect(big.diagnostics[0].level).toBe("error");
    });

    it("rounds a page up to a power of two when asked", () => {
        const { pages } = PackAtlas([{ key: "g.a", image: solid(20, 12, [1, 1, 1, 255]) }], { pot: true, extrude: 0 });
        expect(pages[0].width).toBe(32);
        expect(pages[0].height).toBe(16);
    });

    it("writes pixi 5's spritesheet JSON", () => {
        const { pages } = PackAtlas([{ key: "g.dot", image: boxed(16, 16, 5, 6, 3, 2) }], {});
        const json = AtlasJson(pages[0], "dungeon_0.png");
        expect(json.meta).toEqual({ app: "logic-incubator-assets", image: "dungeon_0.png", format: "RGBA8888", size: { w: pages[0].width, h: pages[0].height }, scale: "1" });
        expect(json.frames["g.dot"]).toEqual({
            frame: pages[0].frames[0].frame,
            rotated: false,
            trimmed: true,
            spriteSourceSize: { x: 5, y: 6, w: 3, h: 2 },
            sourceSize: { w: 16, h: 16 }
        });
    });
});

describe("fnt", () => {
    const text = `<font>\n<info face="numbers-export" size="80" />\n<pages>\n<page id="0" file="numbers-export.png" />\n<page id="1" file="b.png" />\n</pages></font>`;

    it("reads the face and the pages", () => {
        expect(ParseFnt(text)).toEqual({ face: "numbers-export", pages: ["numbers-export.png", "b.png"] });
        expect(ParseFnt("<font/>")).toEqual({ face: undefined, pages: [] });
    });

    it("renames pages and leaves the rest of the file alone", () => {
        const out = RewritePages(text, { "numbers-export.png": "x_0.png" });
        expect(out).toContain('<page id="0" file="x_0.png" />');
        expect(out).toContain('<page id="1" file="b.png" />');
        expect(out).toContain('face="numbers-export"');
    });
});
