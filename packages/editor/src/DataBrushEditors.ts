/**
 * How each editable value is edited in the `FormDialog` popup: which fields
 * it shows, and how its value converts to and from the dialog's flat form
 * values. Brushes whose value the game never reads (player-start, collision)
 * have no entry, so the editor offers no edit button for them.
 *
 * "light" and "spawner" are keyed by their old `DataBrushName` string even
 * though neither is a paintable data brush any more - a light or a spawner is
 * now an ordinary tile placement (see `ImplicitData.EffectiveLight`/
 * `EffectiveSpawner`), edited by the data-select tool clicking it on the map
 * rather than a palette chip, but it's the exact same value shape and the
 * exact same dialog either way. A pickup is both: the `PICKUP` data brush, and the
 * same value on a tile that gives one (`EffectivePickup`) - one popup for either. "door" is
 * only ever a tile's own value (`EffectiveDoorLock`): there's no door data brush.
 *
 * No pixi in here - monster pictures come in via `EditorImages` - so the
 * conversions run under the plain node test runner (see DataBrushEditors.test.ts).
 */

import { IsDoorLockValue } from "@logic-incubator/engine/level/Doors";
import { NoLock } from "@logic-incubator/engine/level/entities/Keys";
import MonsterRoster, { MonsterType } from "@logic-incubator/engine/level/entities/MonsterRoster";
import { DefaultPickupValue, IsPickupValue, PickupKind, PickupKinds, PickupValue } from "@logic-incubator/engine/level/entities/Pickups";
import { DefaultSpawnerValue, IsSpawnerValue, SanitiseSpawnerValue } from "@logic-incubator/engine/level/entities/Spawners";
import { IsLightValue, LightValue, MAX_BRIGHTNESS } from "@logic-incubator/engine/level/Lighting";
import { DataBrushName, DataBrushValue } from "@logic-incubator/engine/level/LevelFormat";
import { ChoiceOption, FieldSpec, FormValue, FormValues } from "./ui/dialog/FormDialog";

/** Lookups the dialogs need from the running editor, passed in so this module stays pixi-free. */
export type EditorImages = {
    /** A picture of the monster for its chip, or undefined to show just its name. */
    monster: (type: MonsterType) => ChoiceOption["image"] | undefined;
    /** Whether the sprite sheet has a sprite or animation by this name - for the sprite names a pickup is typed with. */
    hasSprite: (name: string) => boolean;
};

export type DataBrushEditor = {
    title: string;
    subtitle: string;
    fields: (images: EditorImages) => FieldSpec[];
    toForm: (value: DataBrushValue) => FormValues;
    fromForm: (form: FormValues) => DataBrushValue;
    /** `images` is there for the checks that need the game's art - absent in a test that has none, where they're skipped. */
    validate?: (form: FormValues, images?: EditorImages) => string | null;
};

const PICKUP_LABELS: { [kind in PickupKind]: string } = { gold: "Gold", health: "Health", key: "Key", weapon: "Weapon", item: "Item", light: "A light to carry" };

/** Fields for one kind of pickup show only while it's the chosen kind. */
const whenKind = (kind: PickupKind) => (form: FormValues) => form.kind === kind;

const RADIANS = Math.PI / 180;
const Round2 = (n: number) => Math.round(n * 100) / 100;

/** The sprite names in a form, trimmed - "" when it's blank. */
const Name = (value: FormValue) => String(value).trim();

/** A sprite name the form needs: named, and in the sheet if there is one to check against. */
function SpriteProblem(name: string, what: string, images?: EditorImages): string | null {
    if (!name) {
        return `Name ${what}.`;
    }
    return images && !images.hasSprite(name) ? `“${name}” isn't a sprite in the sheet.` : null;
}

/** A torch: what a new light starts as. */
const DEFAULT_LIGHT: LightValue = { brightness: 1, tint: 0xffc780, range: 7, flicker: 0.15 };

