import { describe, expect, it } from "vitest";
import { Rgb, Rgba } from "./Colour";
import { ClearRecovery, ParseRecovery, PeekRecovery, Recovery, RecoveryKey, RecoveryMaxAgeMs, SerializeRecovery, SpriteOrigin, TakeRecovery, WriteRecovery } from "./Recovery";
import { StorageLike } from "./Resume";
import { SpriteState } from "./SpriteDocument";

class MemoryStorage implements StorageLike {
    data: { [key: string]: string } = {};
    getItem(key: string) {
        return key in this.data ? this.data[key] : null;
    }
    setItem(key: string, value: string) {
        this.data[key] = value;
    }
    removeItem(key: string) {
        delete this.data[key];
    }
}
const FULL: StorageLike = {
    getItem: () => null,
    setItem() {
        throw new Error("QuotaExceededError");
    },
    removeItem() {
        throw new Error("blocked");
    }
};

const CLEAR: Rgba = { r: 0, g: 0, b: 0, a: 0 };
const origin = (extra: Partial<SpriteOrigin> = {}): SpriteOrigin => ({ bundle: "global", name: "gem", mode: "create", sheet: "user", category: "items", applied: false, ...extra });

function Make(extra: Partial<Recovery> = {}): Recovery {
    const state: SpriteState = {
        width: 3,
        height: 2,
        palette: [CLEAR, Rgb(255, 0, 0), Rgb(1, 2, 3, 77)],
        frames: [
            { width: 3, height: 2, data: Uint8Array.from([0, 1, 2, 2, 1, 0]) },
            { width: 3, height: 2, data: Uint8Array.from([1, 1, 1, 0, 0, 0]) }
        ]
    };
    return { origin: origin(), state, frameIndex: 1, dirty: true, ...extra };
}

describe("a snapshot", () => {
    it("comes back as it went: pictures, palette with alpha, origin, frame, unsaved flag", () => {
        const back = ParseRecovery(SerializeRecovery(Make({ origin: origin({ mode: "overwrite", copyMetaFrom: "crate", applied: true }) }), 1000), 1500);
        expect(back).not.toBeNull();
        expect(back.origin).toEqual(origin({ mode: "overwrite", copyMetaFrom: "crate", applied: true }));
        expect(back.state.width).toBe(3);
        expect(back.state.palette).toEqual([CLEAR, Rgb(255, 0, 0), Rgb(1, 2, 3, 77)]);
        expect(back.state.frames.map(f => Array.from(f.data))).toEqual([[0, 1, 2, 2, 1, 0], [1, 1, 1, 0, 0, 0]]);
        expect(back.frameIndex).toBe(1);
        expect(back.dirty).toBe(true);
    });

    it("round-trips a big full-palette sprite exactly", () => {
        const palette: Rgba[] = Array.from({ length: 256 }, (_, i) => Rgb(i, 255 - i, (i * 7) & 255, i === 0 ? 0 : 255));
        const data = new Uint8Array(64 * 64);
        for (let i = 0; i < data.length; i++) data[i] = (i * 31) & 255;
        const recovery = Make({ state: { width: 64, height: 64, palette, frames: [{ width: 64, height: 64, data }] }, frameIndex: 0 });
        const back = ParseRecovery(SerializeRecovery(recovery, 1), 2);
        expect(back.state.palette).toEqual(palette);
        expect(Array.from(back.state.frames[0].data)).toEqual(Array.from(data));
    });

    it("leaves out copyMetaFrom and buildFrom when there weren't any", () => {
        const back = ParseRecovery(SerializeRecovery(Make(), 1), 2);
        expect(back.origin.copyMetaFrom).toBeUndefined();
        expect(back.origin.buildFrom).toBeUndefined();
    });

    it("keeps how many frames the sprite has in the assets, and drops a nonsense count", () => {
        expect(ParseRecovery(SerializeRecovery(Make({ origin: origin({ savedFrames: 4 }) }), 1), 2).origin.savedFrames).toBe(4);
        expect(ParseRecovery(SerializeRecovery(Make({ origin: origin({ savedFrames: 0 }) }), 1), 2).origin.savedFrames).toBe(0);
        expect(ParseRecovery(SerializeRecovery(Make(), 1), 2).origin.savedFrames).toBeUndefined();
        expect(ParseRecovery(SerializeRecovery(Make({ origin: origin({ savedFrames: 9999 }) }), 1), 2).origin.savedFrames).toBeUndefined();
        expect(ParseRecovery(SerializeRecovery(Make({ origin: origin({ savedFrames: -1 }) }), 1), 2).origin.savedFrames).toBeUndefined();
    });

    it("keeps the hash the pending rebuild is waited against", () => {
        const back = ParseRecovery(SerializeRecovery(Make({ origin: origin({ applied: true, buildFrom: "abc123" }) }), 1), 2);
        expect(back.origin).toMatchObject({ applied: true, buildFrom: "abc123" });
    });

    it("is ignored when stale or from the future", () => {
        const text = SerializeRecovery(Make(), 1000);
        expect(ParseRecovery(text, 1000 + RecoveryMaxAgeMs)).not.toBeNull();
        expect(ParseRecovery(text, 1000 + RecoveryMaxAgeMs + 1)).toBeNull();
        expect(ParseRecovery(text, 1000 - RecoveryMaxAgeMs - 1)).toBeNull();
    });

    it("is ignored when it isn't JSON, or isn't a sound sprite", () => {
        const good = JSON.parse(SerializeRecovery(Make(), 5));
        const bad = (change: (r: any) => void) => {
            const copy = JSON.parse(JSON.stringify(good));
            change(copy);
            return ParseRecovery(JSON.stringify(copy), 6);
        };
        expect(ParseRecovery("junk", 6)).toBeNull();
        expect(ParseRecovery("null", 6)).toBeNull();
        expect(ParseRecovery("{}", 6)).toBeNull();
        expect(bad(r => delete r.at)).toBeNull();
        expect(bad(r => (r.origin.bundle = ""))).toBeNull();
        expect(bad(r => (r.origin.mode = "append"))).toBeNull();
        expect(bad(r => delete r.origin)).toBeNull();
        expect(bad(r => (r.width = 0))).toBeNull();
        expect(bad(r => (r.height = 513))).toBeNull();
        expect(bad(r => (r.width = 2.5))).toBeNull();
        expect(bad(r => (r.palette = []))).toBeNull();
        expect(bad(r => (r.palette = new Array(257).fill("#000000ff")))).toBeNull();
        expect(bad(r => (r.palette[1] = "nope"))).toBeNull();
        expect(bad(r => (r.frames = []))).toBeNull();
        expect(bad(r => (r.frames = new Array(101).fill(r.frames[0])))).toBeNull();
        expect(bad(r => (r.frames[0] = "AAAA"))).toBeNull(); // the wrong length
        expect(bad(r => (r.frames[0] = "!!!"))).toBeNull();
        expect(bad(r => (r.frames[1] = 5))).toBeNull();
    });

    it("is ignored when a pixel points past the palette", () => {
        const recovery = Make();
        recovery.state.frames[0].data[0] = 9;
        expect(ParseRecovery(SerializeRecovery(recovery, 1), 2)).toBeNull();
    });

    it("clamps a frame index that's out of range, and treats a missing one as the first", () => {
        expect(ParseRecovery(SerializeRecovery(Make({ frameIndex: 99 }), 1), 2).frameIndex).toBe(1);
        expect(ParseRecovery(SerializeRecovery(Make({ frameIndex: -4 }), 1), 2).frameIndex).toBe(0);
        const raw = JSON.parse(SerializeRecovery(Make(), 1));
        delete raw.frameIndex;
        expect(ParseRecovery(JSON.stringify(raw), 2).frameIndex).toBe(0);
    });
});

