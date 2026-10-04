import { createRequire } from "node:module";
import { deflateSync, crc32 } from "node:zlib";
import { describe, expect, it } from "vitest";
import { Rgba } from "./Colour";
import { DecodePng, EncodeIndexedPng, EncodeRgbaPng } from "./Png";

// pngjs is the reference: it's what the asset build reads the same files with.
const { PNG } = createRequire(__filename)("pngjs");

/** Deterministic pseudo-random bytes. */
function Noise(length: number, seed = 1): Uint8Array {
    const out = new Uint8Array(length);
    let s = seed;
    for (let i = 0; i < length; i++) {
        s = (s * 1664525 + 1013904223) >>> 0;
        out[i] = s >>> 24;
    }
    return out;
}

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function Chunk(type: string, data: Uint8Array): Uint8Array {
    const body = new Uint8Array(4 + data.length);
    for (let i = 0; i < 4; i++) body[i] = type.charCodeAt(i);
    body.set(data, 4);
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    out.set(body, 4);
    view.setUint32(8 + data.length, crc32(body));
    return out;
}

/** Applies PNG filter `type` to each row of `rows` (rows of `rowBytes`), the inverse of what the decoder undoes. */
function FilterRows(rows: Uint8Array, rowBytes: number, bpp: number, type: number): Uint8Array {
    const count = rows.length / rowBytes;
    const out = new Uint8Array(count * (rowBytes + 1));
    for (let y = 0; y < count; y++) {
        out[y * (rowBytes + 1)] = type;
        for (let x = 0; x < rowBytes; x++) {
            const cur = rows[y * rowBytes + x];
            const left = x >= bpp ? rows[y * rowBytes + x - bpp] : 0;
            const up = y > 0 ? rows[(y - 1) * rowBytes + x] : 0;
            const upLeft = y > 0 && x >= bpp ? rows[(y - 1) * rowBytes + x - bpp] : 0;
            let predicted = 0;
            if (type === 1) predicted = left;
            else if (type === 2) predicted = up;
            else if (type === 3) predicted = (left + up) >> 1;
            else if (type === 4) {
                const p = left + up - upLeft;
                const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upLeft);
                predicted = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
            }
            out[y * (rowBytes + 1) + 1 + x] = (cur - predicted) & 255;
        }
    }
    return out;
}

type Spec = { width: number; height: number; bitDepth: number; colourType: number; scanlines: Uint8Array; plte?: Uint8Array; trns?: Uint8Array; interlace?: number };

/** A PNG from already-filtered scanline bytes - the test's own writer, independent of the editor's. */
function BuildPng(spec: Spec): Uint8Array {
    const header = new Uint8Array(13);
    const view = new DataView(header.buffer);
    view.setUint32(0, spec.width);
    view.setUint32(4, spec.height);
    header[8] = spec.bitDepth;
    header[9] = spec.colourType;
    header[12] = spec.interlace || 0;
    const parts = [new Uint8Array(SIGNATURE), Chunk("IHDR", header)];
    if (spec.plte) parts.push(Chunk("PLTE", spec.plte));
    if (spec.trns) parts.push(Chunk("tRNS", spec.trns));
    parts.push(Chunk("IDAT", new Uint8Array(deflateSync(spec.scanlines))), Chunk("IEND", new Uint8Array(0)));
    const total = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let at = 0;
    parts.forEach(p => { out.set(p, at); at += p.length; });
    return out;
}

/** What pngjs makes of the bytes - width, height and RGBA. */
const Reference = (bytes: Uint8Array) => {
    const png = PNG.sync.read(Buffer.from(bytes));
    return { width: png.width, height: png.height, rgba: new Uint8Array(png.data) };
};

