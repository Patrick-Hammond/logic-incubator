import { describe, expect, it } from "vitest";
import { AddKey, CanOpen, CreateKeyRing, IsLocked, NoLock } from "./Keys";

describe("KeyRing", () => {
    it("starts empty, so only an unlocked door opens", () => {
        const ring = CreateKeyRing();
        expect(ring.keys).toEqual([]);
        expect(CanOpen(ring, NoLock)).toBe(true);
        expect(CanOpen(ring, 1)).toBe(false);
        expect(CanOpen(ring, 0)).toBe(false);
    });

    it("opens an unlocked door with or without keys", () => {
        const empty = CreateKeyRing();
        const holding = CreateKeyRing();
        AddKey(holding, 3);
        [empty, holding].forEach(ring => {
            expect(CanOpen(ring, NoLock)).toBe(true);
            expect(CanOpen(ring, -1)).toBe(true);
        });
    });

    it("opens a locked door only for a key with its id", () => {
        const ring = CreateKeyRing();
        AddKey(ring, 2, "key_gold");
        expect(CanOpen(ring, 2)).toBe(true);
        expect(CanOpen(ring, 1)).toBe(false);
        expect(CanOpen(ring, 3)).toBe(false);
        AddKey(ring, 3);
        expect(CanOpen(ring, 3)).toBe(true);
    });

    it("has no key that opens everything - not one with a big id, or the id an unlocked door has", () => {
        const ring = CreateKeyRing();
        AddKey(ring, 9999);
        AddKey(ring, NoLock);
        [0, 1, 2, 99].forEach(lock => expect(CanOpen(ring, lock), String(lock)).toBe(false));
    });

    it("counts id 0 as a real lock and a real key", () => {
        const ring = CreateKeyRing();
        expect(CanOpen(ring, 0)).toBe(false);
        AddKey(ring, 0);
        expect(CanOpen(ring, 0)).toBe(true);
        expect(CanOpen(ring, 1)).toBe(false);
    });

    it("counts a key held twice once, and says whether the key was new", () => {
        const ring = CreateKeyRing();
        expect(AddKey(ring, 4, "key_a")).toBe(true);
        expect(AddKey(ring, 4, "key_b")).toBe(false);
        expect(ring.keys).toEqual([{ id: 4, sprite: "key_a" }]);
    });

    it("remembers how a key is shown, or that it has no picture", () => {
        const ring = CreateKeyRing();
        AddKey(ring, 1, "key_gold");
        AddKey(ring, 2);
        expect(ring.keys.map(key => key.sprite)).toEqual(["key_gold", null]);
    });
});

describe("locks", () => {
    it("are unlocked at -1 (and below) and locked from 0 up", () => {
        expect(NoLock).toBe(-1);
        expect(IsLocked(NoLock)).toBe(false);
        expect(IsLocked(-5)).toBe(false);
        expect(IsLocked(0)).toBe(true);
        expect(IsLocked(7)).toBe(true);
    });
});
