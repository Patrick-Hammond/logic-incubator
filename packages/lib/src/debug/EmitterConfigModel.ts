/**
 * What the emitter debug panel edits, with no DOM in it: a working copy of an emitter's config, and a description of its
 * fields - label, kind, range, and how to read and write each in the config - that the panel turns into controls.
 *
 * The config is the particle editor's own JSON (`EmitterConfig` / `OldEmitterConfig`), so what the panel copies out can be
 * pasted straight into a data file. Both of its shapes are understood: `{ start, end }` and `{ list: [{ value, time }, ...] }`
 * (for a list, "start" and "end" are its first and last values, and the steps between are left as they are). Anything the panel
 * has no control for (`ease`, `extraData`, `spawnPolygon`...) is carried through untouched.
 */

/** The config being edited. Typed loosely: it is JSON that may have come from either editor. */
export type EmitterConfigData = any;

export type FieldKind = "number" | "slider" | "colour" | "check" | "select";

/** One control: a number, a colour, a tick box or a choice, and where it lives in the config. */
export interface Field {
    /** Unique, and stable: `alpha.start`, `spawnCircle.r`... */
    id: string;
    /** What it is called in its row when the row has several controls (`start`, `end`, `x`, `y`, `min`, `max`...). Blank for a lone one. */
    label: string;
    kind: FieldKind;
    min?: number;
    max?: number;
    step?: number;
    /** For a `select`: the choices. */
    options?: string[];
    /** The value in the config, or a default when the config has none. A colour is `#rrggbb`. */
    read(config: EmitterConfigData): number | string | boolean;
    /** Puts `value` in the config, creating what is missing around it. A colour is `#rrggbb`. `context` is what a field may need to make a sensible new setting. */
    write(config: EmitterConfigData, value: number | string | boolean, context?: FieldContext): void;
}

/** A rectangle as the config has one: `killRect`, `spawnRect`. */
export interface RectData {
    x: number;
    y: number;
    w: number;
    h: number;
}

/** What the panel knows that a config does not: here, how big the screen is, so a new kill area can start around it. */
export interface FieldContext {
    /** The area a new `killRect` starts as. */
    killRect: RectData;
}

/** A kill area for a screen of this size: the screen with `margin` more on every side, so particles can drift in from just outside. */
export function DefaultKillRect(screen?: { width: number; height: number }, margin = 100): RectData {
    const size = screen && screen.width > 0 && screen.height > 0 ? screen : { width: 1280, height: 720 };
    return { x: -margin, y: -margin, w: size.width + 2 * margin, h: size.height + 2 * margin };
}

/** A line of the panel: a name and the one to four controls beside it. */
export interface Row {
    label: string;
    fields: Field[];
    /** Explains the row's effect in the current config, when something else overrides it. */
    note?(config: EmitterConfigData): string | undefined;
    /** Shown only for some configs - the spawn shape's own settings, say. Default: always. */
    visible?(config: EmitterConfigData): boolean;
}

export interface Section {
    title: string;
    rows: Row[];
}

/** A deep copy of `value`: plain objects and arrays are copied, anything else (a function such as a custom `ease`) is kept as it is. */
export function CloneConfig<T>(value: T): T {
    if (Array.isArray(value)) {
        return value.map(item => CloneConfig(item)) as unknown as T;
    }
    if (value && typeof value === "object") {
        const copy: any = {};
        Object.keys(value).forEach(key => (copy[key] = CloneConfig((value as any)[key])));
        return copy;
    }
    return value;
}

// ---- reading and writing the config -------------------------------------------------------------------------------------------

/** `config.a.b` for the path `"a.b"`, or `fallback` when anything along it is missing. */
function GetPath(config: EmitterConfigData, path: string, fallback: any): any {
    let value = config;
    for (const key of path.split(".")) {
        if (value === null || value === undefined) {
            return fallback;
        }
        value = value[key];
    }
    return value === undefined ? fallback : value;
}

