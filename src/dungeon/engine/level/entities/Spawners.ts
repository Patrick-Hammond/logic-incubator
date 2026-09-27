/**
 * A monster spawner's authored properties - the value of the `SPAWNER` data
 * brush (drawn with the "skull" sprite for now). Pure - no pixi - so it runs
 * under the plain node test runner, same reasoning as Lighting.ts.
 */

import { Vec2Like } from "../../../../_lib/math/Geometry";
import MonsterRoster, { MonsterType } from "./MonsterRoster";

export type SpawnerValue = {
    /** Pool the spawner picks from at random on each spawn. Never empty once it's been through `SanitiseSpawnerValue` (given the game has loaded a `MonsterRoster`). */
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

/** A new spawner's value. A function, not a constant: its pool is the default one from the `MonsterRoster` the game loads at boot. */
export function DefaultSpawnerValue(): SpawnerValue {
    return {
        monsters: MonsterRoster.inst.DefaultPool.concat(),
        interval: 3,
        maxAlive: 4,
        total: 0,
        activationRange: 10,
        hitPoints: 10
    };
}

/** Narrows a `Brush.data`/`DataBrush.value` to `SpawnerValue` - the only data brush value carrying a `monsters` list, which is what tells it apart from a `LightValue`. */
export function IsSpawnerValue(value: unknown): value is SpawnerValue {
    return typeof value === "object" && value !== null && Array.isArray((value as SpawnerValue).monsters);
}

/**
 * Coerces saved/hand-edited spawner data into a usable `SpawnerValue`: monster names the roster
 * doesn't know are dropped (falling back to the default pool if none survive), numbers are floored
 * at 0 and missing or non-finite ones take their default - so a level saved before a field existed
 * still loads.
 */
export function SanitiseSpawnerValue(value: Partial<SpawnerValue> | null | undefined): SpawnerValue {
    const v = value || {};
    const defaults = DefaultSpawnerValue();
    const num = (n: unknown, fallback: number) => (typeof n === "number" && Number.isFinite(n) ? Math.max(0, n) : fallback);
    const monsters = Array.isArray(v.monsters) ? v.monsters.filter(type => MonsterRoster.inst.Has(type)) : [];
    return {
        monsters: monsters.length ? monsters : defaults.monsters,
        interval: num(v.interval, defaults.interval),
        maxAlive: Math.max(1, Math.round(num(v.maxAlive, defaults.maxAlive))),
        total: Math.round(num(v.total, defaults.total)),
        activationRange: num(v.activationRange, defaults.activationRange),
        hitPoints: Math.round(num(v.hitPoints, defaults.hitPoints))
    };
}
