/**
 * Everything that plays out in a level, for any number of heroes: each step the
 * heroes move with the input they're given, open doors, see, pick things up and
 * shoot, then the monsters and shots move (see `Encounter`). Keys are the team's:
 * one carried by any living hero opens its doors for all. A hero who falls drops
 * the keys they carried and the rest play on; when none is left standing it
 * emits `ALL_PLAYERS_DIED`. The first to reach a way out ends the level for
 * everyone (`LEVEL_COMPLETED`). On a shared screen the party is held within one
 * screen (`SetLeash`), and a hero far from the rest can warp to them. No camera
 * and no sprites - `DungeonMain` draws it. Pure - no pixi - so it runs under the
 * plain node test runner.
 */

import { Vec2, Vec2Like } from "@logic-incubator/lib/math/Geometry";
import { TileSize } from "../Constants";
import type { PlayerSetup } from "../DungeonMain";
import Encounter, { EncounterLevel, EncounterOptions } from "../Encounter";
import { ALL_PLAYERS_DIED, LEVEL_COMPLETED } from "../Events";
import type { IPlayerInput } from "../input/PlayerControl";
import type { CollectedPickup } from "../level/Level";
import { LightSpell } from "../level/entities/LightSpell";
import { PickupValue } from "../level/entities/Pickups";
import TileCollision from "../level/TileCollision";
import Hero from "./Hero";
import { LeashBoxFor, Leashed } from "./Leash";

/** The parts of `Level` a world uses, on top of what its encounter does. */
export interface WorldLevel extends EncounterLevel {
    readonly playerStartPosition: Vec2Like | undefined;
    IsFloor(tileX: number, tileY: number): boolean;
    IsExit(tileX: number, tileY: number): boolean;
    IsDoorLocked(tileX: number, tileY: number, canOpen: (lockId: number) => boolean): boolean;
    UpdateDoors(tiles: ReadonlyArray<Vec2Like>, canOpen: (lockId: number) => boolean): void;
    UpdateVisibleRegions(tiles: ReadonlyArray<Vec2Like>): void;
    CollectPickupsAt(tileX: number, tileY: number): CollectedPickup[];
    DropPickup(tileX: number, tileY: number, value: PickupValue, sprite: string | null): Vec2Like;
}

/** How far from the level's start, in steps over open floor, the rest of the party may be placed. */
const StartSpread = 6;

/** How far, in tiles, a hero must be from every other one standing to warp to the nearest. */
export const WarpDistance = 8;

/** What a hero who has no input this step does: nothing. */
const NoInput: IPlayerInput = { direction: new Vec2(), firing: false, aimX: 0, casting: false };

/** The hero standing nearest `hero`, if every one of `others` is at least `WarpDistance` tiles away - null otherwise, or with none. */
export function WarpTarget(hero: Hero, others: ReadonlyArray<Hero>): Hero | null {
    let nearest: Hero | null = null;
    let best = Infinity;
    others.forEach(other => {
        const d = Math.hypot(other.Position.x - hero.Position.x, other.Position.y - hero.Position.y);
        if (d < best) {
            best = d;
            nearest = other;
        }
    });
    return best >= WarpDistance * TileSize ? nearest : null;
}

/**
 * `count` cells for a party to start on: `start` first, then the open floor nearest it, by steps (4-way,
 * over floor only, so no one starts beyond a wall). With too little floor near, the rest share `start`.
 */
export function StartCells(start: Vec2Like, count: number, isFloor: (x: number, y: number) => boolean): Vec2Like[] {
    const cells: Vec2Like[] = [{ x: start.x, y: start.y }];
    const seen = new Set<string>([start.x + "," + start.y]);
    let frontier: Vec2Like[] = [start];
    for (let step = 0; step < StartSpread && cells.length < count; step++) {
        const next: Vec2Like[] = [];
        frontier.forEach(cell => [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }].forEach(d => {
            const x = cell.x + d.x;
            const y = cell.y + d.y;
            const key = x + "," + y;
            if (seen.has(key) || !isFloor(x, y)) {
                return;
            }
            seen.add(key);
            next.push({ x, y });
            if (cells.length < count) {
                cells.push({ x, y });
            }
        }));
        frontier = next;
    }
    while (cells.length < count) {
        cells.push({ x: start.x, y: start.y });
    }
    return cells;
}

export default class World {
    readonly encounter: Encounter;
    private heroes: Hero[] = [];
    /** By slot: whether that hero's fall has been dealt with (their keys dropped). */
    private fallen: boolean[] = [];
    /** Every hero's collider: a closed door the team has no key for is a wall to them. */
    private collision: TileCollision;
    /** Whether every hero is down - nothing steps until the next `Reset`. */
    private allDown = false;
    /** Whether a hero has reached a way out - nothing steps until the next `Reset`. */
    private completed = false;
    /** The furthest apart heroes may get, in pixels between top-lefts - null for as far as they like. */
    private leash: { width: number; height: number } | null = null;

    constructor(private level: WorldLevel, private options: EncounterOptions) {
        this.encounter = new Encounter(level, options);
        this.collision = new TileCollision(level, (x, y) => this.IsLockedOut(x, y));
    }