/** Sets `config.a.b` for the path `"a.b"`, making the objects on the way if they aren't there. */
function SetPath(config: EmitterConfigData, path: string, value: any): void {
    const keys = path.split(".");
    let target = config;
    for (let i = 0; i < keys.length - 1; i++) {
        if (target[keys[i]] === null || typeof target[keys[i]] !== "object") {
            target[keys[i]] = {};
        }
        target = target[keys[i]];
    }
    target[keys[keys.length - 1]] = value;
}

/** The first (`start`) or last (`end`) value of an alpha, scale, speed or colour property, in either of its shapes. */
function GetEnd(config: EmitterConfigData, key: string, end: "start" | "end", fallback: any): any {
    const property = config[key];
    if (!property) {
        return fallback;
    }
    if (Array.isArray(property.list) && property.list.length) {
        return property.list[end === "start" ? 0 : property.list.length - 1].value;
    }
    return end in property ? property[end] : fallback;
}

function SetEnd(config: EmitterConfigData, key: string, end: "start" | "end", value: any, fallback: any): void {
    if (!config[key]) {
        config[key] = { start: fallback, end: fallback };
    }
    const property = config[key];
    if (Array.isArray(property.list) && property.list.length) {
        property.list[end === "start" ? 0 : property.list.length - 1].value = value;
    } else {
        property[end] = value;
    }
}

/** `minimumScaleMultiplier` and `minimumSpeedMultiplier` live beside the property in the old shape, and top-level in the new one. */
function GetMultiplier(config: EmitterConfigData, key: string, name: string): number {
    if (name in config) {
        return config[name];
    }
    return config[key] && name in config[key] ? config[key][name] : 1;
}

function SetMultiplier(config: EmitterConfigData, key: string, name: string, value: number): void {
    if (name in config) {
        config[name] = value;
        return;
    }
    if (!config[key]) {
        config[key] = {};
    }
    config[key][name] = value;
}

