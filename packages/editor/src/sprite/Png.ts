/**
 * A PNG reader and writer, so the sprite editor can load and save the game's source art in the
 * browser exactly - not through a canvas, whose premultiplied alpha quietly changes the colours of
 * semi-transparent pixels. Pure - zlib comes from the platform's CompressionStream /
 * DecompressionStream, which browsers and Node both have - so it runs under the plain node test
 * runner (see Png.test.ts).
 *
 * Reads every PNG a tool is likely to make: all five colour types, 1 to 16 bits, `tRNS`
 * transparency, interlaced (Adam7). A palette image also hands back its palette and indices, so a
 * sprite saved as an indexed PNG re-opens with its palette in the same order. Writes either an
 * indexed PNG (`PLTE` + `tRNS`, what the editor saves) or plain RGBA.
 */

import { Rgba } from "./Colour";

export type DecodedPng = {
    width: number;
    height: number;
    /** 4 bytes a pixel, straight alpha, whatever the file's own format. */
    rgba: Uint8Array;
    /** Only for a palette image of 8 bits or fewer: the file's own palette and each pixel's index into it. */
    indexed?: { palette: Rgba[]; indices: Uint8Array };
};

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const CHANNELS: { [colourType: number]: number } = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/** Adam7: where each of the seven passes starts, and how far apart its pixels are. */
const ADAM7 = [
    { x: 0, y: 0, dx: 8, dy: 8 },
    { x: 4, y: 0, dx: 8, dy: 8 },
    { x: 0, y: 4, dx: 4, dy: 8 },
    { x: 2, y: 0, dx: 4, dy: 4 },
    { x: 0, y: 2, dx: 2, dy: 4 },
    { x: 1, y: 0, dx: 2, dy: 2 },
    { x: 0, y: 1, dx: 1, dy: 2 }
];

let crcTable: Uint32Array | null = null;

