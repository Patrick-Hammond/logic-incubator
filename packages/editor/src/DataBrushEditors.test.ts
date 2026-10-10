import { describe, expect, it } from "vitest";
import { TEST_MONSTERS } from "@logic-incubator/engine/level/__fixtures__/TestMonsters";
import MonsterRoster from "@logic-incubator/engine/level/entities/MonsterRoster";
import { DefaultPickupValue, IsPickupValue, PickupKinds, PickupValue } from "@logic-incubator/engine/level/entities/Pickups";
import { DefaultSpawnerValue } from "@logic-incubator/engine/level/entities/Spawners";
import { DataBrushName } from "@logic-incubator/engine/level/LevelFormat";
import { DataBrushEditorFor } from "./DataBrushEditors";
import { IsFieldVisible } from "./ui/dialog/FormDialog";

MonsterRoster.inst.Load(TEST_MONSTERS);

const noImages = { monster: () => undefined, hasSprite: () => true };

describe("DataBrushEditors", () => {
    it("only offers an editor for a value the game reads - collision and player-start have none, light and spawner keep theirs though neither is a paintable data brush any more", () => {
        expect(DataBrushEditorFor("spawner")).toBeDefined();
        expect(DataBrushEditorFor("light")).toBeDefined();
        expect(DataBrushEditorFor(DataBrushName.Z_INDEX)).toBeDefined();
        expect(DataBrushEditorFor(DataBrushName.PICKUP)).toBeDefined();
        expect(DataBrushEditorFor("door")).toBeDefined();
        expect(DataBrushEditorFor(DataBrushName.COLLISION)).toBeUndefined();
        expect(DataBrushEditorFor(DataBrushName.PLAYER_START)).toBeUndefined();
    });

    it("round-trips a spawner through the form", () => {
        const editor = DataBrushEditorFor("spawner");
        const value = { monsters: ["imp", "ogre"], interval: 2.5, maxAlive: 6, total: 0, activationRange: 0, hitPoints: 20 };
        expect(editor.fromForm(editor.toForm(value as never))).toEqual(value);
    });

    it("lists every monster type in the spawner dialog, and refuses an empty pool", () => {
        const editor = DataBrushEditorFor("spawner");
        const monsters = editor.fields(noImages).find(f => f.key === "monsters");
        expect(monsters.type === "multi-choice" && monsters.options.map(o => o.value)).toEqual([...TEST_MONSTERS.types]);
        expect(editor.validate({ ...editor.toForm(DefaultSpawnerValue()), monsters: [] })).toMatch(/at least one/);
        expect(editor.validate(editor.toForm(DefaultSpawnerValue()))).toBeNull();
    });

    it("gives every form field a value, so no control starts blank", () => {
        ["spawner", "light", DataBrushName.Z_INDEX, DataBrushName.PICKUP, "door"].forEach(name => {
            const editor = DataBrushEditorFor(name);
            const form = editor.toForm(0);
            editor.fields(noImages).forEach(field => expect(form, `${name}.${field.key}`).toHaveProperty(field.key));
        });
    });

    it("saves a light with no flicker as a steady one, without the field", () => {
        const light = DataBrushEditorFor("light");
        expect(light.fromForm({ ...light.toForm({ brightness: 1, tint: 0xffffff, range: 5, flicker: 0.2 }), lightFlicker: 0 })).toEqual({ brightness: 1, tint: 0xffffff, range: 5 });
    });

    it("round-trips a light and a height", () => {
        const light = DataBrushEditorFor("light");
        const value = { brightness: 0.8, tint: 0x123456, range: 7.5 };
        expect(light.fromForm(light.toForm(value))).toEqual(value);
        const torch = { brightness: 1, tint: 0xffc780, range: 15, flicker: 0.15 };
        expect(light.fromForm(light.toForm(torch))).toEqual(torch);
        const height = DataBrushEditorFor(DataBrushName.Z_INDEX);
        expect(height.fromForm(height.toForm(-3))).toBe(-3);
    });
});


const pickup = DataBrushEditorFor(DataBrushName.PICKUP);
const WEAPON: PickupValue = { kind: "weapon", weapon: { icon: "weapon_axe", shot: { sprite: "weapon_throwing_axe", speed: 5, damage: 2, cooldown: 0.4, range: 8 } } };
const GLOWING: PickupValue = { kind: "weapon", weapon: { icon: "weapon_axe", shot: { sprite: "weapon_throwing_axe", speed: 5, damage: 2, cooldown: 0.4, range: 8, light: { brightness: 0.8, tint: 0xff6020, range: 4, flicker: 0.2 } } } };
const TORCH: PickupValue = { kind: "light", light: { brightness: 1, tint: 0xffc780, range: 7, flicker: 0.15 }, seconds: 90 };
const ANGLED: PickupValue = { kind: "weapon", weapon: { icon: "weapon_bow", shot: { sprite: "weapon_arrow", speed: 6, damage: 1, cooldown: 0.2, range: 12, spriteAngle: -Math.PI / 2 } } };
const visibleKeys = (form: ReturnType<typeof pickup.toForm>) =>
    pickup.fields(noImages).filter(field => IsFieldVisible(field, form)).map(field => field.key);