/** `rrggbb`, `#rrggbb` or `0xrrggbb` as the `#rrggbb` an `<input type="color">` takes. */
function ToCssColour(colour: any): string {
    const text = String(colour === undefined || colour === null ? "ffffff" : colour).replace(/^#|^0x/i, "");
    return "#" + ("000000" + text).slice(-6).toLowerCase();
}

/** `#rrggbb` as the `rrggbb` the editor's JSON uses. */
function FromCssColour(colour: string): string {
    return colour.replace(/^#/, "").toLowerCase();
}

// ---- the fields ---------------------------------------------------------------------------------------------------------------

/** `value` as a number - a numeric string counts - or `fallback` for anything else (null, "", text), as the emitter itself treats it. */
function ToNumber(value: any, fallback: number): number {
    const number = typeof value === "number" ? value : parseFloat(value);
    return isFinite(number) ? number : fallback;
}

function Num(id: string, label: string, fallback: number, min?: number, max?: number, step?: number, kind: FieldKind = "number"): Field {
    return {
        id, label, kind, min, max, step,
        read: config => ToNumber(GetPath(config, id, fallback), fallback),
        write: (config, value) => SetPath(config, id, value),
    };
}

function EndNum(key: "alpha" | "scale" | "speed", end: "start" | "end", fallback: number, min: number, max: number | undefined, step: number, kind: FieldKind = "number"): Field {
    return {
        id: `${key}.${end}`, label: end, kind, min, max, step,
        read: config => ToNumber(GetEnd(config, key, end, fallback), fallback),
        write: (config, value) => SetEnd(config, key, end, value, fallback),
    };
}

function EndColour(end: "start" | "end"): Field {
    return {
        id: `color.${end}`, label: end, kind: "colour",
        read: config => ToCssColour(GetEnd(config, "color", end, "ffffff")),
        write: (config, value) => SetEnd(config, "color", end, FromCssColour(String(value)), "ffffff"),
    };
}

function Multiplier(key: "scale" | "speed", name: string): Field {
    return {
        id: name, label: "", kind: "number", min: 0, step: 0.1,
        read: config => ToNumber(GetMultiplier(config, key, name), 1),
        write: (config, value) => SetMultiplier(config, key, name, Number(value)),
    };
}

function Check(id: string, fallback: boolean): Field {
    return {
        id, label: "", kind: "check",
        read: config => !!GetPath(config, id, fallback),
        write: (config, value) => SetPath(config, id, !!value),
    };
}

/** Whether the particles live until they leave an area (`killRect`) instead of dying of age. Ticking it adds the area; clearing it takes it out. */
const KillRectOn: Field = {
    id: "killRect.enabled", label: "", kind: "check",
    read: config => !!config.killRect,
    write: (config, value, context) => {
        if (!value) {
            delete config.killRect;
        } else if (!config.killRect) {
            config.killRect = { ...(context ? context.killRect : DefaultKillRect()) };
        }
    },
};

/** The blend modes that work in pixi's WebGL renderer. */
export const BlendModes = ["normal", "add", "multiply", "screen"];

/** The spawn shapes the panel offers. A config that already uses another (`polygonalChain`) keeps it until another is chosen. */
export const SpawnTypes = ["point", "rect", "circle", "ring", "burst"];

function SpawnTypeOf(config: EmitterConfigData): string {
    return String(GetPath(config, "spawnType", "point"));
}

/** What a spawn shape needs in the config: switching to it must leave these there, or the emitter can't be set up. */
function EnsureSpawnShape(config: EmitterConfigData, type: string): void {
    if (type === "rect" && !config.spawnRect) {
        config.spawnRect = { x: -50, y: -50, w: 100, h: 100 };
    }
    if ((type === "circle" || type === "ring") && !config.spawnCircle) {
        config.spawnCircle = { x: 0, y: 0, r: 50 };
    }
    if (type === "ring" && config.spawnCircle && config.spawnCircle.minR === undefined) {
        config.spawnCircle.minR = Math.round(config.spawnCircle.r / 2);
    }
    if (type === "burst") {
        config.particleSpacing = config.particleSpacing === undefined ? 0 : config.particleSpacing;
        config.angleStart = config.angleStart === undefined ? 0 : config.angleStart;
    }
}

const SpawnTypeField: Field = {
    id: "spawnType", label: "", kind: "select", options: SpawnTypes,
    read: config => SpawnTypeOf(config),
    write: (config, value) => {
        config.spawnType = String(value);
        EnsureSpawnShape(config, config.spawnType);
    },
};

/** Every control, in the order the panel shows them. */
export function EmitterSections(): Section[] {
    return [
        {
            title: "Particle",
            rows: [
                // A property the config leaves out is a constant: 1 for alpha and scale, 0 for speed, white - so both ends default to that.
                { label: "Alpha", fields: [EndNum("alpha", "start", 1, 0, 1, 0.01, "slider"), EndNum("alpha", "end", 1, 0, 1, 0.01, "slider")] },
                { label: "Scale", fields: [EndNum("scale", "start", 1, 0, undefined, 0.05), EndNum("scale", "end", 1, 0, undefined, 0.05)] },
                { label: "Min scale multiplier", fields: [Multiplier("scale", "minimumScaleMultiplier")] },
                { label: "Colour", fields: [EndColour("start"), EndColour("end")] },
                {
                    label: "Speed",
                    fields: [EndNum("speed", "start", 0, 0, undefined, 5), EndNum("speed", "end", 0, 0, undefined, 5)],
                    note: config => (GetPath(config, "acceleration.x", 0) || GetPath(config, "acceleration.y", 0)
                        ? "End speed is ignored while there is an acceleration - particles speed up from the start speed." : undefined),
                },
                { label: "Min speed multiplier", fields: [Multiplier("speed", "minimumSpeedMultiplier")] },
                { label: "Acceleration", fields: [Num("acceleration.x", "x", 0, undefined, undefined, 5), Num("acceleration.y", "y", 0, undefined, undefined, 5)] },
                { label: "Max speed", fields: [Num("maxSpeed", "", 0, 0, undefined, 5)] },
                { label: "Start rotation", fields: [Num("startRotation.min", "min", 0, undefined, undefined, 5), Num("startRotation.max", "max", 0, undefined, undefined, 5)] },
                { label: "No particle rotation", fields: [Check("noRotation", false)] },
                { label: "Rotation speed", fields: [Num("rotationSpeed.min", "min", 0, undefined, undefined, 5), Num("rotationSpeed.max", "max", 0, undefined, undefined, 5)] },
                { label: "Rotation acceleration", fields: [Num("rotationAcceleration", "", 0, undefined, undefined, 1)] },
                {
                    label: "Lifetime",
                    fields: [Num("lifetime.min", "min", 1, 0, undefined, 0.05), Num("lifetime.max", "max", 1, 0, undefined, 0.05)],
                    note: config => (config.killRect ? "With an area below, lifetime only sets how long alpha, scale, colour and speed take to reach their end values; they then hold." : undefined),
                },
                { label: "Live until outside area", fields: [KillRectOn] },
                {
                    label: "Area",
                    visible: config => !!config.killRect,
                    fields: [Num("killRect.x", "x", 0, undefined, undefined, 10), Num("killRect.y", "y", 0, undefined, undefined, 10),
                        Num("killRect.w", "w", 0, 0, undefined, 10), Num("killRect.h", "h", 0, 0, undefined, 10)],
                    note: () => "Stage coordinates (the canvas). A particle is destroyed when its centre leaves this rectangle: make it bigger than the screen to let particles drift in.",
                },
                {
                    label: "Blend mode",
                    fields: [{
                        id: "blendMode", label: "", kind: "select", options: BlendModes,
                        read: config => String(GetPath(config, "blendMode", "normal")).toLowerCase(),
                        write: (config, value) => SetPath(config, "blendMode", String(value)),
                    }],
                },
            ],
        },
        {
            title: "Emitter",
            rows: [
                { label: "Spawn frequency (s)", fields: [Num("frequency", "", 0.1, 0.001, undefined, 0.01)] },
                { label: "Emitter lifetime (s)", fields: [Num("emitterLifetime", "", -1, -1, undefined, 0.5)], note: () => "-1 emits for ever." },
                { label: "Max particles", fields: [Num("maxParticles", "", 1000, 1, undefined, 10)] },
                { label: "Particles per wave", fields: [Num("particlesPerWave", "", 1, 1, undefined, 1)] },
                { label: "Spawn chance", fields: [Num("spawnChance", "", 1, 0, 1, 0.05, "slider")] },
                { label: "Spawn type", fields: [SpawnTypeField] },
                {
                    label: "Rectangle",
                    visible: config => SpawnTypeOf(config) === "rect",
                    fields: [Num("spawnRect.x", "x", 0, undefined, undefined, 5), Num("spawnRect.y", "y", 0, undefined, undefined, 5),
                        Num("spawnRect.w", "w", 100, 0, undefined, 5), Num("spawnRect.h", "h", 100, 0, undefined, 5)],
                },
                {
                    label: "Circle",
                    visible: config => SpawnTypeOf(config) === "circle" || SpawnTypeOf(config) === "ring",
                    fields: [Num("spawnCircle.x", "x", 0, undefined, undefined, 5), Num("spawnCircle.y", "y", 0, undefined, undefined, 5),
                        Num("spawnCircle.r", "radius", 50, 0, undefined, 5)],
                },
                { label: "Ring inner radius", visible: config => SpawnTypeOf(config) === "ring", fields: [Num("spawnCircle.minR", "", 25, 0, undefined, 5)] },
                { label: "Particle spacing", visible: config => SpawnTypeOf(config) === "burst", fields: [Num("particleSpacing", "", 0, 0, 360, 5)],
                    note: () => "0 sends each particle in a random direction." },
                { label: "Start angle", visible: config => SpawnTypeOf(config) === "burst", fields: [Num("angleStart", "", 0, undefined, undefined, 5)] },
                { label: "Spawn position", fields: [Num("pos.x", "x", 0, undefined, undefined, 5), Num("pos.y", "y", 0, undefined, undefined, 5)] },
                { label: "Add at back", fields: [Check("addAtBack", false)] },
            ],
        },
    ];
}

/** Every control of every section, flat. */
export function AllFields(): Field[] {
    const fields: Field[] = [];
    EmitterSections().forEach(section => section.rows.forEach(row => row.fields.forEach(field => fields.push(field))));
    return fields;
}

// ---- the working copy ---------------------------------------------------------------------------------------------------------

/** A config being edited: the copy the panel changes, the one it started with (to go back to), and its text for copying out. */
export class EmitterConfigModel {
    private initial: EmitterConfigData;
    private working: EmitterConfigData;
    private context: FieldContext;

    /**
     * @param config - What to start from. It is copied: the original, which may be shared (a loaded data file), is never changed.
     * @param context - What the fields may need to make a sensible new setting; a screen of 1280 x 720 is assumed if it is left out.
     */
    constructor(config: EmitterConfigData, context?: Partial<FieldContext>) {
        this.initial = CloneConfig(config);
        this.working = CloneConfig(config);
        this.context = { killRect: DefaultKillRect(), ...context };
    }

    /** The config as edited so far. */
    get Config(): EmitterConfigData {
        return this.working;
    }

    Read(field: Field): number | string | boolean {
        return field.read(this.working);
    }

    Write(field: Field, value: number | string | boolean): void {
        field.write(this.working, value, this.context);
    }

    /** Back to the config this started with. */
    Reset(): void {
        this.working = CloneConfig(this.initial);
    }

    /** Replaces the working config - from a file, say. `Reset` still goes back to the one this started with. */
    Load(config: EmitterConfigData): void {
        this.working = CloneConfig(config);
    }

    /** The config as JSON text, in the form the editor exports (functions, such as a custom `ease`, can't be written). */
    ToJson(): string {
        return JSON.stringify(this.working, null, 2);
    }

    /** Whether anything has been changed since the start. */
    get Changed(): boolean {
        return JSON.stringify(this.working) !== JSON.stringify(this.initial);
    }
}

/** What each spawn shape reads from the config - an emitter can't be set up without it. */
const SpawnShapeKey: { [type: string]: string } = { rect: "spawnRect", circle: "spawnCircle", ring: "spawnCircle", polygonalChain: "spawnPolygon" };

/**
 * Reads config text; throws with a message that says what is wrong if it isn't a config an emitter can be set up from: an object
 * with `lifetime`, `frequency` and `pos`, and the shape its `spawnType` needs.
 */
export function ParseEmitterConfig(json: string): EmitterConfigData {
    const config = JSON.parse(json);
    if (!config || typeof config !== "object" || Array.isArray(config)) {
        throw new Error("Not an emitter config: expected a JSON object.");
    }
    const missing = ["lifetime", "frequency", "pos"].filter(key => config[key] === undefined);
    if (missing.length) {
        throw new Error(`Not an emitter config: no ${missing.join(", ")}.`);
    }
    const shape = SpawnShapeKey[config.spawnType];
    if (shape && !config[shape]) {
        throw new Error(`Not an emitter config: spawnType "${config.spawnType}" needs ${shape}.`);
    }
    if (config.killRect !== undefined) {
        const bad = ["x", "y", "w", "h"].filter(key => !config.killRect || typeof config.killRect[key] !== "number");
        if (bad.length) {
            throw new Error(`Not an emitter config: killRect needs numbers for ${bad.join(", ")}.`);
        }
    }
    return config;
}
