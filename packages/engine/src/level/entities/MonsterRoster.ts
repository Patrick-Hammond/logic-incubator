/**
 * The monsters a spawner can produce. The engine doesn't know any itself - the game
 * loads its own roster at boot, before the editor or a level is created, and spawner
 * values (see Spawners.ts) are checked against whatever it loaded. Pure - no pixi -
 * so it runs under the plain node test runner, same as Spawners.ts.
 */

import type { IMonsterBehaviour } from "./Behaviours";
import type { Weapon } from "./Projectiles";

export type MonsterType = string;

/** Everything the engine needs to run one kind of monster - the game's side of the deal. */
export interface MonsterDef {
    /** Animation shown standing still - also its picture in the editor's spawner dialog. */
    idle: string;
    /** Animation shown while moving. Same as `idle` for a monster with a single loop. */
    run: string;
    hitPoints: number;
    /** Top speed as a multiple of the player's (1 = as fast). */
    speed: number;
    /** Half-hearts off the player per touch. 0 = harmless to touch. */
    contactDamage: number;
    /** Seconds before the same monster's touch can hurt again. */
    contactCooldown: number;
    /**
     * Shoots at the player (`damage` in half-hearts) - fired only at a player within `range`
     * tiles (straight line, which is also how far the shot flies), and only while the monster
     * is somewhere the player can see. None = melee only.
     */
    ranged?: Weapon;
    /** Makes this monster's steering - called once per monster spawned, so a behaviour can keep its own state. */
    behaviour: () => IMonsterBehaviour;
}

/** A game's monsters. `T` is the game's own monster names, so its `defaultPool` and `defs` are checked against them. */
export interface IMonsterRoster<T extends MonsterType = MonsterType> {
    /** Every monster a spawner can produce, in the order the editor's spawner dialog lists them. */
    types: ReadonlyArray<T>;
    /** The pool a new spawner starts with, and a saved one falls back to if none of its monsters are known. Defaults to the first type. */
    defaultPool?: ReadonlyArray<T>;
    /** How each monster looks, fights and moves. */
    defs: { readonly [K in T]: MonsterDef };
    /** Sprite drawn over a spawner's cells in play. Its size sets the spawner's (solid) footprint - see `SpawnerCells`. None = an invisible, one-cell spawner. */
    spawnerSprite?: string;
}

export default class MonsterRoster {
    private static _inst: MonsterRoster;
    static get inst(): MonsterRoster {
        if (!MonsterRoster._inst) {
            MonsterRoster._inst = new MonsterRoster();
        }
        return MonsterRoster._inst;
    }

    // No monsters until the game loads its roster.
    private roster: IMonsterRoster = { types: [], defs: {} };

    Load<T extends MonsterType>(roster: IMonsterRoster<T>): void {
        this.roster = roster;
    }

    get Types(): ReadonlyArray<MonsterType> {
        return this.roster.types;
    }

    get DefaultPool(): ReadonlyArray<MonsterType> {
        return this.roster.defaultPool || this.roster.types.slice(0, 1);
    }

    get SpawnerSprite(): string | undefined {
        return this.roster.spawnerSprite;
    }

    Has(value: unknown): value is MonsterType {
        return typeof value === "string" && this.roster.types.indexOf(value) > -1;
    }

    Def(type: MonsterType): MonsterDef | undefined {
        return this.Has(type) ? this.roster.defs[type] : undefined;
    }

    /** Name of the animation that shows the monster standing still - its picture in the spawner dialog. */
    IdleAnimation(type: MonsterType): string {
        const def = this.Def(type);
        return def ? def.idle : type;
    }
}
