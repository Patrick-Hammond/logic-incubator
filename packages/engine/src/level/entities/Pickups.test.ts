import { describe, expect, it } from "vitest";
import { DefaultPickupValue, IsPickupValue, PickupArea, PickupCellsReached, PickupKinds, PickupSpot } from "./Pickups";
import { FigureBox, Overlaps } from "./Projectiles";

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

describe("a pickup's quest", () => {
    it("may mark any kind for a quest, by an id one could have", () => {
        expect(IsPickupValue({ kind: "item", quest: "mushrooms" })).toBe(true);
        expect(IsPickupValue({ kind: "gold", amount: 1, quest: "gold-run" })).toBe(true);
        expect(IsPickupValue({ kind: "item", quest: "two words" })).toBe(false);
        expect(IsPickupValue({ kind: "item", quest: 7 })).toBe(false);
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

describe("PickupArea", () => {
    it("is the whole cell for a pickup with nothing drawn", () => {
        expect(PickupArea({ x: 3, y: 2 }, 16)).toEqual({ x: 48, y: 32, width: 16, height: 16 });
        expect(PickupArea({ x: 3, y: 2 }, 16, null)).toEqual({ x: 48, y: 32, width: 16, height: 16 });
    });

    it("is its sprite where it's drawn: its own size, at the cell's top-left less its pixel offset", () => {
        expect(PickupArea({ x: 3, y: 2 }, 16, { size: { width: 6, height: 7 }, pixelOffset: { x: 0, y: 0 } })).toEqual({ x: 48, y: 32, width: 6, height: 7 });
        expect(PickupArea({ x: 3, y: 2 }, 16, { size: { width: 6, height: 7 }, pixelOffset: { x: -5, y: 4 } })).toEqual({ x: 53, y: 28, width: 6, height: 7 });
    });

    it("leaves out what's see-through round the art - a flask in the middle of its tile", () => {
        const flask = { width: 16, height: 16, trim: { x: 4, y: 3, width: 8, height: 11 } };
        expect(PickupArea({ x: 3, y: 2 }, 16, { size: flask, pixelOffset: { x: 0, y: 0 } })).toEqual({ x: 52, y: 35, width: 8, height: 11 });
    });
});

describe("PickupCellsReached", () => {
    const TILE = 16;
    const FLAT = () => false;
    /** A small sprite - a coin - drawn at the top-left of cell (`x`, `y`). */
    const Coin = (x: number, y: number): PickupSpot => ({ x, y, area: PickupArea({ x, y }, TILE, { size: { width: 6, height: 7 }, pixelOffset: { x: 0, y: 0 } }) });
    /** A hero's 16x28 sprite with its feet on the one-tile box at pixel `x`, `y`, and the cell under its centre. */
    const Hero = (x: number, y: number) => ({ figure: FigureBox({ x, y }, { width: 16, height: 28 }, TILE), tile: { x: Math.floor((x + 7.5) / TILE), y: Math.floor((y + 7.5) / TILE) } });

    it("reaches a pickup any part of the sprite overlaps - the head, from the cell below", () => {
        const hero = Hero(48, 48);
        expect(hero.tile).toEqual({ x: 3, y: 3 });
        expect(PickupCellsReached(hero.figure, hero.tile, [Coin(3, 2)], FLAT)).toEqual([{ x: 3, y: 2 }]);
    });

    it("reaches one only as far as it's drawn - a pixel short is a miss", () => {
        // The coin's right edge is x 54: a sprite from 54 misses it, from 53 overlaps it.
        expect(PickupCellsReached(Hero(54, 32).figure, { x: 4, y: 2 }, [Coin(3, 2)], FLAT)).toEqual([]);
        expect(PickupCellsReached(Hero(53, 32).figure, { x: 4, y: 2 }, [Coin(3, 2)], FLAT)).toEqual([{ x: 3, y: 2 }]);
        // Its bottom edge is y 39: the head, 12 pixels over the box, overlaps it from a box at y 50, not 51.
        expect(PickupCellsReached(Hero(48, 50).figure, { x: 3, y: 3 }, [Coin(3, 2)], FLAT)).toEqual([{ x: 3, y: 2 }]);
        expect(PickupCellsReached(Hero(48, 51).figure, { x: 3, y: 3 }, [Coin(3, 2)], FLAT)).toEqual([]);
    });

    it("reaches only with the art - not the see-through top of a frame", () => {
        // A wizard's frame has ten pixels of air over their hat. A sack of gold drawn at the top of the cell above ends at y 45:
        // from right under it the frame would reach it but the hat doesn't, until they're two pixels further up.
        const wizard = { width: 16, height: 28, trim: { x: 1, y: 10, width: 15, height: 18 } };
        const sack: PickupSpot = { x: 3, y: 2, area: PickupArea({ x: 3, y: 2 }, TILE, { size: { width: 12, height: 13 }, pixelOffset: { x: 0, y: 0 } }) };
        expect(Overlaps(FigureBox({ x: 48, y: 48 }, { width: 16, height: 28 }, TILE), sack.area)).toBe(true);
        expect(PickupCellsReached(FigureBox({ x: 48, y: 48 }, wizard, TILE), { x: 3, y: 3 }, [sack], FLAT)).toEqual([]);
        expect(PickupCellsReached(FigureBox({ x: 48, y: 46 }, wizard, TILE), { x: 3, y: 3 }, [sack], FLAT)).toEqual([{ x: 3, y: 2 }]);
    });

    it("always reaches what's on the cell a hero stands on, sprite or no sprite", () => {
        // Over the right of the cell, clear of the coin at its left.
        const hero = Hero(56, 32);
        expect(hero.tile).toEqual({ x: 3, y: 2 });
        expect(PickupCellsReached(hero.figure, hero.tile, [Coin(3, 2)], FLAT)).toEqual([{ x: 3, y: 2 }]);
    });

    it("reaches nothing up or down a step too high to climb, but still what's underfoot", () => {
        const ledge = (from: { x: number; y: number }, to: { x: number; y: number }) => from.y !== to.y;
        const hero = Hero(48, 48);
        expect(PickupCellsReached(hero.figure, hero.tile, [Coin(3, 2)], ledge)).toEqual([]);
        expect(PickupCellsReached(hero.figure, hero.tile, [Coin(3, 3)], ledge)).toEqual([{ x: 3, y: 3 }]);
    });

    it("names each cell once, in the order the pickups are listed", () => {
        const hero = Hero(56, 40);
        const whole = (x: number, y: number): PickupSpot => ({ x, y, area: PickupArea({ x, y }, TILE) });
        expect(PickupCellsReached(hero.figure, hero.tile, [whole(4, 2), whole(3, 2), whole(4, 2), whole(9, 9)], FLAT)).toEqual([{ x: 4, y: 2 }, { x: 3, y: 2 }]);
    });
});
