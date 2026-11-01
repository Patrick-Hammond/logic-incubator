/**
 * Everything that plays out in a level, for any number of heroes: each step the
 * heroes move with the input they're given, open doors, see, pick things up and
 * shoot, then the monsters and shots move (see `Encounter`). Keys are the team's:
 * one carried by any living hero opens its doors for all. A hero who falls drops
 * the keys they carried and the rest play on; when none is left standing it
 * emits `ALL_PLAYERS_DIED`. The first to reach a way out ends the level for
 * everyone (`LEVEL_COMPLETED`). On a shared screen the party is held within one
 * screen (`SetLeash`), and a hero far from the rest can warp to them. Online, a
 * hero whose player's connection has gone is away (`SetAway`): out of play,
 * standing where they were, until their player is back. The level's quests
 * (`Quests`) are kept here, moved on by what's picked up and killed; one that
 * `ends` the level ends it as a way out does. A hero who walks onto a portal comes
 * out of its partner (see `Portals`) - on a shared screen with the whole party. A
 * lone hero on one machine can talk (`SetTalk`): walking into an NPC asks for the
 * talk (`NPC_BUMPED`). A hero who keeps walking into something pushable shoves it a
 * cell on (`OBJECT_PUSHED`). No camera
 * and no sprites - `DungeonMain` draws it. Pure - no pixi - so it runs under the
 * plain node test runner.
 */

import { Vec2, Vec2Like } from "@logic-incubator/lib/math/Geometry";
import { TileSize } from "../Constants";
import type { PlayerSetup } from "../DungeonMain";
import Encounter, { EncounterLevel, EncounterOptions, Monster } from "../Encounter";
import { ALL_PLAYERS_DIED, DOOR_LOCKED, HERO_TELEPORTED, KEYS_DROPPED, LEVEL_COMPLETED, LIGHT_SPELL_CAST, NPC_BUMPED, OBJECT_PUSHED, PICKUP_COLLECTED, QUEST_NOTED, QUEST_UPDATED } from "../Events";
import type { IPlayerInput } from "../input/PlayerControl";
import type { CollectedPickup } from "../level/Level";
import { LightSpell } from "../level/entities/LightSpell";
import { PickupCellsReached, PickupSpot, PickupValue } from "../level/entities/Pickups";
import { BoxOnCell, Pushable, PushDelay, PushTarget } from "../level/entities/Pushables";
import TileCollision from "../level/TileCollision";
import QuestLog, { QuestDef, QuestHappening, QuestLevel, QuestState, QuestStatus } from "../story/Quests";
import { BumpedNpc } from "../story/Talk";
import type { MoveCollider } from "../view/helpers/PlayerMovement";
import Hero from "./Hero";
import { LeashBoxFor, Leashed } from "./Leash";

/** The parts of `Level` a world uses, on top of what its encounter does. */
export interface WorldLevel extends EncounterLevel, QuestLevel {
    /** The level's quests - see `Quests`. */
    readonly quests: ReadonlyArray<QuestDef>;
    /** Whether there's an NPC to talk to on the cell (a `DIALOG` brush). */
    IsTalker(tileX: number, tileY: number): boolean;
    readonly playerStartPosition: Vec2Like | undefined;
    IsFloor(tileX: number, tileY: number): boolean;
    IsExit(tileX: number, tileY: number): boolean;
    /** Where a hero who stepped from cell `from` onto cell `to` comes out of a portal, if they walked onto one - see `Level.PortalJump`. */
    PortalJump(from: Vec2Like, to: Vec2Like): Vec2Like | null;
    IsDoorLocked(tileX: number, tileY: number, canOpen: (lockId: number) => boolean): boolean;
    UpdateDoors(tiles: ReadonlyArray<Vec2Like>, canOpen: (lockId: number) => boolean): void;
    UpdateVisibleRegions(tiles: ReadonlyArray<Vec2Like>): void;
    /** Every pickup not yet collected - where it lies, for telling which a hero reaches (see `PickupCellsReached`). */
    readonly pickups: ReadonlyArray<PickupSpot>;
    CollectPickupsAt(tileX: number, tileY: number): CollectedPickup[];
    DropPickup(tileX: number, tileY: number, value: PickupValue, sprite: string | null): Vec2Like;
    /** Everything a hero can push, where it is now - in the level's order, which an online run's `pushed` event names one by. */
    readonly pushables: ReadonlyArray<Pushable>;
    /** The thing a hero can push that's on the cell, if any. */
    PushableAt(tileX: number, tileY: number): Pushable | null;
    /** Whether `pushable` can go a cell `dx`, `dy` - onto open floor (see `Level.CanPush`), and nowhere `taken` says someone stands. */
    CanPush(pushable: Pushable, dx: number, dy: number, taken: (tileX: number, tileY: number) => boolean): boolean;
    /** Moves pushable `index` (of `pushables`) so its cell is `tileX`, `tileY`, its solid cells with it. */
    MovePushable(index: number, tileX: number, tileY: number): void;
}