describe("Png round trip", () => {
    it("writes an indexed PNG that reads back with the same palette, alpha and pixels", async () => {
        const palette: Rgba[] = [
            { r: 0, g: 0, b: 0, a: 0 },
            { r: 255, g: 0, b: 0, a: 255 },
            { r: 10, g: 200, b: 30, a: 128 },
            { r: 1, g: 2, b: 3, a: 255 }
        ];
        const indices = Uint8Array.from([0, 1, 2, 3, 3, 2, 1, 0, 1, 1, 2, 2]);
        const bytes = await EncodeIndexedPng(4, 3, indices, palette);
        const png = await DecodePng(bytes);
        expect(png.width).toBe(4);
        expect(png.height).toBe(3);
        expect(png.indexed.palette).toEqual(palette);
        expect(Array.from(png.indexed.indices)).toEqual(Array.from(indices));
        // ...and the build's own reader agrees on the colours.
        const reference = Reference(bytes);
        expect(Array.from(png.rgba)).toEqual(Array.from(reference.rgba));
    });

    it("keeps a 256-entry palette whole, trailing opaque entries and all", async () => {
        const palette: Rgba[] = [];
        for (let i = 0; i < 256; i++) palette.push({ r: i, g: 255 - i, b: (i * 7) & 255, a: i === 0 ? 0 : i === 5 ? 90 : 255 });
        const indices = new Uint8Array(16 * 16);
        for (let i = 0; i < indices.length; i++) indices[i] = i;
        const png = await DecodePng(await EncodeIndexedPng(16, 16, indices, palette));
        expect(png.indexed.palette).toEqual(palette);
        expect(Array.from(png.indexed.indices)).toEqual(Array.from(indices));
    });

    it("writes tRNS only as far as the last translucent entry", async () => {
        const opaque: Rgba[] = [{ r: 1, g: 1, b: 1, a: 255 }, { r: 2, g: 2, b: 2, a: 255 }];
        const bytes = await EncodeIndexedPng(1, 1, Uint8Array.from([0]), opaque);
        const text = Buffer.from(bytes).toString("latin1");
        expect(text).not.toContain("tRNS");
        const withAlpha = await EncodeIndexedPng(1, 1, Uint8Array.from([0]), [{ r: 1, g: 1, b: 1, a: 7 }, ...opaque]);
        expect(Buffer.from(withAlpha).toString("latin1")).toContain("tRNS");
    });

    it("writes RGBA that reads back exactly - including the colours of nearly-transparent pixels a canvas would change", async () => {
        const rgba = Noise(9 * 7 * 4, 5);
        const png = await DecodePng(await EncodeRgbaPng(9, 7, rgba));
        expect(png.indexed).toBeUndefined();
        expect(Array.from(png.rgba)).toEqual(Array.from(rgba));
    });

    it("refuses a palette that's too big, pixels that don't fit, or an index with no entry", async () => {
        const many = Array.from({ length: 257 }, () => ({ r: 0, g: 0, b: 0, a: 255 }));
        await expect(EncodeIndexedPng(1, 1, Uint8Array.from([0]), many)).rejects.toThrow(/256/);
        await expect(EncodeIndexedPng(2, 2, Uint8Array.from([0]), [{ r: 0, g: 0, b: 0, a: 255 }])).rejects.toThrow(/size/);
        await expect(EncodeIndexedPng(1, 1, Uint8Array.from([3]), [{ r: 0, g: 0, b: 0, a: 255 }])).rejects.toThrow(/entry/);
        await expect(EncodeRgbaPng(2, 2, new Uint8Array(4))).rejects.toThrow(/size/);
    });
});

