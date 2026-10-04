import { describe, expect, it } from "vitest";
import { Crc32 } from "./Png";
import { CreateZip, ZipNameProblem } from "./Zip";

/** A reader written straight from the zip spec, to check what the writer made - by the central directory, the way real unzippers do. */
function ReadZip(zip: Uint8Array) {
    const view = new DataView(zip.buffer, zip.byteOffset, zip.length);
    // The end-of-directory record is the last 22 bytes (we write no comment).
    const end = zip.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    const count = view.getUint16(end + 10, true);
    expect(view.getUint16(end + 8, true)).toBe(count);
    const size = view.getUint32(end + 12, true);
    const offset = view.getUint32(end + 16, true);
    expect(offset + size).toBe(end);
    const decoder = new TextDecoder();
    const files: Array<{ name: string; data: Uint8Array; crc: number; time: number; date: number; flags: number; method: number }> = [];
    let at = offset;
    for (let i = 0; i < count; i++) {
        expect(view.getUint32(at, true)).toBe(0x02014b50);
        const flags = view.getUint16(at + 8, true);
        const method = view.getUint16(at + 10, true);
        const time = view.getUint16(at + 12, true);
        const date = view.getUint16(at + 14, true);
        const crc = view.getUint32(at + 16, true);
        const compressed = view.getUint32(at + 20, true);
        const uncompressed = view.getUint32(at + 24, true);
        const nameLength = view.getUint16(at + 28, true);
        const extraLength = view.getUint16(at + 30, true);
        const commentLength = view.getUint16(at + 32, true);
        const local = view.getUint32(at + 42, true);
        const name = decoder.decode(zip.subarray(at + 46, at + 46 + nameLength));
        expect(compressed).toBe(uncompressed);
        // the local header it points at agrees
        expect(view.getUint32(local, true)).toBe(0x04034b50);
        expect(view.getUint32(local + 14, true)).toBe(crc);
        expect(view.getUint32(local + 18, true)).toBe(compressed);
        expect(view.getUint16(local + 26, true)).toBe(nameLength);
        expect(decoder.decode(zip.subarray(local + 30, local + 30 + nameLength))).toBe(name);
        const start = local + 30 + nameLength + view.getUint16(local + 28, true);
        files.push({ name, data: zip.slice(start, start + uncompressed), crc, time, date, flags, method });
        at += 46 + nameLength + extraLength + commentLength;
    }
    expect(at).toBe(end);
    return files;
}

const bytes = (...values: number[]) => Uint8Array.from(values);

describe("CreateZip", () => {
    it("holds each file's name and exact bytes, with the right checksum", () => {
        const png = bytes(0x89, 0x50, 0x4e, 0x47, 0, 255, 128, 7);
        const files = ReadZip(CreateZip([{ name: "global/sprites/user/gem_f0.png", data: png }, { name: "global/sprites/user/gem_f1.png", data: bytes(1, 2, 3) }]));
        expect(files.map(f => f.name)).toEqual(["global/sprites/user/gem_f0.png", "global/sprites/user/gem_f1.png"]);
        expect(Array.from(files[0].data)).toEqual(Array.from(png));
        expect(Array.from(files[1].data)).toEqual([1, 2, 3]);
        files.forEach(f => expect(f.crc).toBe(Crc32(f.data)));
    });

    it("stores rather than compresses, and flags the names as UTF-8", () => {
        const [file] = ReadZip(CreateZip([{ name: "a.png", data: bytes(9) }]));
        expect(file.method).toBe(0);
        expect(file.flags & 0x0800).toBe(0x0800);
    });

    it("keeps every byte value intact, in a file big enough to matter", () => {
        const data = new Uint8Array(300000);
        for (let i = 0; i < data.length; i++) data[i] = (i * 131 + (i >> 8)) & 255;
        const [file] = ReadZip(CreateZip([{ name: "big.bin", data }]));
        expect(file.data.length).toBe(data.length);
        expect(file.crc).toBe(Crc32(data));
        expect(file.data.every((v, i) => v === data[i])).toBe(true);
    });

    it("handles names beyond ASCII, and an empty file", () => {
        const files = ReadZip(CreateZip([{ name: "ünï/頭.png", data: bytes(1) }, { name: "empty.txt", data: new Uint8Array(0) }]));
        expect(files.map(f => f.name)).toEqual(["ünï/頭.png", "empty.txt"]);
        expect(files[1].data.length).toBe(0);
        expect(files[1].crc).toBe(0);
    });

    it("is a valid zip with nothing in it, too", () => {
        const zip = CreateZip([]);
        expect(zip.length).toBe(22);
        expect(ReadZip(zip)).toEqual([]);
    });

    it("dates the files with the time it's given, in DOS format", () => {
        const [file] = ReadZip(CreateZip([{ name: "a", data: bytes(1) }], new Date(2026, 9, 4, 12, 34, 56)));
        expect(file.time).toBe((12 << 11) | (34 << 5) | 28);
        expect(file.date).toBe(((2026 - 1980) << 9) | (10 << 5) | 4);
    });

    it("clamps a date the format can't hold", () => {
        const [file] = ReadZip(CreateZip([{ name: "a", data: bytes(1) }], new Date(1970, 0, 1)));
        expect(file.date >> 9).toBe(0);
    });

    it("keeps the files in the order given", () => {
        const names = ["c", "a", "b"];
        expect(ReadZip(CreateZip(names.map(name => ({ name, data: bytes(1) })))).map(f => f.name)).toEqual(names);
    });

    it("refuses a file twice, and names that would escape or confuse", () => {
        expect(() => CreateZip([{ name: "a", data: bytes(1) }, { name: "a", data: bytes(2) }])).toThrow(/twice/);
        ["../a", "a/../b", "/abs", "C:/x", "a\\b", "", "a//b", "./a"].forEach(name => {
            expect(() => CreateZip([{ name, data: bytes(1) }]), name).toThrow(/Can't put/);
        });
    });
});

describe("ZipNameProblem", () => {
    it("accepts ordinary paths", () => {
        ["a.png", "global/sprites/user/gem_f0.png", "a b/c-d.png"].forEach(name => expect(ZipNameProblem(name), name).toBeNull());
    });
});
