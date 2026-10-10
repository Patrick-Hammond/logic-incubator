import { describe, expect, it } from "vitest";
import { DescribeLock, DescribePickup, MapLabel, PickupLabel } from "./DataLabels";

const WEAPON = { icon: "weapon_axe", shot: { sprite: "weapon_throwing_axe", speed: 5, damage: 2, cooldown: 0.4, range: 8 } };
const TORCH = { brightness: 1, tint: 0xffc780, range: 7 };

describe("PickupLabel", () => {
    it("is the kind's letter and its number", () => {
        expect(PickupLabel({ kind: "gold", amount: 10 })).toBe("G10");
        expect(PickupLabel({ kind: "health", amount: 2 })).toBe("H2");
        expect(PickupLabel({ kind: "key", id: 3 })).toBe("K3");
        expect(PickupLabel({ kind: "key", id: 0 })).toBe("K0");
        expect(PickupLabel({ kind: "weapon", weapon: WEAPON })).toBe("W");
        expect(PickupLabel({ kind: "item", sprite: "flask_blue" })).toBe("I");
        expect(PickupLabel({ kind: "item" })).toBe("I");
        expect(PickupLabel({ kind: "light", light: TORCH, seconds: 60 })).toBe("T");
    });

    it("only uses characters the map's bitmap font has - no + or $", () => {
        const font = /^[A-Za-z0-9.,;:?!\-_'*"\\/<>()@]*$/;
        [{ kind: "gold", amount: 5 }, { kind: "health", amount: 1 }, { kind: "key", id: 0 }, { kind: "key", id: 12 }, { kind: "item" }].forEach(pickup => {
            expect(PickupLabel(pickup as never)).toMatch(font);
        });
    });
});

describe("MapLabel", () => {
    it("labels each kind of data value the way the map always has, and the new ones", () => {
        expect(MapLabel(3)).toBe("3");
        expect(MapLabel(-2)).toBe("-2");
        expect(MapLabel(0)).toBe("0");
        expect(MapLabel({ brightness: 1, tint: 0xff8100, range: 5.5 })).toBe("5.5");
        expect(MapLabel({ monsters: ["imp", "ogre"], interval: 3, maxAlive: 4, total: 0, activationRange: 10, hitPoints: 10 })).toBe("2");
        expect(MapLabel({ kind: "gold", amount: 10 })).toBe("G10");
        expect(MapLabel({ lock: 3 })).toBe("L3");
        expect(MapLabel({ lock: 0 })).toBe("L0");
    });

    it("says nothing for an unlocked door - every door by default, so a tag on each would be noise", () => {
        expect(MapLabel({ lock: -1 })).toBe("");
    });

    it("tells a weapon pickup from a light, though a weapon's shot has a range of its own", () => {
        expect(MapLabel({ kind: "weapon", weapon: WEAPON })).toBe("W");
    });

    it("tells a light to carry from a light on the map", () => {
        expect(MapLabel({ kind: "light", light: TORCH })).toBe("T");
    });

    it("is empty for no value", () => {
        expect(MapLabel(null)).toBe("");
        expect(MapLabel(undefined)).toBe("");
        expect(MapLabel({} as never)).toBe("");
    });
});

describe("DescribePickup and DescribeLock", () => {
    it("say each pickup in a few words", () => {
        expect(DescribePickup({ kind: "gold", amount: 10 })).toBe("10 gold");
        expect(DescribePickup({ kind: "health", amount: 2 })).toBe("2 hit points");
        expect(DescribePickup({ kind: "key", id: 3 })).toBe("key 3");
        expect(DescribePickup({ kind: "weapon", weapon: WEAPON })).toBe("weapon: weapon_axe");
        expect(DescribePickup({ kind: "item", sprite: "flask_blue" })).toBe("item: flask_blue");
        expect(DescribePickup({ kind: "item" })).toMatch(/its own sprite/);
        expect(DescribePickup({ kind: "light", light: TORCH, seconds: 90 })).toBe("a light to carry, 90 s");
        expect(DescribePickup({ kind: "light", light: TORCH })).toBe("a light to carry");
    });

    it("says what a door's lock needs", () => {
        expect(DescribeLock(-1)).toBe("unlocked");
        expect(DescribeLock(0)).toBe("needs key 0");
        expect(DescribeLock(3)).toBe("needs key 3");
    });
});
