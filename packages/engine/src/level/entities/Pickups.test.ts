import { describe, expect, it } from "vitest";
import { DefaultPickupValue, IsPickupValue, PickupKinds } from "./Pickups";

const WEAPON = { icon: "weapon_axe", shot: { sprite: "weapon_throwing_axe", speed: 5, damage: 2, cooldown: 0.4, range: 8 } };
const TORCH = { brightness: 1, tint: 0xffc780, range: 7, flicker: 0.15 };

describe("IsPickupValue", () => {
    it("accepts each kind with what it needs", () => {
        expect(IsPickupValue({ kind: "gold", amount: 10 })).toBe(true);
        expect(IsPickupValue({ kind: "health", amount: 2 })).toBe(true);
        expect(IsPickupValue({ kind: "key", id: 3 })).toBe(true);
        expect(IsPickupValue({ kind: "key", id: 0 })).toBe(true);
        expect(IsPickupValue({ kind: "weapon", weapon: WEAPON })).toBe(true);
        expect(IsPickupValue({ kind: "weapon", weapon: { ...WEAPON, shot: { ...WEAPON.shot, spriteAngle: -1.57 } } })).toBe(true);
        expect(IsPickupValue({ kind: "item", sprite: "flask_blue" })).toBe(true);
        expect(IsPickupValue({ kind: "light", light: TORCH, seconds: 120 })).toBe(true);
    });

    it("accepts an item with no sprite - it's shown as its own tile", () => {
        expect(IsPickupValue({ kind: "item" })).toBe(true);
    });

    it("rejects what's malformed: not an object, no or unknown kind, a missing or non-finite number", () => {
        expect(IsPickupValue(true)).toBe(false);
        expect(IsPickupValue(null)).toBe(false);
        expect(IsPickupValue(3)).toBe(false);
        expect(IsPickupValue({})).toBe(false);
        expect(IsPickupValue({ kind: "chest" })).toBe(false);
        expect(IsPickupValue({ kind: "gold" })).toBe(false);
        expect(IsPickupValue({ kind: "gold", amount: "10" })).toBe(false);
        expect(IsPickupValue({ kind: "health", amount: Number.NaN })).toBe(false);
        expect(IsPickupValue({ kind: "key" })).toBe(false);
        expect(IsPickupValue({ kind: "key", id: 1.5 })).toBe(false);
        expect(IsPickupValue({ kind: "key", id: -1 })).toBe(false); // -1 is an unlocked door's lock - no key fits it
        expect(IsPickupValue({ kind: "item", sprite: 4 })).toBe(false);
    });

    it("accepts a light that burns for the rest of the level - no seconds, or 0", () => {
        expect(IsPickupValue({ kind: "light", light: TORCH })).toBe(true);
        expect(IsPickupValue({ kind: "light", light: TORCH, seconds: 0 })).toBe(true);
    });

    it("rejects a light without a whole light value, or with a negative or non-numeric burn time", () => {
        expect(IsPickupValue({ kind: "light" })).toBe(false);
        expect(IsPickupValue({ kind: "light", light: { brightness: 1, range: 7 } })).toBe(false);
        expect(IsPickupValue({ kind: "light", light: TORCH, seconds: -5 })).toBe(false);
        expect(IsPickupValue({ kind: "light", light: TORCH, seconds: "60" })).toBe(false);
    });

    it("accepts a weapon whose shot glows, and rejects one whose light is incomplete", () => {
        expect(IsPickupValue({ kind: "weapon", weapon: { ...WEAPON, shot: { ...WEAPON.shot, light: TORCH } } })).toBe(true);
        expect(IsPickupValue({ kind: "weapon", weapon: { ...WEAPON, shot: { ...WEAPON.shot, light: { range: 3 } } } })).toBe(false);
    });

    it("rejects a weapon without its icon, its shot, or a number in it", () => {
        expect(IsPickupValue({ kind: "weapon" })).toBe(false);
        expect(IsPickupValue({ kind: "weapon", weapon: { icon: "x" } })).toBe(false);
        expect(IsPickupValue({ kind: "weapon", weapon: { ...WEAPON, icon: undefined } })).toBe(false);
        expect(IsPickupValue({ kind: "weapon", weapon: { ...WEAPON, shot: { ...WEAPON.shot, damage: "2" } } })).toBe(false);
        expect(IsPickupValue({ kind: "weapon", weapon: { ...WEAPON, shot: { ...WEAPON.shot, cooldown: undefined } } })).toBe(false);
    });

    it("tells a pickup apart from a light, a spawner, a door lock and a plain number - the other things a tile's data can be", () => {
        expect(IsPickupValue({ brightness: 1, tint: 0, range: 5 })).toBe(false);
        expect(IsPickupValue({ monsters: ["imp"], interval: 1 })).toBe(false);
        expect(IsPickupValue({ lock: 3 })).toBe(false);
        expect(IsPickupValue(7)).toBe(false);
    });
});

describe("DefaultPickupValue", () => {
    it("is valid for every kind but a weapon, whose sprites are the game's to name", () => {
        PickupKinds.filter(kind => kind !== "weapon").forEach(kind => {
            const value = DefaultPickupValue(kind);
            expect(value.kind).toBe(kind);
            expect(IsPickupValue(value), kind).toBe(true);
        });
        expect(DefaultPickupValue("weapon").kind).toBe("weapon");
    });

    it("is gold when no kind is asked for, and hands out fresh objects each time", () => {
        expect(DefaultPickupValue()).toEqual({ kind: "gold", amount: 1 });
        expect(DefaultPickupValue()).not.toBe(DefaultPickupValue());
    });

    it("lists the kinds in the order the popup offers them", () => {
        expect(PickupKinds).toEqual(["gold", "health", "key", "weapon", "item", "light"]);
    });
});