describe("the pickup editor", () => {
    it("round-trips every kind through the form", () => {
        const values: PickupValue[] = [
            { kind: "gold", amount: 25 },
            { kind: "health", amount: 4 },
            { kind: "key", id: 7 },
            { kind: "key", id: 0 },
            WEAPON,
            { kind: "item", sprite: "flask_blue" },
            { kind: "item" },
            GLOWING,
            TORCH,
            { kind: "light", light: { brightness: 0.5, tint: 0xffffff, range: 4 }, seconds: 0 }
        ];
        values.forEach(value => expect(pickup.fromForm(pickup.toForm(value)), JSON.stringify(value)).toEqual(value));
    });

    it("gives a weapon's shot a light only when asked", () => {
        const plain = pickup.fromForm(pickup.toForm(WEAPON)) as PickupValue;
        expect(plain.kind === "weapon" && "light" in plain.weapon.shot).toBe(false);
        const dimmed = pickup.fromForm({ ...pickup.toForm(GLOWING), shotGlows: false }) as PickupValue;
        expect(dimmed.kind === "weapon" && "light" in dimmed.weapon.shot).toBe(false);
    });

    it("never lets a light burn for a negative time", () => {
        expect(pickup.fromForm({ ...pickup.toForm(TORCH), carriedSeconds: -10 })).toEqual({ ...TORCH, seconds: 0 });
    });

    it("makes a weapon's shot turn to face its flight only when asked, in degrees", () => {
        const upright = pickup.fromForm({ ...pickup.toForm(WEAPON), shotTurns: false }) as PickupValue;
        expect(upright.kind === "weapon" && "spriteAngle" in upright.weapon.shot).toBe(false);

        const turning = pickup.fromForm({ ...pickup.toForm(WEAPON), shotTurns: true, shotAngle: -90 }) as PickupValue;
        expect(turning.kind === "weapon" && turning.weapon.shot.spriteAngle).toBeCloseTo(-Math.PI / 2, 10);

        const form = pickup.toForm(ANGLED);
        expect(form.shotTurns).toBe(true);
        expect(form.shotAngle).toBe(-90);
    });

    it("always produces a valid pickup, whatever kind and numbers are in the form", () => {
        PickupKinds.filter(kind => kind !== "weapon").forEach(kind => {
            const value = pickup.fromForm({ ...pickup.toForm(DefaultPickupValue(kind)), kind });
            expect(IsPickupValue(value), kind).toBe(true);
        });
        expect(IsPickupValue(pickup.fromForm(pickup.toForm(WEAPON)))).toBe(true);
    });

    it("starts a value that isn't a pickup - the data brush's first use, or a hand-edited one - as gold", () => {
        expect(pickup.fromForm(pickup.toForm(0))).toEqual({ kind: "gold", amount: 1 });
        expect(pickup.fromForm(pickup.toForm({ kind: "chest" } as never))).toEqual({ kind: "gold", amount: 1 });
    });

    it("makes a key from just its id - 0 is a real id - with no master-key option", () => {
        const key = pickup.toForm({ kind: "key", id: 4 });
        expect(key.keyId).toBe(4);
        expect(key).not.toHaveProperty("master");
        expect(pickup.fromForm({ ...key, keyId: 9 })).toEqual({ kind: "key", id: 9 });
        expect(pickup.fromForm({ ...key, keyId: 0 })).toEqual({ kind: "key", id: 0 });
        expect(pickup.fromForm(pickup.toForm({ kind: "key", id: 0 }))).toEqual({ kind: "key", id: 0 });
    });

    it("never makes a key with a negative id - -1 is an unlocked door's lock, no key fits it - or a negative amount", () => {
        expect(pickup.fromForm({ ...pickup.toForm({ kind: "key", id: 1 }), keyId: -5 })).toEqual({ kind: "key", id: 0 });
        expect(pickup.fromForm({ ...pickup.toForm({ kind: "key", id: 1 }), keyId: -1 })).toEqual({ kind: "key", id: 0 });
        expect(pickup.fromForm({ ...pickup.toForm({ kind: "gold", amount: 1 }), goldAmount: -5 })).toEqual({ kind: "gold", amount: 0 });
    });

    it("treats a stale key with a negative id (the old master key) as no pickup at all, so the popup starts from gold", () => {
        expect(pickup.fromForm(pickup.toForm({ kind: "key", id: -1 }))).toEqual({ kind: "gold", amount: 1 });
    });

    it("shows only the fields of the chosen kind", () => {
        expect(visibleKeys(pickup.toForm({ kind: "gold", amount: 1 }))).toEqual(["kind", "goldAmount"]);
        expect(visibleKeys(pickup.toForm({ kind: "health", amount: 2 }))).toEqual(["kind", "healthAmount"]);
        expect(visibleKeys(pickup.toForm({ kind: "key", id: 3 }))).toEqual(["kind", "keyId"]);
        expect(visibleKeys(pickup.toForm({ kind: "item" }))).toEqual(["kind", "itemSprite"]);
        expect(visibleKeys(pickup.toForm(WEAPON))).toEqual(["kind", "weaponIcon", "shotSprite", "shotDamage", "shotSpeed", "shotRange", "shotCooldown", "shotTurns", "shotGlows"]);
        expect(visibleKeys({ ...pickup.toForm(WEAPON), shotTurns: true })).toContain("shotAngle");
        expect(visibleKeys(pickup.toForm(GLOWING))).toEqual(expect.arrayContaining(["shotLightBrightness", "shotLightTint", "shotLightRange", "shotLightFlicker"]));
        expect(visibleKeys(pickup.toForm(TORCH))).toEqual(["kind", "carriedBrightness", "carriedTint", "carriedRange", "carriedFlicker", "carriedSeconds"]);
    });

    it("offers every kind, in order, as the choice", () => {
        const kind = pickup.fields(noImages).find(field => field.key === "kind");
        expect(kind.type === "choice" && kind.options.map(option => option.value)).toEqual([...PickupKinds]);
    });

    it("wants a weapon's two sprites named, and in the sheet", () => {
        const form = pickup.toForm(WEAPON);
        expect(pickup.validate(form, noImages)).toBeNull();
        expect(pickup.validate({ ...form, weaponIcon: " " }, noImages)).toMatch(/Name the sprite the HUD shows/);
        expect(pickup.validate({ ...form, shotSprite: "" }, noImages)).toMatch(/Name the sprite the shot/);
        const sheet = { ...noImages, hasSprite: (name: string) => name === "weapon_axe" };
        expect(pickup.validate(form, sheet)).toMatch(/“weapon_throwing_axe” isn't a sprite/);
        expect(pickup.validate(form, { ...noImages, hasSprite: () => false })).toMatch(/isn't a sprite/);
    });

    it("lets an item's sprite be blank, but not one that isn't in the sheet", () => {
        const sheet = { ...noImages, hasSprite: (name: string) => name === "flask_blue" };
        expect(pickup.validate(pickup.toForm({ kind: "item" }), sheet)).toBeNull();
        expect(pickup.validate(pickup.toForm({ kind: "item", sprite: "flask_blue" }), sheet)).toBeNull();
        expect(pickup.validate(pickup.toForm({ kind: "item", sprite: "nope" }), sheet)).toMatch(/“nope” isn't a sprite/);
    });

    it("doesn't check the fields of a kind that isn't chosen", () => {
        const form = { ...pickup.toForm({ kind: "gold", amount: 3 }), weaponIcon: "", shotSprite: "", itemSprite: "nope" };
        expect(pickup.validate(form, { ...noImages, hasSprite: () => false })).toBeNull();
    });

    it("skips the sheet check when there's no sheet to check against", () => {
        expect(pickup.validate(pickup.toForm(WEAPON))).toBeNull();
    });
});

describe("the door editor", () => {
    const door = DataBrushEditorFor("door");

    const visible = (form: ReturnType<typeof door.toForm>) => door.fields(noImages).filter(field => IsFieldVisible(field, form)).map(field => field.key);

    it("round-trips a lock - 0 is a real one - and an unlocked door (-1)", () => {
        [{ lock: 3 }, { lock: 0 }, { lock: 120 }, { lock: -1 }].forEach(value => expect(door.fromForm(door.toForm(value)), JSON.stringify(value)).toEqual(value));
    });

    it("starts a door that has no lock set as unlocked, with 1 ready for if it's locked", () => {
        expect(door.toForm(0)).toEqual({ locked: false, lock: 1 });
        expect(door.toForm({ lock: -1 })).toEqual({ locked: false, lock: 1 });
        expect(door.fromForm(door.toForm(0))).toEqual({ lock: -1 });
    });

    it("is locked with its checkbox, to the key id typed - never negative or fractional - and unlocked without it, whatever id is left in the field", () => {
        const form = door.toForm({ lock: 4 });
        expect(form).toEqual({ locked: true, lock: 4 });
        expect(door.fromForm({ ...form, lock: 9 })).toEqual({ lock: 9 });
        expect(door.fromForm({ ...form, lock: -4 })).toEqual({ lock: 0 });
        expect(door.fromForm({ ...form, lock: 2.6 })).toEqual({ lock: 3 });
        expect(door.fromForm({ ...form, locked: false })).toEqual({ lock: -1 });
    });

    it("shows the key id only while it's locked", () => {
        expect(visible(door.toForm({ lock: -1 }))).toEqual(["locked"]);
        expect(visible(door.toForm({ lock: 4 }))).toEqual(["locked", "lock"]);
        expect(visible({ ...door.toForm({ lock: -1 }), locked: true })).toEqual(["locked", "lock"]);
    });

    it("has no master-key wording anywhere in its popup", () => {
        const text = JSON.stringify(door.fields(noImages)) + door.subtitle;
        expect(text).not.toMatch(/master/i);
    });
});
