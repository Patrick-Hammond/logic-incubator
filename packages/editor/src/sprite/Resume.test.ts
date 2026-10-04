import { describe, expect, it } from "vitest";
import { PeekResumeNote, ResumeKey, ResumeMaxAgeMs, StorageLike, TakeResumeNote, WriteResumeNote } from "./Resume";

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

const BLOCKED: StorageLike = {
    getItem() {
        throw new Error("blocked");
    },
    setItem() {
        throw new Error("blocked");
    },
    removeItem() {
        throw new Error("blocked");
    }
};

describe("resume notes", () => {
    it("are written once and taken once", () => {
        const storage = new MemoryStorage();
        expect(WriteResumeNote(storage, { bundle: "global", name: "brick", category: "Walls" }, 1000)).toBe(true);
        expect(TakeResumeNote(storage, 1500)).toEqual({ bundle: "global", name: "brick", category: "Walls" });
        expect(TakeResumeNote(storage, 1500)).toBeNull();
        expect(storage.data[ResumeKey]).toBeUndefined();
    });

    it("can be looked at without being taken", () => {
        const storage = new MemoryStorage();
        WriteResumeNote(storage, { bundle: "global", name: "brick" }, 1000);
        expect(PeekResumeNote(storage, 1500)).toEqual({ bundle: "global", name: "brick", category: null });
        expect(PeekResumeNote(storage, 1500)).not.toBeNull();
        expect(TakeResumeNote(storage, 1500)).not.toBeNull();
        expect(PeekResumeNote(storage, 1500)).toBeNull();
        expect(PeekResumeNote(null)).toBeNull();
        expect(PeekResumeNote(BLOCKED)).toBeNull();
    });

    it("are not reported by a peek when stale or damaged, and that doesn't remove them", () => {
        const storage = new MemoryStorage();
        WriteResumeNote(storage, { bundle: "b", name: "n" }, 1000);
        expect(PeekResumeNote(storage, 1000 + ResumeMaxAgeMs + 1)).toBeNull();
        expect(storage.data[ResumeKey]).toBeDefined();
        storage.data[ResumeKey] = "junk";
        expect(PeekResumeNote(storage, 5)).toBeNull();
        expect(storage.data[ResumeKey]).toBe("junk");
    });

    it("come back without a category if there wasn't one", () => {
        const storage = new MemoryStorage();
        WriteResumeNote(storage, { bundle: "b", name: "n" }, 1);
        expect(TakeResumeNote(storage, 2)).toEqual({ bundle: "b", name: "n", category: null });
    });

    it("are ignored - and cleared - when stale, or from the future", () => {
        const storage = new MemoryStorage();
        WriteResumeNote(storage, { bundle: "b", name: "n" }, 1000);
        expect(TakeResumeNote(storage, 1000 + ResumeMaxAgeMs + 1)).toBeNull();
        expect(storage.data[ResumeKey]).toBeUndefined();
        WriteResumeNote(storage, { bundle: "b", name: "n" }, 1000 + ResumeMaxAgeMs * 3);
        expect(TakeResumeNote(storage, 1000)).toBeNull();
    });

    it("are accepted right up to the age limit", () => {
        const storage = new MemoryStorage();
        WriteResumeNote(storage, { bundle: "b", name: "n" }, 1000);
        expect(TakeResumeNote(storage, 1000 + ResumeMaxAgeMs)).not.toBeNull();
    });

    it("are ignored when damaged, and cleared", () => {
        const storage = new MemoryStorage();
        ["junk", "null", "{}", '{"bundle":"b"}', '{"bundle":"","name":"n","at":1}', '{"bundle":"b","name":"n"}', '{"bundle":1,"name":"n","at":1}'].forEach(raw => {
            storage.data[ResumeKey] = raw;
            expect(TakeResumeNote(storage, 2), raw).toBeNull();
            expect(storage.data[ResumeKey], raw).toBeUndefined();
        });
    });

    it("do nothing with no storage, or storage that throws", () => {
        expect(WriteResumeNote(null, { bundle: "b", name: "n" })).toBe(false);
        expect(TakeResumeNote(null)).toBeNull();
        expect(WriteResumeNote(BLOCKED, { bundle: "b", name: "n" })).toBe(false);
        expect(TakeResumeNote(BLOCKED)).toBeNull();
    });
});
