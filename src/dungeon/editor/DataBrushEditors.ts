/**
 * How each data brush's value is edited in the `FormDialog` popup: which
 * fields it shows, and how its value converts to and from the dialog's flat
 * form values. Brushes whose value the game never reads (player-start,
 * collision) have no entry, so the editor offers no edit button for them.
 *
 * No pixi in here - monster pictures come in via `EditorImages` - so the
 * conversions run under the plain node test runner (see DataBrushEditors.test.ts).
 */

import { IsMonsterType, MonsterType, MonsterTypes } from "../game/level/entities/Monsters";
import { DEFAULT_SPAWNER_VALUE, IsSpawnerValue, SanitiseSpawnerValue } from "../game/level/entities/Spawners";
import { IsLightValue } from "../game/level/Lighting";
import { DataBrushName, DataBrushValue } from "./stores/EditorStore";
import { ChoiceOption, FieldSpec, FormValues } from "./ui/dialog/FormDialog";

/** Lookups the dialogs need from the running editor, passed in so this module stays pixi-free. */
export type EditorImages = {
    /** A picture of the monster for its chip, or undefined to show just its name. */
    monster: (type: MonsterType) => ChoiceOption["image"] | undefined;
};

export type DataBrushEditor = {
    title: string;
    subtitle: string;
    fields: (images: EditorImages) => FieldSpec[];
    toForm: (value: DataBrushValue) => FormValues;
    fromForm: (form: FormValues) => DataBrushValue;
    validate?: (form: FormValues) => string | null;
};

const DEFAULT_LIGHT = { brightness: 0.5, tint: 0xff8100, range: 5 };

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

    [DataBrushName.LIGHT]: {
        title: "Light",
        subtitle: "A static point light, baked when the level loads.",
        fields: () => [
            { type: "number", key: "brightness", label: "Brightness", min: 0, max: 1, step: 0.05, hint: "Peak brightness at the light's own cell." },
            { type: "colour", key: "tint", label: "Tint" },
            { type: "number", key: "range", label: "Range", min: 0, max: 99, step: 0.5, sliderMax: 30, unit: "tiles", hint: "Radius of the linear falloff." }
        ],
        toForm: value => {
            const light = IsLightValue(value) ? value : DEFAULT_LIGHT;
            return { brightness: light.brightness, tint: light.tint, range: light.range };
        },
        fromForm: form => ({ brightness: Number(form.brightness), tint: Number(form.tint), range: Number(form.range) })
    },

    [DataBrushName.SPAWNER]: {
        title: "Monster spawner",
        subtitle: "Produces monsters over time. Each spawn picks one of the selected types at random.",
        fields: images => [
            {
                type: "multi-choice",
                key: "monsters",
                label: "Monsters",
                options: MonsterTypes.map(type => ({ value: type, label: type.replace(/_/g, " "), image: images.monster(type) }))
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
            const spawner = SanitiseSpawnerValue(IsSpawnerValue(value) ? value : DEFAULT_SPAWNER_VALUE);
            return { ...spawner, monsters: spawner.monsters.concat() };
        },
        fromForm: form =>
            SanitiseSpawnerValue({
                monsters: (form.monsters as string[]).filter(IsMonsterType),
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