function Crc32(bytes: Uint8Array): number {
    if (!crcTable) {
        crcTable = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) {
                c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            }
            crcTable[n] = c >>> 0;
        }
    }
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
        crc = crcTable[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function Concat(parts: ReadonlyArray<Uint8Array>): Uint8Array {
    let length = 0;
    parts.forEach(part => (length += part.length));
    const out = new Uint8Array(length);
    let at = 0;
    parts.forEach(part => {
        out.set(part, at);
        at += part.length;
    });
    return out;
}

/** Runs `data` through a (De)CompressionStream. zlib framing, as PNG's IDAT uses. */
async function Transform(data: Uint8Array, stream: unknown): Promise<Uint8Array> {
    const source = new Blob([data as unknown as BlobPart]).stream();
    const piped = source.pipeThrough(stream as unknown as ReadableWritablePair<Uint8Array, BufferSource>);
    return new Uint8Array(await new Response(piped).arrayBuffer());
}

async function Inflate(data: Uint8Array): Promise<Uint8Array> {
    if (typeof DecompressionStream === "undefined") {
        throw new Error("This browser can't read PNG files here (no DecompressionStream).");
    }
    return Transform(data, new DecompressionStream("deflate"));
}

async function Deflate(data: Uint8Array): Promise<Uint8Array> {
    if (typeof CompressionStream === "undefined") {
        throw new Error("This browser can't write PNG files here (no CompressionStream).");
    }
    return Transform(data, new CompressionStream("deflate"));
}

const Be32 = (b: Uint8Array, at: number): number => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;

/** Undoes PNG's per-row filters in place-ish: `raw` holds filter byte + row bytes per row from `offset`. */
function Unfilter(raw: Uint8Array, offset: number, rows: number, rowBytes: number, bytesPerPixel: number): Uint8Array {
    const out = new Uint8Array(rows * rowBytes);
    for (let y = 0; y < rows; y++) {
        const filter = raw[offset + y * (rowBytes + 1)];
        const src = offset + y * (rowBytes + 1) + 1;
        const dst = y * rowBytes;
        const up = dst - rowBytes;
        for (let x = 0; x < rowBytes; x++) {
            const value = raw[src + x];
            const left = x >= bytesPerPixel ? out[dst + x - bytesPerPixel] : 0;
            const above = y > 0 ? out[up + x] : 0;
            const upperLeft = y > 0 && x >= bytesPerPixel ? out[up + x - bytesPerPixel] : 0;
            let result: number;
            switch (filter) {
                case 0:
                    result = value;
                    break;
                case 1:
                    result = value + left;
                    break;
                case 2:
                    result = value + above;
                    break;
                case 3:
                    result = value + ((left + above) >> 1);
                    break;
                case 4: {
                    const p = left + above - upperLeft;
                    const pa = Math.abs(p - left);
                    const pb = Math.abs(p - above);
                    const pc = Math.abs(p - upperLeft);
                    result = value + (pa <= pb && pa <= pc ? left : pb <= pc ? above : upperLeft);
                    break;
                }
                default:
                    throw new Error("The PNG uses an unknown row filter (" + filter + ").");
            }
            out[dst + x] = result & 255;
        }
    }
    return out;
}

/** Sample `i` of a row at `bitDepth` bits - the raw value, 0..2^bitDepth-1. */
function Sample(row: Uint8Array, rowStart: number, i: number, bitDepth: number): number {
    if (bitDepth === 8) {
        return row[rowStart + i];
    }
    if (bitDepth === 16) {
        return (row[rowStart + i * 2] << 8) | row[rowStart + i * 2 + 1];
    }
    const perByte = 8 / bitDepth;
    const byte = row[rowStart + Math.floor(i / perByte)];
    const shift = 8 - bitDepth * ((i % perByte) + 1);
    return (byte >> shift) & ((1 << bitDepth) - 1);
}

export async function DecodePng(bytes: Uint8Array): Promise<DecodedPng> {
    if (bytes.length < 33 || SIGNATURE.some((b, i) => bytes[i] !== b)) {
        throw new Error("That isn't a PNG file.");
    }
    let width = 0;
    let height = 0;
    let bitDepth = 0;
    let colourType = 0;
    let interlaced = false;
    const idat: Uint8Array[] = [];
    let plte: Uint8Array | null = null;
    let trns: Uint8Array | null = null;

    let pos = 8;
    let seenEnd = false;
    while (pos + 8 <= bytes.length && !seenEnd) {
        const length = Be32(bytes, pos);
        const type = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]);
        const data = bytes.subarray(pos + 8, pos + 8 + length);
        if (data.length < length) {
            throw new Error("The PNG is cut short.");
        }
        switch (type) {
            case "IHDR":
                width = Be32(data, 0);
                height = Be32(data, 4);
                bitDepth = data[8];
                colourType = data[9];
                interlaced = data[12] === 1;
                break;
            case "PLTE":
                plte = data;
                break;
            case "tRNS":
                trns = data;
                break;
            case "IDAT":
                idat.push(data);
                break;
            case "IEND":
                seenEnd = true;
                break;
        }
        pos += 12 + length;
    }
    if (!width || !height || !(colourType in CHANNELS) || [1, 2, 4, 8, 16].indexOf(bitDepth) < 0) {
        throw new Error("The PNG header isn't one this editor can read.");
    }
    if (colourType === 3 && !plte) {
        throw new Error("The PNG is a palette image with no palette.");
    }
    if (!idat.length) {
        throw new Error("The PNG has no image data.");
    }

    const channels = CHANNELS[colourType];
    const bitsPerPixel = channels * bitDepth;
    const bytesPerPixel = Math.max(1, bitsPerPixel >> 3);
    const raw = await Inflate(Concat(idat));

    const palette: Rgba[] = [];
    if (colourType === 3) {
        for (let i = 0; i + 2 < plte.length; i += 3) {
            palette.push({ r: plte[i], g: plte[i + 1], b: plte[i + 2], a: trns && i / 3 < trns.length ? trns[i / 3] : 255 });
        }
    }
    const maxSample = (1 << Math.min(bitDepth, 8)) - 1;
    const rgba = new Uint8Array(width * height * 4);
    const indices = colourType === 3 && bitDepth <= 8 ? new Uint8Array(width * height) : null;

    const putPixel = (row: Uint8Array, rowStart: number, i: number, outX: number, outY: number): void => {
        const o = (outY * width + outX) * 4;
        // The way pngjs - which the asset build reads these files with - scales a sample to 8 bits: exactly, not by dropping the low byte.
        const scale = (v: number) => (bitDepth === 16 ? Math.round(v / 257) : bitDepth < 8 ? Math.round((v * 255) / maxSample) : v);
        let r: number, g: number, b: number, a = 255;
        switch (colourType) {
            case 3: {
                const index = Sample(row, rowStart, i, bitDepth);
                const entry = palette[index] || { r: 0, g: 0, b: 0, a: 255 };
                r = entry.r; g = entry.g; b = entry.b; a = entry.a;
                if (indices) {
                    indices[outY * width + outX] = index;
                }
                break;
            }
            case 0: {
                const v = Sample(row, rowStart, i, bitDepth);
                r = g = b = scale(v);
                if (trns && trns.length >= 2 && v === ((trns[0] << 8) | trns[1])) {
                    r = g = b = a = 0;
                }
                break;
            }
            case 4:
                r = g = b = scale(Sample(row, rowStart, i * 2, bitDepth));
                a = scale(Sample(row, rowStart, i * 2 + 1, bitDepth));
                break;
            case 2: {
                const vr = Sample(row, rowStart, i * 3, bitDepth);
                const vg = Sample(row, rowStart, i * 3 + 1, bitDepth);
                const vb = Sample(row, rowStart, i * 3 + 2, bitDepth);
                r = scale(vr); g = scale(vg); b = scale(vb);
                if (trns && trns.length >= 6 && vr === ((trns[0] << 8) | trns[1]) && vg === ((trns[2] << 8) | trns[3]) && vb === ((trns[4] << 8) | trns[5])) {
                    r = g = b = a = 0;
                }
                break;
            }
            default:
                r = scale(Sample(row, rowStart, i * 4, bitDepth));
                g = scale(Sample(row, rowStart, i * 4 + 1, bitDepth));
                b = scale(Sample(row, rowStart, i * 4 + 2, bitDepth));
                a = scale(Sample(row, rowStart, i * 4 + 3, bitDepth));
        }
        rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = a;
    };

    const passes = interlaced ? ADAM7 : [{ x: 0, y: 0, dx: 1, dy: 1 }];
    let offset = 0;
    passes.forEach(pass => {
        const passWidth = Math.ceil((width - pass.x) / pass.dx);
        const passHeight = Math.ceil((height - pass.y) / pass.dy);
        if (passWidth <= 0 || passHeight <= 0) {
            return;
        }
        const rowBytes = Math.ceil((passWidth * bitsPerPixel) / 8);
        if (offset + passHeight * (rowBytes + 1) > raw.length) {
            throw new Error("The PNG's image data is cut short.");
        }
        const pixels = Unfilter(raw, offset, passHeight, rowBytes, bytesPerPixel);
        offset += passHeight * (rowBytes + 1);
        for (let y = 0; y < passHeight; y++) {
            for (let x = 0; x < passWidth; x++) {
                putPixel(pixels, y * rowBytes, x, pass.x + x * pass.dx, pass.y + y * pass.dy);
            }
        }
    });

    return indices ? { width, height, rgba, indexed: { palette, indices } } : { width, height, rgba };
}

