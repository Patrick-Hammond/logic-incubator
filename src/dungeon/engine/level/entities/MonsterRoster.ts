/**
 * The monsters a spawner can produce. The engine doesn't know any itself - the game
 * loads its own roster at boot, before the editor or a level is created, and spawner
 * values (see Spawners.ts) are checked against whatever it loaded. Pure - no pixi -
 * so it runs under the plain node test runner, same as Spawners.ts.
 */

export type MonsterType = string;

/** A game's monsters. `T` is the game's own monster names, so its `defaultPool` is checked against them. */
export interface IMonsterRoster<T extends MonsterType = MonsterType> {
    /** Every monster a spawner can produce, in the order the editor's spawner dialog lists them. */
    types: ReadonlyArray<T>;
    /** The pool a new spawner starts with, and a saved one falls back to if none of its monsters are known. Defaults to the first type. */
    defaultPool?: ReadonlyArray<T>;
    /** Name of the animation that shows the monster standing still - its picture in the spawner dialog. */
    idleAnimation(type: T): string;
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
    private roster: IMonsterRoster = { types: [], idleAnimation: type => type };

    Load<T extends MonsterType>(roster: IMonsterRoster<T>): void {
        this.roster = roster;
    }

    get Types(): ReadonlyArray<MonsterType> {
        return this.roster.types;
    }

    get DefaultPool(): ReadonlyArray<MonsterType> {
        return this.roster.defaultPool || this.roster.types.slice(0, 1);
    }

    Has(value: unknown): value is MonsterType {
        return typeof value === "string" && this.roster.types.indexOf(value) > -1;
    }

    IdleAnimation(type: MonsterType): string {
        return this.roster.idleAnimation(type);
    }
}
