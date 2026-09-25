/**
 * A monster spawner's authored properties - the value of the `SPAWNER` data
 * brush (drawn with the "skull" sprite for now). Pure - no pixi - so it runs
 * under the plain node test runner, same reasoning as Lighting.ts.
 */

import { Vec2Like } from "../../../../_lib/math/Geometry";
import { IsMonsterType, MonsterType } from "./Monsters";

export type SpawnerValue = {
    /** Pool the spawner picks from at random on each spawn. Never empty once it's been through `SanitiseSpawnerValue`. */
    monsters: MonsterType[];
    /** Seconds between spawns. */
    interval: number;
    /** Cap on how many of this spawner's monsters can be alive at once - it pauses at the cap rather than stockpiling. */
    maxAlive: number;
    /** Monsters it produces before going dormant. 0 = unlimited. */
    total: number;
    /** Only spawns while the player is within this many tiles. 0 = always active. */
    activationRange: number;
    /** Damage it takes to destroy the spawner itself (Gauntlet-style generator). 0 = indestructible. */
    hitPoints: number;
};

/** A placed spawner: its (normalised) map cell plus its authored `SpawnerValue`. See `Level.spawners`. */
export type Spawner = Vec2Like & { value: SpawnerValue };

export const DEFAULT_SPAWNER_VALUE: SpawnerValue = {
    monsters: ["goblin"],
    interval: 3,
    maxAlive: 4,
    total: 0,
    activationRange: 10,
    hitPoints: 10
};

/** Narrows a `Brush.data`/`DataBrush.value` to `SpawnerValue` - the only data brush value carrying a `monsters` list, which is what tells it apart from a `LightValue`. */
export function IsSpawnerValue(value: unknown): value is SpawnerValue {
    return typeof value === "object" && value !== null && Array.isArray((value as SpawnerValue).monsters);
}

/**
 * Coerces saved/hand-edited spawner data into a usable `SpawnerValue`: unknown monster names are
 * dropped (falling back to the default pool if none survive), numbers are floored at 0 and missing
 * or non-finite ones take their default - so a level saved before a field existed still loads.
 */
export function SanitiseSpawnerValue(value: Partial<SpawnerValue> | null | undefined): SpawnerValue {
    const v = value || {};
    const num = (n: unknown, fallback: number) => (typeof n === "number" && Number.isFinite(n) ? Math.max(0, n) : fallback);
    const monsters = Array.isArray(v.monsters) ? v.monsters.filter(IsMonsterType) : [];
    return {
        monsters: monsters.length ? monsters : DEFAULT_SPAWNER_VALUE.monsters.concat(),
        interval: num(v.interval, DEFAULT_SPAWNER_VALUE.interval),
        maxAlive: Math.max(1, Math.round(num(v.maxAlive, DEFAULT_SPAWNER_VALUE.maxAlive))),
        total: Math.round(num(v.total, DEFAULT_SPAWNER_VALUE.total)),
        activationRange: num(v.activationRange, DEFAULT_SPAWNER_VALUE.activationRange),
        hitPoints: Math.round(num(v.hitPoints, DEFAULT_SPAWNER_VALUE.hitPoints))
    };
}