/** The fields that set a light, their keys starting `prefix`; shown only while `visibleWhen` says so, if given. */
function LightFields(prefix: string, visibleWhen?: (form: FormValues) => boolean): FieldSpec[] {
    return [
        {
            type: "number",
            key: prefix + "Brightness",
            label: "Brightness",
            min: 0,
            max: MAX_BRIGHTNESS,
            step: 0.05,
            hint: "Its strength at its own cell, on top of the ambient light. 1 is a torch.",
            visibleWhen
        },
        { type: "colour", key: prefix + "Tint", label: "Tint", visibleWhen },
        { type: "number", key: prefix + "Range", label: "Range", min: 0, max: 99, step: 0.5, sliderMax: 30, unit: "tiles", hint: "How far it reaches - it fades smoothly to nothing there.", visibleWhen },
        {
            type: "number",
            key: prefix + "Flicker",
            label: "Flicker",
            min: 0,
            max: 1,
            step: 0.05,
            sliderMax: 0.5,
            hint: "How much its strength wavers, as a share of itself. 0 is steady; 0.15 is a torch.",
            visibleWhen
        }
    ];
}

/** A light's values for `LightFields` with the same `prefix`. */
function LightToForm(prefix: string, light: LightValue): FormValues {
    return { [prefix + "Brightness"]: light.brightness, [prefix + "Tint"]: light.tint, [prefix + "Range"]: light.range, [prefix + "Flicker"]: light.flicker || 0 };
}

/** The light `LightFields` with the same `prefix` were set to. A steady one is saved without a `flicker`. */
function LightFromForm(prefix: string, form: FormValues): LightValue {
    const light: LightValue = { brightness: Number(form[prefix + "Brightness"]), tint: Number(form[prefix + "Tint"]), range: Number(form[prefix + "Range"]) };
    const flicker = Number(form[prefix + "Flicker"]);
    return flicker > 0 ? { ...light, flicker } : light;
}