function Chunk(type: string, data: Uint8Array): Uint8Array {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) {
        out[4 + i] = type.charCodeAt(i);
    }
    out.set(data, 8);
    view.setUint32(8 + data.length, Crc32(out.subarray(4, 8 + data.length)));
    return out;
}

function Header(width: number, height: number, colourType: number): Uint8Array {
    const data = new Uint8Array(13);
    const view = new DataView(data.buffer);
    view.setUint32(0, width);
    view.setUint32(4, height);
    data[8] = 8;
    data[9] = colourType;
    return Chunk("IHDR", data);
}

/** Filter byte 0 (none) in front of every row. */
function Scanlines(pixels: Uint8Array, width: number, height: number, bytesPerPixel: number): Uint8Array {
    const rowBytes = width * bytesPerPixel;
    const out = new Uint8Array(height * (rowBytes + 1));
    for (let y = 0; y < height; y++) {
        out.set(pixels.subarray(y * rowBytes, (y + 1) * rowBytes), y * (rowBytes + 1) + 1);
    }
    return out;
}

/** An indexed PNG: `palette` (1..256 entries, alpha included, as `PLTE` + `tRNS`) and one byte a pixel. */
export async function EncodeIndexedPng(width: number, height: number, indices: Uint8Array, palette: ReadonlyArray<Rgba>): Promise<Uint8Array> {
    if (palette.length < 1 || palette.length > 256) {
        throw new Error("A PNG palette has 1 to 256 colours.");
    }
    if (indices.length !== width * height) {
        throw new Error("The pixels don't match the size of the image.");
    }
    for (let i = 0; i < indices.length; i++) {
        if (indices[i] >= palette.length) {
            throw new Error("A pixel uses a palette entry that doesn't exist.");
        }
    }
    const plte = new Uint8Array(palette.length * 3);
    palette.forEach((c, i) => {
        plte[i * 3] = c.r;
        plte[i * 3 + 1] = c.g;
        plte[i * 3 + 2] = c.b;
    });
    let lastTranslucent = -1;
    palette.forEach((c, i) => {
        if (c.a < 255) {
            lastTranslucent = i;
        }
    });
    const parts = [new Uint8Array(SIGNATURE), Header(width, height, 3), Chunk("PLTE", plte)];
    if (lastTranslucent >= 0) {
        parts.push(Chunk("tRNS", Uint8Array.from(palette.slice(0, lastTranslucent + 1).map(c => c.a))));
    }
    parts.push(Chunk("IDAT", await Deflate(Scanlines(indices, width, height, 1))), Chunk("IEND", new Uint8Array(0)));
    return Concat(parts);
}

/** A plain 32-bit RGBA PNG. */
export async function EncodeRgbaPng(width: number, height: number, rgba: Uint8Array): Promise<Uint8Array> {
    if (rgba.length !== width * height * 4) {
        throw new Error("The pixels don't match the size of the image.");
    }
    return Concat([
        new Uint8Array(SIGNATURE),
        Header(width, height, 6),
        Chunk("IDAT", await Deflate(Scanlines(rgba, width, height, 4))),
        Chunk("IEND", new Uint8Array(0))
    ]);
}
