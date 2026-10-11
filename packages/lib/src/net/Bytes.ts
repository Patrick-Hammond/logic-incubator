/**
 * Packing numbers and text into bytes and reading them back - what binary
 * messages (snapshots, inputs) are made of. Little-endian, like the machines
 * the games run on. Pure - no pixi - so it runs under the plain node test runner.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Builds a message a value at a time, growing as it goes; `Bytes` hands back what's been written. */
export class ByteWriter {
    private buffer: Uint8Array;
    private view: DataView;
    private length = 0;

    constructor(capacity = 64) {
        this.buffer = new Uint8Array(Math.max(capacity, 8));
        this.view = new DataView(this.buffer.buffer);
    }

    /** How many bytes have been written. */
    get Length(): number {
        return this.length;
    }

    /** Starts again from nothing, keeping the room already made - for a message written every frame. */
    Clear(): this {
        this.length = 0;
        return this;
    }

    U8(value: number): this {
        this.Room(1).setUint8(this.length, value);
        this.length += 1;
        return this;
    }

    U16(value: number): this {
        this.Room(2).setUint16(this.length, value, true);
        this.length += 2;
        return this;
    }

    U32(value: number): this {
        this.Room(4).setUint32(this.length, value, true);
        this.length += 4;
        return this;
    }

    I8(value: number): this {
        this.Room(1).setInt8(this.length, value);
        this.length += 1;
        return this;
    }

    I16(value: number): this {
        this.Room(2).setInt16(this.length, value, true);
        this.length += 2;
        return this;
    }

    I32(value: number): this {
        this.Room(4).setInt32(this.length, value, true);
        this.length += 4;
        return this;
    }

    F32(value: number): this {
        this.Room(4).setFloat32(this.length, value, true);
        this.length += 4;
        return this;
    }

    F64(value: number): this {
        this.Room(8).setFloat64(this.length, value, true);
        this.length += 8;
        return this;
    }

    Bool(value: boolean): this {
        return this.U8(value ? 1 : 0);
    }

    /** Text as UTF-8, after its length in bytes (a u16, so at most 65535 bytes of it). */
    String(value: string): this {
        const bytes = encoder.encode(value);
        if (bytes.length > 0xffff) {
            throw new RangeError("A string of " + bytes.length + " bytes is too long to write (65535 at most).");
        }
        this.U16(bytes.length);
        return this.Raw(bytes);
    }

    /** Bytes as they are, after their length (a u32). */
    Bytes(value: Uint8Array): this {
        this.U32(value.length);
        return this.Raw(value);
    }

    /** Bytes as they are, with no length - for the end of a message, where the reader takes the rest (`ByteReader.Rest`). */
    Raw(value: Uint8Array): this {
        this.Room(value.length);
        this.buffer.set(value, this.length);
        this.length += value.length;
        return this;
    }

    /** A copy of what's been written - safe to send or keep while this writer goes on to the next message. */
    ToBytes(): Uint8Array {
        return this.buffer.slice(0, this.length);
    }

    /** Makes room for `bytes` more, doubling the buffer as often as that takes, and gives the view to write them through. */
    private Room(bytes: number): DataView {
        const needed = this.length + bytes;
        if (needed > this.buffer.length) {
            let capacity = this.buffer.length * 2;
            while (capacity < needed) {
                capacity *= 2;
            }
            const bigger = new Uint8Array(capacity);
            bigger.set(this.buffer.subarray(0, this.length));
            this.buffer = bigger;
            this.view = new DataView(bigger.buffer);
        }
        return this.view;
    }
}

/** Reads a message back in the order it was written. Reading past its end throws a `RangeError`, so a short or garbled message can't pass for a good one. */
export class ByteReader {
    private view: DataView;
    private offset = 0;

    constructor(private bytes: Uint8Array) {
        this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    }

    /** How many bytes are left to read. */
    get Remaining(): number {
        return this.bytes.length - this.offset;
    }

    /** Whether everything has been read. */
    get AtEnd(): boolean {
        return this.offset >= this.bytes.length;
    }

    U8(): number {
        return this.view.getUint8(this.Take(1));
    }

    U16(): number {
        return this.view.getUint16(this.Take(2), true);
    }

    U32(): number {
        return this.view.getUint32(this.Take(4), true);
    }

    I8(): number {
        return this.view.getInt8(this.Take(1));
    }

    I16(): number {
        return this.view.getInt16(this.Take(2), true);
    }

    I32(): number {
        return this.view.getInt32(this.Take(4), true);
    }

    F32(): number {
        return this.view.getFloat32(this.Take(4), true);
    }

    F64(): number {
        return this.view.getFloat64(this.Take(8), true);
    }

    Bool(): boolean {
        return this.U8() !== 0;
    }

    String(): string {
        const length = this.U16();
        return decoder.decode(this.Slice(length));
    }

    Bytes(): Uint8Array {
        return this.Slice(this.U32()).slice();
    }

    /** Everything not yet read (a view onto the message, not a copy) - see `ByteWriter.Raw`. */
    Rest(): Uint8Array {
        return this.Slice(this.Remaining);
    }

    private Slice(length: number): Uint8Array {
        const start = this.Take(length);
        return this.bytes.subarray(start, start + length);
    }

    /** Where the next `bytes` start, moving past them - or a `RangeError` if the message is shorter than that. */
    private Take(bytes: number): number {
        const at = this.offset;
        if (at + bytes > this.bytes.length) {
            throw new RangeError("Read past the end of a message: " + bytes + " bytes wanted at " + at + " of " + this.bytes.length + ".");
        }
        this.offset = at + bytes;
        return at;
    }
}