describe("DecodePng against pngjs", () => {
    const source = (w: number, h: number) => {
        const png = new PNG({ width: w, height: h });
        png.data = Buffer.from(Noise(w * h * 4, w + h));
        return png;
    };

    [
        { colorType: 6, bitDepth: 8 },
        { colorType: 6, bitDepth: 16 },
        { colorType: 2, bitDepth: 8 },
        { colorType: 2, bitDepth: 16 },
        { colorType: 0, bitDepth: 8 },
        { colorType: 0, bitDepth: 16 },
        { colorType: 4, bitDepth: 8 },
        { colorType: 4, bitDepth: 16 }
    ].forEach(options => {
        it(`reads colour type ${options.colorType} at ${options.bitDepth} bits the way pngjs does`, async () => {
            const bytes = new Uint8Array(PNG.sync.write(source(11, 9), { ...options, inputColorType: 6, inputHasAlpha: true }));
            const mine = await DecodePng(bytes);
            const reference = Reference(bytes);
            expect(mine.width).toBe(reference.width);
            expect(mine.height).toBe(reference.height);
            expect(Array.from(mine.rgba)).toEqual(Array.from(reference.rgba));
        });
    });

    it("undoes every row filter (none, sub, up, average, paeth) - at 1 and 4 bytes a pixel", async () => {
        for (const bytesPerPixel of [1, 4]) {
            const colourType = bytesPerPixel === 4 ? 6 : 0;
            const width = 7, height = 6;
            const pixels = Noise(width * height * bytesPerPixel, 9);
            for (const type of [0, 1, 2, 3, 4]) {
                const scanlines = FilterRows(pixels, width * bytesPerPixel, bytesPerPixel, type);
                const bytes = BuildPng({ width, height, bitDepth: 8, colourType, scanlines });
                const mine = await DecodePng(bytes);
                const reference = Reference(bytes);
                expect(Array.from(mine.rgba), `filter ${type}, ${bytesPerPixel}bpp`).toEqual(Array.from(reference.rgba));
            }
        }
    });

    it("reads a 4-bit palette image with transparency, as the PNG's own palette and indices", async () => {
        const width = 5, height = 3; // 5 pixels of 4 bits = 3 bytes a row, the last nibble padding
        const indices = [0, 1, 2, 3, 4, 5, 4, 3, 2, 1, 0, 15, 8, 9, 10];
        const rows = new Uint8Array(3 * height);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const v = indices[y * width + x];
                rows[y * 3 + (x >> 1)] |= x % 2 === 0 ? v << 4 : v;
            }
        }
        const plte = new Uint8Array(16 * 3);
        for (let i = 0; i < 16; i++) { plte[i * 3] = i * 16; plte[i * 3 + 1] = 255 - i * 16; plte[i * 3 + 2] = i; }
        const trns = Uint8Array.from([0, 128]);
        const bytes = BuildPng({ width, height, bitDepth: 4, colourType: 3, scanlines: FilterRows(rows, 3, 1, 0), plte, trns });
        const mine = await DecodePng(bytes);
        expect(Array.from(mine.indexed.indices)).toEqual(indices);
        expect(mine.indexed.palette).toHaveLength(16);
        expect(mine.indexed.palette[0].a).toBe(0);
        expect(mine.indexed.palette[1].a).toBe(128);
        expect(mine.indexed.palette[2].a).toBe(255);
        expect(Array.from(mine.rgba)).toEqual(Array.from(Reference(bytes).rgba));
    });

    it("reads a 1-bit grey image, scaling 1 to white", async () => {
        const rows = Uint8Array.from([0b10100000, 0b01010000]);
        const bytes = BuildPng({ width: 4, height: 2, bitDepth: 1, colourType: 0, scanlines: FilterRows(rows, 1, 1, 0) });
        const mine = await DecodePng(bytes);
        expect(Array.from(mine.rgba.filter((_, i) => i % 4 === 0))).toEqual([255, 0, 255, 0, 0, 255, 0, 255]);
        expect(Array.from(mine.rgba)).toEqual(Array.from(Reference(bytes).rgba));
    });

    it("applies a grey colour key (tRNS) and an RGB one", async () => {
        const grey = BuildPng({ width: 2, height: 1, bitDepth: 8, colourType: 0, scanlines: FilterRows(Uint8Array.from([10, 200]), 2, 1, 0), trns: Uint8Array.from([0, 10]) });
        expect((await DecodePng(grey)).rgba[3]).toBe(0);
        expect((await DecodePng(grey)).rgba[7]).toBe(255);
        expect(Array.from((await DecodePng(grey)).rgba)).toEqual(Array.from(Reference(grey).rgba));

        const rgb = BuildPng({ width: 2, height: 1, bitDepth: 8, colourType: 2, scanlines: FilterRows(Uint8Array.from([1, 2, 3, 4, 5, 6]), 6, 3, 0), trns: Uint8Array.from([0, 1, 0, 2, 0, 3]) });
        const decoded = await DecodePng(rgb);
        expect([decoded.rgba[3], decoded.rgba[7]]).toEqual([0, 255]);
        expect(Array.from(decoded.rgba)).toEqual(Array.from(Reference(rgb).rgba));
    });

    it("reads an Adam7 interlaced image, including sizes where some passes are empty", async () => {
        const passes = [
            { x: 0, y: 0, dx: 8, dy: 8 }, { x: 4, y: 0, dx: 8, dy: 8 }, { x: 0, y: 4, dx: 4, dy: 8 }, { x: 2, y: 0, dx: 4, dy: 4 },
            { x: 0, y: 2, dx: 2, dy: 4 }, { x: 1, y: 0, dx: 2, dy: 2 }, { x: 0, y: 1, dx: 1, dy: 2 }
        ];
        for (const [width, height] of [[13, 11], [3, 2], [1, 1], [9, 1]]) {
            const rgba = Noise(width * height * 4, width * 31 + height);
            const chunks: Uint8Array[] = [];
            passes.forEach(pass => {
                const pw = Math.ceil((width - pass.x) / pass.dx);
                const ph = Math.ceil((height - pass.y) / pass.dy);
                if (pw <= 0 || ph <= 0) return;
                const rows = new Uint8Array(pw * ph * 4);
                for (let j = 0; j < ph; j++) for (let i = 0; i < pw; i++) {
                    const from = ((pass.y + j * pass.dy) * width + pass.x + i * pass.dx) * 4;
                    rows.set(rgba.subarray(from, from + 4), (j * pw + i) * 4);
                }
                chunks.push(FilterRows(rows, pw * 4, 4, 0));
            });
            const scanlines = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
            let at = 0;
            chunks.forEach(c => { scanlines.set(c, at); at += c.length; });
            const bytes = BuildPng({ width, height, bitDepth: 8, colourType: 6, scanlines, interlace: 1 });
            const mine = await DecodePng(bytes);
            expect(Array.from(mine.rgba), `${width}x${height}`).toEqual(Array.from(rgba));
            expect(Array.from(Reference(bytes).rgba), `${width}x${height} (pngjs)`).toEqual(Array.from(rgba));
        }
    });

    it("says what's wrong with a file that isn't a usable PNG", async () => {
        await expect(DecodePng(new Uint8Array(100))).rejects.toThrow(/isn't a PNG/);
        const ok = await EncodeRgbaPng(2, 2, new Uint8Array(16));
        await expect(DecodePng(ok.subarray(0, 40))).rejects.toThrow(/cut short|no image data/);
        const noPalette = BuildPng({ width: 1, height: 1, bitDepth: 8, colourType: 3, scanlines: Uint8Array.from([0, 0]) });
        await expect(DecodePng(noPalette)).rejects.toThrow(/no palette/);
    });
});
