/**
 * A monster spawner's authored properties - the value of the `SPAWNER` data
 * brush (drawn with the "skull" sprite for now). Pure - no pixi - so it runs
 * under the plain node test runner, same reasoning as Lighting.ts.
 */

import { Vec2Like } from "../../../../_lib/math/Geometry";
import { DoorFootprint } from "../Doors";
import { UNREACHABLE } from "./FlowField";
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

/** A placed spawner: its (normalised) map cell plus its authored `SpawnerValue`, and the solid cells its sprite covers (see `SpawnerCells`). See `Level.spawners`. */
export type Spawner = Vec2Like & { value: SpawnerValue; cells: Vec2Like[] };

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

/**
 * The solid cells a spawner's sprite covers when drawn top-left on its own cell - the same
 * rule as a door's footprint (`DoorFootprint`), so a 32x32 sprite on 16px tiles fills the
 * 2x2 block right of and below it. Just its own cell without a sprite.
 */
export function SpawnerCells(anchor: Vec2Like, spriteSize: { width: number; height: number } | undefined, tileSize: number): Vec2Like[] {
    return spriteSize ? DoorFootprint(anchor, spriteSize, { x: 0, y: 0 }, tileSize) : [{ x: anchor.x, y: anchor.y }];
}

/** A spawner in play. See `StepSpawner`. */
export type SpawnerState = {
    spawner: Spawner;
    /** Seconds until it's ready to spawn again. Keeps counting down while it waits (out of range, or at `maxAlive`), so it spawns the moment it's able. */
    countdown: number;
    /** Its monsters still alive. */
    alive: number;
    /** Monsters it has produced so far - it goes dormant at `value.total` (if not 0). */
    produced: number;
    /** Damage it can still take. Meaningless while `value.hitPoints` is 0 (indestructible). */
    hitPoints: number;
    destroyed: boolean;
};

export function CreateSpawnerState(spawner: Spawner): SpawnerState {
    return { spawner, countdown: spawner.value.interval, alive: 0, produced: 0, hitPoints: spawner.value.hitPoints, destroyed: false };
}

/**
 * Advances a spawner by `dt` seconds. Returns the monster to spawn now - one of its pool,
 * picked with `random` - or null. `distance` is the player's walk from the spawner in tiles
 * (`FlowField.DistanceAt` of its `SpawnCell`), `UNREACHABLE` if there's no way. Only decides:
 * call `RecordSpawn` once the monster is actually placed, so a spawn that couldn't happen
 * (the game's monster cap, no free cell) is simply retried next frame.
 */
export function StepSpawner(state: SpawnerState, dt: number, distance: number, random: () => number): MonsterType | null {
    const { value } = state.spawner;
    if (state.destroyed || (value.total > 0 && state.produced >= value.total)) {
        return null;
    }
    state.countdown = Math.max(0, state.countdown - dt);
    const active = value.activationRange === 0 || (distance !== UNREACHABLE && distance <= value.activationRange);
    if (!active || state.countdown > 0 || state.alive >= value.maxAlive || !value.monsters.length) {
        return null;
    }
    return value.monsters[Math.min(value.monsters.length - 1, Math.floor(random() * value.monsters.length))];
}

/** A monster `StepSpawner` asked for has been placed. */
export function RecordSpawn(state: SpawnerState): void {
    state.countdown = state.spawner.value.interval;
    state.produced++;
    state.alive++;
}

/** One of the spawner's monsters has died - it may spawn again if it was at `maxAlive`. */
export function RecordDeath(state: SpawnerState): void {
    state.alive = Math.max(0, state.alive - 1);
}

/** Returns true if this hit destroyed it. An indestructible spawner (`hitPoints` 0) shrugs everything off. */
export function DamageSpawner(state: SpawnerState, damage: number): boolean {
    if (state.destroyed || state.spawner.value.hitPoints === 0) {
        return false;
    }
    state.hitPoints -= damage;
    if (state.hitPoints <= 0) {
        state.destroyed = true;
        return true;
    }
    return false;
}

/**
 * Where a spawner's next monster appears: the open cell bordering its footprint (8-way) that's
 * the shortest walk to the player, so monsters come out on the player's side. With the player
 * unreachable, any open bordering cell; with none open, null.
 */
export function SpawnCell(
    cells: ReadonlyArray<Vec2Like>,
    isOpen: (x: number, y: number) => boolean,
    distanceAt: (x: number, y: number) => number
): Vec2Like | null {
    const inFootprint = (x: number, y: number) => cells.some(c => c.x === x && c.y === y);
    let best: Vec2Like | null = null;
    let bestDistance = Number.MAX_VALUE;
    let fallback: Vec2Like | null = null;
    cells.forEach(cell => {
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const x = cell.x + dx;
                const y = cell.y + dy;
                if ((dx === 0 && dy === 0) || inFootprint(x, y) || !isOpen(x, y)) {
                    continue;
                }
                fallback = fallback || { x, y };
                const distance = distanceAt(x, y);
                if (distance !== UNREACHABLE && distance < bestDistance) {
                    bestDistance = distance;
                    best = { x, y };
                }
            }
        }
    });
    return best || fallback;
}
