import { describe, expect, it } from "vitest";
import { ByteReader, ByteWriter } from "./Bytes";

describe("ByteWriter and ByteReader", () => {
    it("read back every kind of value in the order written", () => {
        const bytes = new ByteWriter()
            .U8(200).U16(60000).U32(4000000000)
            .I8(-100).I16(-30000).I32(-2000000000)
            .F32(1.5).F64(Math.PI)
            .Bool(true).Bool(false)
            .String("héllo, wörld ⚔")
            .Bytes(new Uint8Array([1, 2, 3]))
            .ToBytes();
        const reader = new ByteReader(bytes);
        expect(reader.U8()).toBe(200);
        expect(reader.U16()).toBe(60000);
        expect(reader.U32()).toBe(4000000000);
        expect(reader.I8()).toBe(-100);
        expect(reader.I16()).toBe(-30000);
        expect(reader.I32()).toBe(-2000000000);
        expect(reader.F32()).toBe(1.5);
        expect(reader.F64()).toBe(Math.PI);
        expect(reader.Bool()).toBe(true);
        expect(reader.Bool()).toBe(false);
        expect(reader.String()).toBe("héllo, wörld ⚔");
        expect(Array.from(reader.Bytes())).toEqual([1, 2, 3]);
        expect(reader.AtEnd).toBe(true);
    });

    it("grows past the room it started with", () => {
        const writer = new ByteWriter(8);
        for (let i = 0; i < 1000; i++) {
            writer.U32(i);
        }
        expect(writer.Length).toBe(4000);
        const reader = new ByteReader(writer.ToBytes());
        for (let i = 0; i < 1000; i++) {
            expect(reader.U32()).toBe(i);
        }
    });

    it("is little-endian", () => {
        expect(Array.from(new ByteWriter().U16(0x0102).ToBytes())).toEqual([2, 1]);
    });

    it("starts again after Clear, and hands back copies", () => {
        const writer = new ByteWriter();
        const first = writer.U8(1).ToBytes();
        const second = writer.Clear().U8(2).ToBytes();
        expect(Array.from(first)).toEqual([1]);
        expect(Array.from(second)).toEqual([2]);
    });

    it("leaves the rest of a message for Rest, after Raw", () => {
        const bytes = new ByteWriter().U8(7).Raw(new Uint8Array([9, 8, 7])).ToBytes();
        const reader = new ByteReader(bytes);
        expect(reader.U8()).toBe(7);
        expect(Array.from(reader.Rest())).toEqual([9, 8, 7]);
        expect(reader.Remaining).toBe(0);
    });

    it("reads from the middle of a larger buffer", () => {
        const buffer = new Uint8Array([0, 0, 5, 0, 0]);
        expect(new ByteReader(buffer.subarray(2, 4)).U16()).toBe(5);
    });

    it("throws a RangeError rather than read past the end", () => {
        const reader = new ByteReader(new Uint8Array([1, 2, 3]));
        expect(() => reader.U32()).toThrow(RangeError);
        expect(() => new ByteReader(new ByteWriter().U16(10).ToBytes()).String()).toThrow(RangeError);
    });

    it("won't write a string too long for its length", () => {
        expect(() => new ByteWriter().String("x".repeat(70000))).toThrow(RangeError);
    });
});