/** How far from the level's start, in steps over open floor, the rest of the party may be placed. */
const StartSpread = 6;

/** How far, in tiles, a hero must be from every other one standing to warp to the nearest. */
export const WarpDistance = 8;

/** What a hero who has no input this step does: nothing. */
export const NoInput: IPlayerInput = { direction: new Vec2(), firing: false, aimX: 0, casting: false };

/**
 * What one hero is given for a step (see `World.Step`): an input; undefined, to stand still; or a list of inputs,
 * each a step of their own - none to hold them where they are, timers and all, as an online host does while a
 * guest's next input is still on its way, and two to catch up once it's come (see `RemoteInput`).
 */
export type HeroInput = IPlayerInput | ReadonlyArray<IPlayerInput> | undefined;

/** A trip through a portal: the cell of the one walked onto, and of the one come out of. */
export type PortalTrip = { from: Vec2Like; to: Vec2Like };

/**
 * Sends `hero`, who was on cell `from` before the step they've just taken, through the portal they've walked onto, if they
 * have (see `WorldLevel.PortalJump`): they come out standing on the other one, at once. Returns the trip, or null. The same
 * on the host and on a guest moving its own hero ahead of it (see `Prediction`), as it's decided by where they are alone.
 */
export function TakePortal(hero: Hero, from: Vec2Like, level: Pick<WorldLevel, "PortalJump">): PortalTrip | null {
    const entered = hero.Tile;
    const to = level.PortalJump(from, entered);
    if (!to) {
        return null;
    }
    hero.WarpTo({ x: to.x * TileSize, y: to.y * TileSize });
    return { from: entered, to: { x: to.x, y: to.y } };
}

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
    /** How the level's quests stand - started over with each `Reset`. */
    readonly quests: QuestLog;
    /** What the level's dialog scripts have `set` (see `DialogScript`) - forgotten with each `Reset`. */
    readonly flags = new Set<string>();
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
    /** Whether heroes talk to the NPCs they walk into - see `SetTalk`. */
    private talk = false;
    /** By slot: whether that hero was walking into an NPC last step - a talk starts as they first do, not again while they keep at it. */
    private bumping: boolean[] = [];
    /** By slot: whether that hero was walking into a door the team has no key for last step - `DOOR_LOCKED` is once, as they first do. */
    private locked: boolean[] = [];
    /** By slot: what that hero has been walking into that can be pushed, which way, and for how long - null for nothing. See `Lean`. */
    private leaning: Array<{ pushable: Pushable; dx: number; dy: number; seconds: number } | null> = [];
    /** The slot of the hero who met the goal of a quest that `ends` the level, since the last step - -1 for none. */
    private questEnd = -1;
    /** The slot of the hero whose doing is being recorded - who gets the credit for a quest it completes. */
    private doer = 0;

    constructor(private level: WorldLevel, private options: EncounterOptions) {
        this.encounter = new Encounter(level, { ...options, killed: (monster, hero) => this.Killed(monster, hero) });
        this.quests = new QuestLog(
            (status, was) => this.QuestChanged(status, was),
            (status, text) => this.options.emit(QUEST_NOTED, status.def.id, text)
        );
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

    /** The heroes in play: standing, and not away (see `SetAway`) - in slot order. */
    get Active(): Hero[] {
        return this.heroes.filter(hero => hero.Alive && !hero.Away);
    }

    /** Whether every hero has fallen - or every one still standing is away. */
    get AllDown(): boolean {
        return this.allDown;
    }

    /** Whether a hero has reached a way out, ending the level. */
    get Completed(): boolean {
        return this.completed;
    }

    /** What keeps a hero out of walls, and out of doors the team can't open - for an online guest moving its own hero ahead of the host (see `Prediction`). */
    get Collider(): MoveCollider {
        return this.collision;
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
        this.bumping = this.heroes.map(() => false);
        this.locked = this.heroes.map(() => false);
        this.leaning = this.heroes.map(() => null);
        this.allDown = !this.heroes.length;
        this.completed = false;
        this.questEnd = -1;
        this.flags.clear();
        this.quests.Reset(this.level.quests, this.level);
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

    /**
     * Whether heroes talk to the NPCs they walk into (`NPC_BUMPED`) - for a lone hero on one machine (a Quest); in co-op
     * and online an NPC just stands there. Off until turned on.
     */
    SetTalk(on: boolean): void {
        this.talk = on;
    }

    /**
     * Counts something that happened toward the level's quests (see `QuestLog.Record`), done by hero `hero` - who gets the
     * credit if it completes one that ends the level.
     */
    RecordQuest(happening: QuestHappening, hero = 0): void {
        this.doer = hero;
        this.quests.Record(happening);
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
     * One step of play: each hero in play (`Active`) moves with their input (by slot - see `HeroInput`), or warps if they
     * asked to and may (see `WarpDistance`); the doors and what the team can see follow where they stand, each
     * picks up every pickup their sprite touches (`PickupCellsReached`; in slot order, so the first there gets it -
     * `PICKUP_COLLECTED`, once a cell) and fires;
     * then the encounter. A hero who walks onto a portal comes out of its partner (`TakePortal`, `HERO_TELEPORTED`) - and on a
     * shared screen (`SetLeash`) the rest of the party with them, around them, so no one is left off it. A hero on a way out ends the level there and then. `dt` in frames (1 at 60 a second),
     * `seconds` for timers.
     */
    Step(inputs: ReadonlyArray<HeroInput>, dt: number, seconds: number): void {
        if (this.allDown || this.completed || this.EndForQuest()) {
            return;
        }
        // Only those in play: one who is away neither moves, nor picks up, nor is gone for by the monsters.
        const living = this.Active;
        const shots: Array<{ hero: Hero; from: Vec2Like; direction: Vec2Like; seq: number }> = [];
        living.forEach(hero => {
            const given = inputs[hero.Index];
            const list: ReadonlyArray<IPlayerInput> = IsInputList(given) ? given : [given || NoInput];
            const others = living.filter(other => other !== hero);
            list.forEach(input => {
                const to = input.warping ? WarpTarget(hero, others) : null;
                if (to) {
                    hero.WarpTo(to.Position);
                }
                const box = this.leash && LeashBoxFor(others.map(other => other.Position), this.leash);
                const wasLit = !!hero.Spell && !!hero.Spell.lit;
                // After any warp: coming out on a portal isn't walking onto it.
                const from = hero.Tile;
                hero.Step(input, dt, seconds, box ? Leashed(this.collision, box) : this.collision);
                if (!wasLit && hero.Spell && hero.Spell.lit) {
                    this.options.emit(LIGHT_SPELL_CAST, hero.Index);
                }
                const trip = TakePortal(hero, from, this.level);
                if (trip) {
                    if (this.leash) {
                        this.BringParty(trip.to, others);
                    }
                    this.options.emit(HERO_TELEPORTED, hero.Index, trip.from.x, trip.from.y, trip.to.x, trip.to.y);
                }
                this.Bump(hero, input);
                this.Lean(hero, input, seconds);
                // Taken as it's fired: a hero given two steps at once can fire in each.
                const shot = hero.TakeShot();
                if (shot) {
                    shots.push({ hero, from: hero.Centre, direction: shot, seq: input.seq === undefined ? -1 : input.seq });
                }
            });
        });

        const tiles = living.map(hero => hero.Tile);
        this.level.UpdateDoors(tiles, lock => this.TeamCanOpen(lock));
        this.level.UpdateVisibleRegions(tiles);
        living.forEach((hero, i) => {
            // A whole cell at a time, as an online guest does it from `PICKUP_COLLECTED`.
            const reached = PickupCellsReached(hero.Figure, tiles[i], this.level.pickups, (from, to) => this.collision.IsHeightBlocked(from, to));
            reached.forEach(cell => {
                const collected = this.level.CollectPickupsAt(cell.x, cell.y);
                if (collected.length) {
                    collected.forEach(pickup => hero.ApplyPickup(pickup));
                    this.options.emit(PICKUP_COLLECTED, hero.Index, cell.x, cell.y, collected);
                    collected.forEach(pickup => this.RecordQuest({ kind: "collect", quest: pickup.value.quest, pickup: pickup.value }, hero.Index));
                }
            });
        });
        const out = living.find((hero, i) => this.level.IsExit(tiles[i].x, tiles[i].y));
        if (out) {
            this.completed = true;
            this.options.emit(LEVEL_COMPLETED, out.Index);
            return;
        }
        shots.forEach(shot => this.encounter.Fire(shot.from, shot.direction, shot.hero.EquippedWeapon.shot, "player", shot.hero.Index, shot.seq));

        this.encounter.Update(dt, seconds, living);
        this.CheckFallen();
        this.EndForQuest();
    }

    /**
     * Takes hero `index` out of play, for good this level - their player has left an online game (see
     * `Hero.Leave`). They count as down: the keys they carried drop where they stood, and with no one else
     * standing the level is over.
     */
    RemoveHero(index: number): void {
        const hero = this.heroes[index];
        if (!hero || hero.Gone) {
            return;
        }
        hero.Leave();
        if (!this.allDown && !this.completed) {
            this.CheckFallen();
        }
    }

    /**
     * Takes hero `index` out of play while their player's connection is gone (`away`), or puts them back in (see
     * `Hero.Away`) - the host's world, online. With no one else in play, the level is over, as if all had fallen.
     */
    SetAway(index: number, away: boolean): void {
        const hero = this.heroes[index];
        if (!hero || hero.Gone || hero.Away === away) {
            return;
        }
        hero.SetAway(away);
        if (away && !this.allDown && !this.completed) {
            this.CheckFallen();
        }
    }

    /** Puts `party` on the open floor nearest `cell` (see `StartCells`), where a hero has just come out of a portal. */
    private BringParty(cell: Vec2Like, party: ReadonlyArray<Hero>): void {
        const cells = StartCells(cell, party.length + 1, (x, y) => this.level.IsFloor(x, y));
        party.forEach((hero, i) => hero.WarpTo({ x: cells[i + 1].x * TileSize, y: cells[i + 1].y * TileSize }));
    }

    /** A monster died - `hero`'s shot killed it: the quests count it. */
    private Killed(monster: Monster, hero: number): void {
        this.RecordQuest({ kind: "kill", quest: monster.quest, monster: monster.type }, Math.max(0, hero));
    }

    private QuestChanged(status: Readonly<QuestStatus>, was: QuestState): void {
        if (status.state === "complete" && status.def.ends && this.questEnd < 0) {
            this.questEnd = this.doer;
        }
        this.options.emit(QUEST_UPDATED, status.def.id, status.state, status.progress, was);
    }

    /** Ends the level if a quest that `ends` it has had its goal met since the last look - as a way out does - and returns whether it has. */
    private EndForQuest(): boolean {
        if (this.questEnd < 0 || this.completed || this.allDown) {
            return false;
        }
        this.completed = true;
        this.options.emit(LEVEL_COMPLETED, this.questEnd);
        return true;
    }

    /** Asks for a talk (`NPC_BUMPED`) if `hero`, given `input`, has just walked into an NPC - and talking is on. */
    private Bump(hero: Hero, input: IPlayerInput): void {
        // A door is walked into the way an NPC is.
        const door = BumpedNpc(hero.Position, input.direction, (x, y) => this.IsLockedOut(x, y), TileSize);
        const wasLocked = this.locked[hero.Index];
        this.locked[hero.Index] = !!door;
        if (door && !wasLocked) {
            this.options.emit(DOOR_LOCKED, hero.Index, door.x, door.y);
        }
        if (!this.talk) {
            return;
        }
        const npc = BumpedNpc(hero.Position, input.direction, (x, y) => this.level.IsTalker(x, y), TileSize);
        const was = this.bumping[hero.Index];
        this.bumping[hero.Index] = !!npc;
        if (npc && !was) {
            this.options.emit(NPC_BUMPED, hero.Index, npc.x, npc.y);
        }
    }

    /**
     * Pushes what `hero`, given `input`, is walking into (see `PushTarget`) a cell on, once they've kept at it for `PushDelay`:
     * if there's room for it there (`WorldLevel.CanPush`) and no one is standing in it (`OBJECT_PUSHED`, with the hero, which it
     * is, the cell it's on now and its sprite). For the next cell they keep at it as long again.
     */
    private Lean(hero: Hero, input: IPlayerInput, seconds: number): void {
        const level = this.level;
        const target = PushTarget(hero.Position, input.direction, TileSize, (x, y) => level.PushableAt(x, y) !== null);
        const pushable = target && level.PushableAt(target.x, target.y);
        if (!target || !pushable) {
            this.leaning[hero.Index] = null;
            return;
        }
        const was = this.leaning[hero.Index];
        const leaning = was && was.pushable === pushable && was.dx === target.dx && was.dy === target.dy ? was : { pushable, dx: target.dx, dy: target.dy, seconds: 0 };
        this.leaning[hero.Index] = leaning;
        leaning.seconds += seconds;
        if (leaning.seconds < PushDelay || !level.CanPush(pushable, target.dx, target.dy, (x, y) => this.Standing(x, y))) {
            return;
        }
        leaning.seconds = 0;
        const index = level.pushables.indexOf(pushable);
        level.MovePushable(index, pushable.x + target.dx, pushable.y + target.dy);
        this.options.emit(OBJECT_PUSHED, hero.Index, index, pushable.x, pushable.y, pushable.sprite);
    }

    /** Whether anyone stands on the cell, even in part: a hero still in the level - away or not - or a monster. */
    private Standing(tileX: number, tileY: number): boolean {
        const on = (position: Vec2Like) => BoxOnCell(position, tileX, tileY, TileSize);
        return this.heroes.some(hero => hero.Alive && !hero.Gone && on(hero.Position)) || this.encounter.monsters.some(m => !m.dead && on(m.position));
    }

    /** Deals with every hero who has fallen since the last look - whatever felled them - and ends the level if none is left in play. */
    private CheckFallen(): void {
        this.heroes.forEach((hero, i) => {
            if (!hero.Alive && !this.fallen[i]) {
                this.fallen[i] = true;
                this.Fall(hero);
            }
        });
        if (!this.Active.length) {
            this.allDown = true;
            this.options.emit(ALL_PLAYERS_DIED);
        }
    }

    /** A hero has just fallen: the keys they carried drop where they fell, for the others to pick up (`KEYS_DROPPED`). */
    private Fall(hero: Hero): void {
        const tile = hero.Tile;
        const keys = hero.DropKeys();
        let cell: Vec2Like = tile;
        keys.forEach(key => (cell = this.level.DropPickup(tile.x, tile.y, { kind: "key", id: key.id }, key.sprite)));
        if (keys.length) {
            this.options.emit(KEYS_DROPPED, hero.Index, cell.x, cell.y);
        }
    }
}

function IsInputList(input: HeroInput): input is ReadonlyArray<IPlayerInput> {
    return Array.isArray(input);
}
