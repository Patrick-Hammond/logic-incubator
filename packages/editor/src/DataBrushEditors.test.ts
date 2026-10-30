import { describe, expect, it } from "vitest";
import { TEST_MONSTERS } from "@logic-incubator/engine/level/__fixtures__/TestMonsters";
import MonsterRoster from "@logic-incubator/engine/level/entities/MonsterRoster";
import { DefaultPickupValue, IsPickupValue, PickupKinds, PickupValue } from "@logic-incubator/engine/level/entities/Pickups";
import { DefaultSpawnerValue } from "@logic-incubator/engine/level/entities/Spawners";
import { DefaultBossValue } from "@logic-incubator/engine/level/entities/Bosses";
import { DefaultDialogValue } from "@logic-incubator/engine/story/Talk";
import { DataBrushName } from "@logic-incubator/engine/level/LevelFormat";
import { DefaultLightValue } from "@logic-incubator/engine/level/Lighting";
import { DataBrushEditorFor } from "./DataBrushEditors";
import { IsFieldVisible } from "./ui/dialog/FormDialog";

MonsterRoster.inst.Load(TEST_MONSTERS);

const noImages = { monster: () => undefined, hasSprite: () => true };

describe("DataBrushEditors", () => {
    it("only offers an editor for a value the game reads - collision and player-start have none", () => {
        expect(DataBrushEditorFor(DataBrushName.SPAWNER)).toBeDefined();
        expect(DataBrushEditorFor(DataBrushName.LIGHT)).toBeDefined();
        expect(DataBrushEditorFor(DataBrushName.Z_INDEX)).toBeDefined();
        expect(DataBrushEditorFor(DataBrushName.PICKUP)).toBeDefined();
        expect(DataBrushEditorFor("door")).toBeDefined();
        expect(DataBrushEditorFor(DataBrushName.DIALOG)).toBeDefined();
        expect(DataBrushEditorFor(DataBrushName.BOSS)).toBeDefined();
        expect(DataBrushEditorFor(DataBrushName.TELEPORT)).toBeDefined();
        expect(DataBrushEditorFor(DataBrushName.COLLISION)).toBeUndefined();
        expect(DataBrushEditorFor(DataBrushName.PLAYER_START)).toBeUndefined();
    });

    it("round-trips a portal through the form - its id a whole number, arrival only saved only where it's on", () => {
        const editor = DataBrushEditorFor(DataBrushName.TELEPORT);
        expect(editor.toForm(0)).toEqual({ portal: 1, arrivalOnly: false });
        expect(editor.fromForm(editor.toForm({ portal: 7, arrivalOnly: true }))).toEqual({ portal: 7, arrivalOnly: true });
        expect(editor.fromForm({ portal: 3.4, arrivalOnly: false })).toEqual({ portal: 3 });
    });

    it("round-trips a spawner through the form", () => {
        const editor = DataBrushEditorFor(DataBrushName.SPAWNER);
        const value = { monsters: ["imp", "ogre"], interval: 2.5, maxAlive: 6, total: 0, activationRange: 0, hitPoints: 20 };
        expect(editor.fromForm(editor.toForm(value as never))).toEqual(value);
    });

    it("lists every monster type in the spawner dialog, and refuses an empty pool", () => {
        const editor = DataBrushEditorFor(DataBrushName.SPAWNER);
        const monsters = editor.fields(noImages).find(f => f.key === "monsters");
        expect(monsters.type === "multi-choice" && monsters.options.map(o => o.value)).toEqual([...TEST_MONSTERS.types]);
        expect(editor.validate({ ...editor.toForm(DefaultSpawnerValue()), monsters: [] })).toMatch(/at least one/);
        expect(editor.validate(editor.toForm(DefaultSpawnerValue()))).toBeNull();
    });

    it("gives every form field a value, so no control starts blank", () => {
        [DataBrushName.SPAWNER, DataBrushName.LIGHT, DataBrushName.Z_INDEX, DataBrushName.PICKUP, "door", DataBrushName.DIALOG, DataBrushName.BOSS, DataBrushName.TELEPORT].forEach(name => {
            const editor = DataBrushEditorFor(name);
            const form = editor.toForm(0);
            editor.fields(noImages).forEach(field => expect(form, `${name}.${field.key}`).toHaveProperty(field.key));
        });
    });

    it("saves a light with no flicker as a steady one, without the field", () => {
        const light = DataBrushEditorFor(DataBrushName.LIGHT);
        expect(light.fromForm({ ...light.toForm({ brightness: 1, tint: 0xffffff, range: 5, flicker: 0.2 }), lightFlicker: 0 })).toEqual({ brightness: 1, tint: 0xffffff, range: 5 });
    });

    it("starts a light that isn't one yet as a torch - the light brush's own first value", () => {
        const light = DataBrushEditorFor(DataBrushName.LIGHT);
        expect(light.fromForm(light.toForm(0))).toEqual(DefaultLightValue());
    });

    it("round-trips a light and a height", () => {
        const light = DataBrushEditorFor(DataBrushName.LIGHT);
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
        expect(visibleKeys(pickup.toForm({ kind: "gold", amount: 1 }))).toEqual(["kind", "goldAmount", "quest"]);
        expect(visibleKeys(pickup.toForm({ kind: "health", amount: 2 }))).toEqual(["kind", "healthAmount", "quest"]);
        expect(visibleKeys(pickup.toForm({ kind: "key", id: 3 }))).toEqual(["kind", "keyId", "quest"]);
        expect(visibleKeys(pickup.toForm({ kind: "item" }))).toEqual(["kind", "itemSprite", "quest"]);
        expect(visibleKeys(pickup.toForm(WEAPON))).toEqual(["kind", "weaponIcon", "shotSprite", "shotDamage", "shotSpeed", "shotRange", "shotCooldown", "shotTurns", "shotGlows", "quest"]);
        expect(visibleKeys({ ...pickup.toForm(WEAPON), shotTurns: true })).toContain("shotAngle");
        expect(visibleKeys(pickup.toForm(GLOWING))).toEqual(expect.arrayContaining(["shotLightBrightness", "shotLightTint", "shotLightRange", "shotLightFlicker"]));
        expect(visibleKeys(pickup.toForm(TORCH))).toEqual(["kind", "carriedBrightness", "carriedTint", "carriedRange", "carriedFlicker", "carriedSeconds", "quest"]);
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

const QUESTS = [
    { id: "gold", name: "THE MISER'S HOARD", goal: { kind: "collect" } },
    { id: "demon", name: "SLAY THE DEMON", goal: { kind: "kill" } }
];
const withQuests = { ...noImages, quests: QUESTS };

describe("a pickup's quest", () => {
    it("round-trips, and None leaves it out", () => {
        const tagged: PickupValue = { kind: "gold", amount: 5, quest: "gold" };
        expect(pickup.fromForm(pickup.toForm(tagged))).toEqual(tagged);
        expect(pickup.fromForm({ ...pickup.toForm(tagged), quest: "" })).toEqual({ kind: "gold", amount: 5 });
        expect(pickup.toForm({ kind: "key", id: 2 }).quest).toBe("");
        const weapon = pickup.fromForm({ ...pickup.toForm(WEAPON), quest: "demon" }) as PickupValue;
        expect(weapon.quest).toBe("demon");
        expect(IsPickupValue(weapon)).toBe(true);
    });

    it("offers None and the level's quests, by name", () => {
        const field = pickup.fields(withQuests).find(f => f.key === "quest");
        expect(field.type === "choice" && field.options.map(o => [o.value, o.label])).toEqual([
            ["", "None"],
            ["gold", "THE MISER'S HOARD"],
            ["demon", "SLAY THE DEMON"]
        ]);
        const none = pickup.fields(noImages).find(f => f.key === "quest");
        expect(none.type === "choice" && none.options.map(o => o.value)).toEqual([""]);
        expect(none.hint).toMatch(/add them with Q/);
    });

    it("wants a quest the level has - one taken off its list since is caught - but can't check without the list", () => {
        const form = pickup.toForm({ kind: "gold", amount: 5, quest: "gone" });
        expect(pickup.validate(form, withQuests)).toMatch(/“gone” isn't one of the level's quests/);
        expect(pickup.validate({ ...form, quest: "gold" }, withQuests)).toBeNull();
        expect(pickup.validate(form, noImages)).toBeNull();
    });
});

describe("the dialog editor", () => {
    const dialog = DataBrushEditorFor(DataBrushName.DIALOG);

    it("round-trips a script, and starts a new one with a line to show where it goes", () => {
        const script = "MINER: Rats!\n> I'll go. -> yes\n> No.\n\nyes:\ngive gold";
        expect(dialog.fromForm(dialog.toForm({ script }))).toEqual({ script });
        expect(dialog.toForm(0).script).toBe(DefaultDialogValue().script);
        expect(dialog.fields(noImages)[0].type).toBe("textarea");
    });

    it("wants something said, and the script readable - its first mistake, and how many more", () => {
        expect(dialog.validate({ script: "  " }, withQuests)).toMatch(/something to say/);
        expect(dialog.validate({ script: "MINER: Hello." }, withQuests)).toBeNull();
        expect(dialog.validate({ script: "-> nowhere" }, withQuests)).toMatch(/^Line 1: /);
        expect(dialog.validate({ script: "-> nowhere\nreward gold lots" }, withQuests)).toMatch(/^Line 1: .*\(and 1 more\)$/);
    });

    it("checks the quests a script names against the level's - when it has the list", () => {
        expect(dialog.validate({ script: "give demon" }, withQuests)).toBeNull();
        expect(dialog.validate({ script: "give dragon" }, withQuests)).toMatch(/no quest called "dragon"/);
        expect(dialog.validate({ script: "give dragon" }, noImages)).toBeNull();
    });
});

describe("the boss editor", () => {
    const boss = DataBrushEditorFor(DataBrushName.BOSS);

    it("round-trips a boss - 0 hit points is its kind's own, left out", () => {
        const values = [{ monster: "ogre", hitPoints: 40, quest: "demon" }, { monster: "imp", hitPoints: 6 }, { monster: "goblin" }];
        values.forEach(value => expect(boss.fromForm(boss.toForm(value)), JSON.stringify(value)).toEqual(value));
        expect(boss.fromForm({ ...boss.toForm({ monster: "imp", hitPoints: 6 }), hitPoints: 0 })).toEqual({ monster: "imp" });
    });

    it("starts as the roster's first monster of its pool, three times as tough", () => {
        expect(boss.fromForm(boss.toForm(0))).toEqual(DefaultBossValue());
        expect(DefaultBossValue()).toEqual({ monster: "goblin", hitPoints: 6 });
    });

    it("offers every monster, and wants one the roster has and a quest the level has", () => {
        const monster = boss.fields(noImages).find(f => f.key === "monster");
        expect(monster.type === "choice" && monster.options.map(o => o.value)).toEqual([...TEST_MONSTERS.types]);
        expect(boss.validate(boss.toForm({ monster: "ogre" }), withQuests)).toBeNull();
        expect(boss.validate({ ...boss.toForm({ monster: "ogre" }), monster: "dragon" }, withQuests)).toMatch(/Pick a monster/);
        expect(boss.validate(boss.toForm({ monster: "ogre", quest: "gone" }), withQuests)).toMatch(/isn't one of the level's quests/);
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
