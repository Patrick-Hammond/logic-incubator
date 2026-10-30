import { describe, expect, it } from "vitest";
import { DataBrushName } from "@logic-incubator/engine/level/LevelFormat";
import { DescribeBoss, DescribeDataValue, DescribeDialog, DescribeLock, DescribePickup, DescribeSpawner, MapLabel, PickupLabel, UnpairedPortalCells } from "./DataLabels";

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
        expect(MapLabel({ portal: 3 })).toBe("P3");
        expect(MapLabel({ portal: 12, arrivalOnly: true })).toBe("A12");
    });

    it("finds the portals that go nowhere - their id no other portal's - for the map to mark", () => {
        const at = (x: number, portal: number, arrivalOnly = false) => ({
            name: DataBrushName.TELEPORT,
            position: { x, y: 4 },
            pixelOffset: { x: 0, y: 0 },
            rotation: 0,
            scale: { x: 1, y: 1 },
            layerId: -99999,
            data: arrivalOnly ? { portal, arrivalOnly } : { portal }
        });
        expect(UnpairedPortalCells([at(1, 1), at(2, 1), at(3, 2), at(4, 3, true)])).toEqual(new Set(["3,4"]));
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

    it("tags an NPC's dialog D and a boss B - and a pickup or boss that counts for a quest with a Q after", () => {
        expect(MapLabel({ script: "MINER: Hello." })).toBe("D");
        expect(MapLabel({ monster: "ogre" })).toBe("B");
        expect(MapLabel({ monster: "ogre", hitPoints: 40, quest: "demon" })).toBe("BQ");
        expect(MapLabel({ kind: "gold", amount: 10, quest: "gold" })).toBe("G10Q");
        expect(MapLabel({ kind: "key", id: 3, quest: "gold" })).toBe("K3Q");
    });

    it("is empty for no value", () => {
        expect(MapLabel(null)).toBe("");
        expect(MapLabel(undefined)).toBe("");
        expect(MapLabel({} as never)).toBe("");
    });
});

describe("DescribePickup, DescribeBoss, DescribeDialog and DescribeLock", () => {
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

    it("say which quest a pickup counts for", () => {
        expect(DescribePickup({ kind: "gold", amount: 10, quest: "hoard" })).toBe("10 gold · quest hoard");
    });

    it("say a boss and a dialog in a few words", () => {
        expect(DescribeBoss({ monster: "big_demon", hitPoints: 120, quest: "demon" })).toBe("big demon · 120 hit points · quest demon");
        expect(DescribeBoss({ monster: "ogre" })).toBe("ogre · its own hit points");
        expect(DescribeDialog("# a comment\nMINER: Rats!\n> Go.\n")).toBe("“MINER: Rats!” · 2 lines");
        expect(DescribeDialog("MINER: Hello.")).toBe("“MINER: Hello.”");
        expect(DescribeDialog("  \n# just this\n")).toBe("says nothing");
        expect(DescribeDialog("MINER: Rats!\n\nshout: # when a hero's near\nHelp, help!")).toBe("“MINER: Rats!” · 3 lines · shouts");
        expect(DescribeDialog("shout:\nOh dear, where did I put it?!")).toBe("“Oh dear, where did I put it?!” · 2 lines · shouts");
    });

    it("says what a door's lock needs", () => {
        expect(DescribeLock(-1)).toBe("unlocked");
        expect(DescribeLock(0)).toBe("needs key 0");
        expect(DescribeLock(3)).toBe("needs key 3");
    });
});

describe("DescribeDataValue", () => {
    it("puts any value in a few words, with a light's tint beside them", () => {
        expect(DescribeDataValue(3)).toEqual({ text: "3" });
        expect(DescribeDataValue({ kind: "gold", amount: 10 })).toEqual({ text: "10 gold" });
        expect(DescribeDataValue({ script: "Hello there" })).toEqual({ text: "“Hello there”" });
        expect(DescribeDataValue(TORCH)).toEqual({ text: "1 bright · 7 tiles", colour: 0xffc780 });
        expect(DescribeDataValue({ lock: 2 })).toEqual({ text: "needs key 2" });
        expect(DescribeDataValue({ portal: 4 })).toEqual({ text: "portal 4" });
        expect(DescribeDataValue({ portal: 4, arrivalOnly: true })).toEqual({ text: "portal 4 · arrival only" });
        expect(DescribeDataValue({ monsters: ["big_demon"], interval: 4, maxAlive: 2, total: 0, activationRange: 10, hitPoints: 10 })).toEqual({ text: "big demon · every 4s · max 2" });
    });

    it("has nothing to say about no value", () => {
        expect(DescribeDataValue(null)).toEqual({ text: "" });
        expect(DescribeDataValue(undefined)).toEqual({ text: "" });
    });

    it("counts a spawner's monster types when it has several", () => {
        expect(DescribeSpawner({ monsters: ["imp", "goblin"], interval: 2, maxAlive: 5, total: 0, activationRange: 10, hitPoints: 10 })).toBe("2 types · every 2s · max 5");
    });
});