const EDITORS: { [name: string]: DataBrushEditor } = {
    [DataBrushName.Z_INDEX]: {
        title: "Height",
        subtitle: "Height of the cells you paint with this brush.",
        fields: () => [
            {
                type: "number",
                key: "value",
                label: "Height",
                min: -999,
                max: 999,
                sliderMin: -16,
                sliderMax: 16,
                hint: "Sets the cell's depth band and drives the camera zoom. Unpainted cells are 0."
            }
        ],
        toForm: value => ({ value: typeof value === "number" ? value : 0 }),
        fromForm: form => Number(form.value)
    },

    // Not DataBrushName.LIGHT - it isn't one any more (see the module doc comment) - but the same string.
    light: {
        title: "Light",
        subtitle: "A point light, baked when the level loads. Walls cast its shadows.",
        fields: () => LightFields("light"),
        toForm: value => LightToForm("light", IsLightValue(value) ? value : DEFAULT_LIGHT),
        fromForm: form => LightFromForm("light", form)
    },

    [DataBrushName.PICKUP]: {
        title: "Pickup",
        subtitle: "What the player gets for walking over it - it then disappears.",
        fields: () => [
            { type: "choice", key: "kind", label: "Gives the player", options: PickupKinds.map(kind => ({ value: kind, label: PICKUP_LABELS[kind] })) },
            { type: "number", key: "goldAmount", label: "Amount", min: 0, max: 99999, sliderMax: 100, visibleWhen: whenKind("gold") },
            {
                type: "number",
                key: "healthAmount",
                label: "Hit points restored",
                min: 0,
                max: 99,
                sliderMax: 12,
                unit: "half hearts",
                hint: "2 is one heart. Never goes past the player's maximum.",
                visibleWhen: whenKind("health")
            },
            {
                type: "number",
                key: "keyId",
                label: "Key id",
                min: 0,
                max: 9999,
                sliderMax: 20,
                hint: "Opens the locked doors with this id - lock a door with the data-select tool. Doors are unlocked until you do.",
                visibleWhen: whenKind("key")
            },
            {
                type: "text",
                key: "weaponIcon",
                label: "Icon",
                placeholder: "weapon_bow",
                hint: "The sprite the HUD shows while it's equipped.",
                visibleWhen: whenKind("weapon")
            },
            { type: "text", key: "shotSprite", label: "Shot sprite", placeholder: "weapon_arrow", visibleWhen: whenKind("weapon") },
            { type: "number", key: "shotDamage", label: "Damage", min: 0, max: 999, step: 0.5, sliderMax: 20, visibleWhen: whenKind("weapon") },
            { type: "number", key: "shotSpeed", label: "Shot speed", min: 0.5, max: 60, step: 0.5, sliderMax: 20, unit: "px / frame", visibleWhen: whenKind("weapon") },
            { type: "number", key: "shotRange", label: "Range", min: 1, max: 99, sliderMax: 30, unit: "tiles", visibleWhen: whenKind("weapon") },
            { type: "number", key: "shotCooldown", label: "Cooldown", min: 0.05, max: 10, step: 0.05, sliderMax: 3, unit: "seconds", visibleWhen: whenKind("weapon") },
            {
                type: "toggle",
                key: "shotTurns",
                label: "Shot turns to face its flight",
                hint: "Off draws it upright however it flies.",
                visibleWhen: whenKind("weapon")
            },
            {
                type: "number",
                key: "shotAngle",
                label: "Way its art points",
                min: -180,
                max: 180,
                step: 5,
                unit: "degrees",
                hint: "0 is right, -90 is up.",
                visibleWhen: form => form.kind === "weapon" && form.shotTurns === true
            },
            {
                type: "toggle",
                key: "shotGlows",
                label: "Shot gives off light",
                hint: "A fireball or a magic bolt lights its way as it flies.",
                visibleWhen: whenKind("weapon")
            },
            ...LightFields("shotLight", form => form.kind === "weapon" && form.shotGlows === true),
            {
                type: "text",
                key: "itemSprite",
                label: "Item sprite",
                placeholder: "the sprite it's on",
                hint: "What goes in the inventory. Leave blank to use the sprite this pickup is on.",
                visibleWhen: whenKind("item")
            },
            ...LightFields("carried", whenKind("light")),
            {
                type: "number",
                key: "carriedSeconds",
                label: "Burns for",
                min: 0,
                max: 3600,
                sliderMax: 300,
                unit: "seconds",
                hint: "It dims over its last few seconds, then goes out. 0 lasts the rest of the level.",
                visibleWhen: whenKind("light")
            }
        ],
        toForm: value => {
            const pickup: PickupValue = IsPickupValue(value) ? value : DefaultPickupValue();
            // The weapon fields hold the default weapon's while the pickup is another kind, so changing the kind to weapon starts from something sensible.
            const weapon = pickup.kind === "weapon" ? pickup.weapon : (DefaultPickupValue("weapon") as Extract<PickupValue, { kind: "weapon" }>).weapon;
            const shot = weapon.shot;
            // Like the weapon's: the carried light's fields hold the default one's while the pickup is another kind.
            const carried = pickup.kind === "light" ? pickup : (DefaultPickupValue("light") as Extract<PickupValue, { kind: "light" }>);
            return {
                kind: pickup.kind,
                goldAmount: pickup.kind === "gold" ? pickup.amount : 1,
                healthAmount: pickup.kind === "health" ? pickup.amount : 2,
                keyId: pickup.kind === "key" ? pickup.id : 1,
                weaponIcon: weapon.icon,
                shotSprite: shot.sprite,
                shotDamage: shot.damage,
                shotSpeed: shot.speed,
                shotRange: shot.range,
                shotCooldown: shot.cooldown,
                shotTurns: shot.spriteAngle !== undefined,
                shotAngle: shot.spriteAngle !== undefined ? Round2(shot.spriteAngle / RADIANS) : -90,
                shotGlows: shot.light !== undefined,
                ...LightToForm("shotLight", shot.light || DEFAULT_LIGHT),
                itemSprite: pickup.kind === "item" ? pickup.sprite || "" : "",
                ...LightToForm("carried", carried.light),
                carriedSeconds: carried.seconds || 0
            };
        },
        fromForm: form => {
            switch (form.kind) {
                case "health":
                    return { kind: "health", amount: Math.max(0, Math.round(Number(form.healthAmount))) };
                case "key":
                    return { kind: "key", id: Math.max(0, Math.round(Number(form.keyId))) };
                case "weapon": {
                    const plain = {
                        sprite: Name(form.shotSprite),
                        speed: Number(form.shotSpeed),
                        damage: Number(form.shotDamage),
                        cooldown: Number(form.shotCooldown),
                        range: Number(form.shotRange)
                    };
                    const shot = form.shotGlows === true ? { ...plain, light: LightFromForm("shotLight", form) } : plain;
                    return {
                        kind: "weapon",
                        weapon: { icon: Name(form.weaponIcon), shot: form.shotTurns === true ? { ...shot, spriteAngle: Number(form.shotAngle) * RADIANS } : shot }
                    };
                }
                case "item": {
                    const sprite = Name(form.itemSprite);
                    return sprite ? { kind: "item", sprite } : { kind: "item" };
                }
                case "light":
                    return { kind: "light", light: LightFromForm("carried", form), seconds: Math.max(0, Number(form.carriedSeconds)) };
                default:
                    return { kind: "gold", amount: Math.max(0, Math.round(Number(form.goldAmount))) };
            }
        },
        validate: (form, images) => {
            if (form.kind === "weapon") {
                return SpriteProblem(Name(form.weaponIcon), "the sprite the HUD shows for the weapon", images) || SpriteProblem(Name(form.shotSprite), "the sprite the shot is drawn with", images);
            }
            // A blank item sprite is fine - it's the sprite the pickup is on - but one that's named has to exist.
            return form.kind === "item" && Name(form.itemSprite) ? SpriteProblem(Name(form.itemSprite), "the item's sprite", images) : null;
        }
    },

    // Only ever a door tile's own value - there's no door data brush (see the module doc comment). Unlocked is NoLock (-1).
    door: {
        title: "Door lock",
        subtitle: "Whether a key is needed to open this door.",
        fields: () => [
            {
                type: "toggle",
                key: "locked",
                label: "Locked",
                hint: "An unlocked door opens for the player whatever keys they carry. A locked one is a wall to them until they have its key."
            },
            {
                type: "number",
                key: "lock",
                label: "Key id",
                min: 0,
                max: 9999,
                sliderMax: 20,
                hint: "Only a key with this id opens the door.",
                visibleWhen: form => form.locked === true
            }
        ],
        toForm: value => {
            const locked = IsDoorLockValue(value) && value.lock !== NoLock;
            return { locked, lock: IsDoorLockValue(value) && locked ? value.lock : 1 };
        },
        fromForm: form => ({ lock: form.locked === true ? Math.max(0, Math.round(Number(form.lock))) : NoLock })
    },

    // Not DataBrushName.SPAWNER - same reason as light, above.
    spawner: {
        title: "Monster spawner",
        subtitle: "Produces monsters over time. Each spawn picks one of the selected types at random.",
        fields: images => [
            {
                type: "multi-choice",
                key: "monsters",
                label: "Monsters",
                options: MonsterRoster.inst.Types.map(type => ({ value: type, label: type.replace(/_/g, " "), image: images.monster(type) }))
            },
            { type: "number", key: "interval", label: "Spawn interval", min: 0.5, max: 120, step: 0.5, sliderMax: 20, unit: "seconds" },
            {
                type: "number",
                key: "maxAlive",
                label: "Max alive at once",
                min: 1,
                max: 99,
                sliderMax: 20,
                hint: "The spawner pauses at this many living monsters and resumes as they die."
            },
            { type: "number", key: "total", label: "Total to spawn", min: 0, max: 999, sliderMax: 100, zeroLabel: "unlimited" },
            {
                type: "number",
                key: "activationRange",
                label: "Activation range",
                min: 0,
                max: 99,
                sliderMax: 40,
                unit: "tiles",
                zeroLabel: "always active",
                hint: "Only spawns while the player is within this distance."
            },
            { type: "number", key: "hitPoints", label: "Spawner hit points", min: 0, max: 999, sliderMax: 100, zeroLabel: "indestructible" }
        ],
        toForm: value => {
            const spawner = SanitiseSpawnerValue(IsSpawnerValue(value) ? value : DefaultSpawnerValue());
            return { ...spawner, monsters: spawner.monsters.concat() };
        },
        fromForm: form =>
            SanitiseSpawnerValue({
                monsters: (form.monsters as string[]).filter(type => MonsterRoster.inst.Has(type)),
                interval: Number(form.interval),
                maxAlive: Number(form.maxAlive),
                total: Number(form.total),
                activationRange: Number(form.activationRange),
                hitPoints: Number(form.hitPoints)
            }),
        validate: form => ((form.monsters as string[]).length ? null : "Pick at least one monster.")
    }
};

/** The popup editor for this data brush, or undefined if its value isn't meaningfully editable. */
export function DataBrushEditorFor(name: string): DataBrushEditor | undefined {
    return EDITORS[name];
}