    /** Every hero, in slot order, the fallen included. */
    get Heroes(): ReadonlyArray<Hero> {
        return this.heroes;
    }

    /** The heroes still standing, in slot order. */
    get Living(): Hero[] {
        return this.heroes.filter(hero => hero.Alive);
    }

    /** Whether every hero has fallen. */
    get AllDown(): boolean {
        return this.allDown;
    }

    /** Whether a hero has reached a way out, ending the level. */
    get Completed(): boolean {
        return this.completed;
    }

    /**
     * Starts the level over (call on every `LEVEL_CREATED`) with one hero per entry of `lightSpells` - each
     * with that light spell, if any, and `setup`'s hit points and weapons - placed together at the level's
     * start. The encounter starts over too, its random numbers from `seed`, and as tough as the party's size
     * calls for (see `Encounter.Reset`).
     */
    Reset(setup: Pick<PlayerSetup, "hitPoints" | "weapons">, lightSpells: ReadonlyArray<LightSpell | undefined>, seed?: number): void {
        const start = this.level.playerStartPosition;
        if (!start) {
            throw new Error("Player start position is not defined. Define it in the level data.");
        }
        const cells = StartCells(start, lightSpells.length, (x, y) => this.level.IsFloor(x, y));
        this.heroes = lightSpells.map((spell, i) => {
            const hero = new Hero(i, setup);
            hero.Reset(cells[i], spell);
            return hero;
        });
        this.fallen = this.heroes.map(() => false);
        this.allDown = !this.heroes.length;
        this.completed = false;
        this.encounter.Reset(seed, this.heroes.length);
        this.level.UpdateVisibleRegions(cells);
    }

    /**
     * Holds the party within `span` tiles of each other (between top-lefts), across and down - what fits
     * on a shared screen (see `PartySpan`): a hero stops at its edge as at a wall. Null lets them roam.
     */
    SetLeash(span: { width: number; height: number } | null): void {
        this.leash = span ? { width: span.width * TileSize, height: span.height * TileSize } : null;
    }

    /** Whether a door with this lock opens for the team: it's no lock, or a living hero carries its key. */
    TeamCanOpen(lockId: number): boolean {
        return this.heroes.some(hero => hero.Alive && hero.HasKeyFor(lockId));
    }

    /** Whether the cell is a closed door the team can't open - a wall to every hero. */
    IsLockedOut(tileX: number, tileY: number): boolean {
        return this.level.IsDoorLocked(tileX, tileY, lock => this.TeamCanOpen(lock));
    }

    /**
     * One step of play: each living hero moves with their input (by slot - a hero without one stands still),
     * or warps if they asked to and may (see `WarpDistance`); the doors and what the team can see follow
     * where they stand, each picks up what's under them (in slot order, so the first there gets it) and
     * fires; then the encounter. A hero on a way out ends the level there and then. `dt` in frames (1 at 60
     * a second), `seconds` for timers.
     */
    Step(inputs: ReadonlyArray<IPlayerInput | undefined>, dt: number, seconds: number): void {
        if (this.allDown || this.completed) {
            return;
        }
        const living = this.Living;
        living.forEach(hero => {
            const input = inputs[hero.Index] || NoInput;
            const others = living.filter(other => other !== hero);
            const to = input.warping ? WarpTarget(hero, others) : null;
            if (to) {
                hero.WarpTo(to.Position);
            }
            const box = this.leash && LeashBoxFor(others.map(other => other.Position), this.leash);
            hero.Step(input, dt, seconds, box ? Leashed(this.collision, box) : this.collision);
        });

        const tiles = living.map(hero => hero.Tile);
        this.level.UpdateDoors(tiles, lock => this.TeamCanOpen(lock));
        this.level.UpdateVisibleRegions(tiles);
        living.forEach((hero, i) => this.level.CollectPickupsAt(tiles[i].x, tiles[i].y).forEach(pickup => hero.ApplyPickup(pickup)));
        const out = living.find((hero, i) => this.level.IsExit(tiles[i].x, tiles[i].y));
        if (out) {
            this.completed = true;
            this.options.emit(LEVEL_COMPLETED, out.Index);
            return;
        }
        living.forEach(hero => {
            const shot = hero.TakeShot();
            if (shot) {
                this.encounter.Fire(hero.Centre, shot, hero.EquippedWeapon.shot, "player", hero.Index);
            }
        });

        this.encounter.Update(dt, seconds, living);

        // Whatever felled them - a monster this step, or a hit landed from outside it.
        this.heroes.forEach((hero, i) => {
            if (!hero.Alive && !this.fallen[i]) {
                this.fallen[i] = true;
                this.Fall(hero);
            }
        });
        if (!this.Living.length) {
            this.allDown = true;
            this.options.emit(ALL_PLAYERS_DIED);
        }
    }

    /** A hero has just fallen: the keys they carried drop where they fell, for the others to pick up. */
    private Fall(hero: Hero): void {
        const tile = hero.Tile;
        hero.DropKeys().forEach(key => this.level.DropPickup(tile.x, tile.y, { kind: "key", id: key.id }, key.sprite));
    }
}