describe("keeping it across the reload", () => {
    it("is written and taken once", () => {
        const storage = new MemoryStorage();
        expect(WriteRecovery(storage, Make(), 1000)).toBe(true);
        expect(TakeRecovery(storage, 1200)).not.toBeNull();
        expect(TakeRecovery(storage, 1200)).toBeNull();
        expect(storage.data[RecoveryKey]).toBeUndefined();
    });

    it("can be looked at without being taken", () => {
        const storage = new MemoryStorage();
        WriteRecovery(storage, Make(), 1000);
        expect(PeekRecovery(storage, 1100)).not.toBeNull();
        expect(PeekRecovery(storage, 1100)).not.toBeNull();
        expect(TakeRecovery(storage, 1100)).not.toBeNull();
        expect(PeekRecovery(storage, 1100)).toBeNull();
    });

    it("is cleared when the window closes on purpose", () => {
        const storage = new MemoryStorage();
        WriteRecovery(storage, Make(), 1000);
        ClearRecovery(storage);
        expect(PeekRecovery(storage, 1001)).toBeNull();
        ClearRecovery(storage);
    });

    it("removes a stale or damaged snapshot when taken, but not when only peeked at", () => {
        const storage = new MemoryStorage();
        WriteRecovery(storage, Make(), 1000);
        expect(PeekRecovery(storage, 1000 + RecoveryMaxAgeMs + 5)).toBeNull();
        expect(storage.data[RecoveryKey]).toBeDefined();
        expect(TakeRecovery(storage, 1000 + RecoveryMaxAgeMs + 5)).toBeNull();
        expect(storage.data[RecoveryKey]).toBeUndefined();
        storage.data[RecoveryKey] = "junk";
        expect(TakeRecovery(storage, 1)).toBeNull();
        expect(storage.data[RecoveryKey]).toBeUndefined();
    });

    it("copes with no storage, or storage that's full or blocked", () => {
        expect(WriteRecovery(null, Make())).toBe(false);
        expect(WriteRecovery(FULL, Make())).toBe(false);
        expect(TakeRecovery(null)).toBeNull();
        expect(PeekRecovery(FULL)).toBeNull();
        expect(() => ClearRecovery(FULL)).not.toThrow();
        expect(() => ClearRecovery(null)).not.toThrow();
    });
});
