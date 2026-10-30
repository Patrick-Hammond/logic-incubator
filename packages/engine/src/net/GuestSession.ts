/**
 * A guest's side of an online run. Its world is never stepped: the guest sends
 * the host its hero's inputs every step, and draws the host's snapshots - the
 * monsters, shots and other heroes a little behind, between two snapshots
 * (see `Replica`, `PlayClock`), and its own hero ahead, moved the moment the
 * player moves and put right as the host's word on it comes (see
 * `Prediction`). What happened in between - pickups, keys dropped, spawners
 * destroyed, doors - it does to its own level as it's told, and it passes on
 * the host's events (see Events.ts) as its own, so a HUD, sounds or an end
 * screen hear of them as they would offline. Over a direct link a snapshot
 * may be lost, or come after a newer one; what happened always comes, in
 * order (see `MayBeLost`). If its connection goes, its hero
 * stands still until it's back in the room (`Rejoin`, from its lobby); the host
 * then says what it missed (`catch-up`) before anything else. Pure - no pixi -
 * so it runs under the plain node test runner.
 */

import type { Vec2Like } from "@logic-incubator/lib/math/Geometry";
import { RelayHost } from "@logic-incubator/lib/net/RelayRooms";
import type RelaySession from "@logic-incubator/lib/net/RelaySession";
import type { EncounterView } from "../Encounter";
import {
    ALL_PLAYERS_DIED, BOSS_WOKE, DOOR_LOCKED, HERO_TELEPORTED, KEYS_DROPPED, LEVEL_COMPLETED, MONSTER_HIT, MONSTER_KILLED, MONSTER_SPAWNED, PICKUP_COLLECTED, PLAYER_DAMAGED,
    PLAYER_DIED, LIGHT_SPELL_CAST, QUEST_UPDATED, SHOT_FIRED, SHOT_STOPPED, SPAWNER_DESTROYED, SPAWNER_HIT
} from "../Events";
import type { IPlayerInput } from "../input/PlayerControl";
import MonsterRoster from "../level/entities/MonsterRoster";
import { NoInput } from "../sim/World";
import { ApplyHeroSnapshot } from "./HeroSync";
import type { NetLevelContext } from "./NetPlay";
import PlaySession, { ByteRate, BytesText } from "./PlaySession";
import { CatchUpMessage, IsLastingEvent, NetEvent, PlayMessage, Snapshot } from "./PlayMessages";
import PlayClock from "./PlayClock";
import Prediction from "./Prediction";
import Replica from "./Replica";

/** How many of its latest inputs a guest sends each step - so a few lost in a row on a direct link's fast lane cost nothing. */
export const InputsSent = 6;

export default class GuestSession extends PlaySession {
    readonly IsHost = false;
    /** The round the host is on, as last told - see `HostSession`. */
    private round = 0;
    /** This round's snapshots that came before its level was ready here, to play through once it is. */
    private queued: Snapshot[] = [];
    private replica: Replica | null = null;
    private prediction = new Prediction();
    private clock = new PlayClock();
    private restart: (() => void) | null = null;
    private received = new ByteRate();
    /** Whether it's back in the room after its connection went, and waiting to hear what it missed - nothing else is played till then. */
    private catchingUp = false;
    /** What it missed, heard before its level was ready to take it - done as the level begins. */
    private missed: CatchUpMessage | null = null;
    /** How many lasting events (see `IsLastingEvent`) have been done to this level - where a `catch-up` picks up from. */
    private lasting = 0;
    /** Whether this level's end (`all-died`, `completed`) has been heard - a `catch-up` doesn't say it twice. */
    private over = false;

    /** The copy of the host's encounter - null until a level has begun. */
    get Entities(): EncounterView | null {
        return this.replica;
    }

    /** The host's step being drawn (see `PlayClock`). */
    get DrawnTick(): number {
        return this.clock.Tick;
    }

    /** This hero's guessing, and the host putting it right. */
    get Prediction(): Prediction {
        return this.prediction;
    }

    /** Whether the host's play has reached this machine yet this level - until then, nothing moves. */
    get Playing(): boolean {
        return !!this.context && this.clock.Started;
    }

    /** Whether it's in touch with the host: not while its connection is gone, nor until it's heard what it missed. */
    get Connected(): boolean {
        return !this.Ended && !this.catchingUp;
    }

    /**
     * Back in the room after its connection went, as `session` (see `GuestLobby`): play goes on from there once the host
     * has said what it missed. Inputs the host never had are let go - the host's word on where the hero stands wins.
     */
    Rejoin(session: RelaySession): void {
        if (this.ended) {
            return;
        }
        this.Listen(session);
        this.catchingUp = true;
        this.queued = [];
        this.prediction.Forget();
    }

    Begin(context: NetLevelContext): void {
        this.context = context;
        this.restart = context.restart;
        this.replica = new Replica({ you: this.You, sizeFor: context.sizeFor });
        this.replica.Reset(context.world.encounter.spawners);
        this.prediction.Reset();
        this.clock.Reset();
        this.lasting = 0;
        this.over = false;
        // No inputs yet - just that this machine has the level ready.
        this.Send(RelayHost, { t: "input", round: this.round, inputs: [] });
        const missed = this.missed;
        this.missed = null;
        if (missed && missed.round === this.round) {
            this.CatchUp(missed);
        }
        const queued = this.queued.filter(snapshot => snapshot.round === this.round);
        this.queued = [];
        queued.forEach(snapshot => this.Apply(snapshot));
    }

    Step(local: ReadonlyArray<IPlayerInput | undefined>): void {
        const context = this.context;
        const replica = this.replica;
        // With its connection gone, its hero stands still: the host would never play what it did.
        if (!context || !replica || !this.clock.Started || !this.Connected) {
            return;
        }
        const world = context.world;
        const hero = world.Heroes[this.You];
        if (!hero) {
            return;
        }
        const wasLit = !!hero.Spell && !!hero.Spell.lit;
        const numbered = this.prediction.Step(hero, local[this.You] || NoInput, this.Others(), world.Collider, context.level);
        // Its own hero's doings it hears as it does them, rather than when the host's word on them comes.
        if (!wasLit && hero.Spell && hero.Spell.lit) {
            context.emit(LIGHT_SPELL_CAST, this.You);
        }
        const trip = this.prediction.Trip;
        if (trip) {
            context.emit(HERO_TELEPORTED, this.You, trip.from.x, trip.from.y, trip.to.x, trip.to.y);
        }
        const shot = hero.TakeShot();
        if (shot) {
            const setup = hero.EquippedWeapon.shot;
            replica.Fire(hero.Centre, shot, setup, numbered.seq || 0);
            context.emit(SHOT_FIRED, setup, this.You);
        }
        const level = context.level;
        replica.StepStandIns((x, y) => level.IsSolid(x, y) || !level.IsCellVisible(x, y));
        this.Send(RelayHost, { t: "input", round: this.round, inputs: this.prediction.Recent(InputsSent) });
    }

    Frame(frames: number): void {
        this.PingNow([RelayHost]);
        const context = this.context;
        const replica = this.replica;
        if (!context || !replica || !this.clock.Started) {
            return;
        }
        this.clock.Advance(this.now(), frames);
        const tick = this.clock.Tick;
        replica.Sample(tick, frames);
        const world = context.world;
        world.Heroes.forEach((hero, i) => {
            const moment = i === this.You ? null : replica.HeroAt(i, tick);
            if (!moment) {
                return;
            }
            ApplyHeroSnapshot(hero, moment.snapshot);
            const state = hero.Writable;
            state.position.Set(moment.x, moment.y);
            state.previous.Copy(state.position);
            state.orb.Set(moment.orbX, moment.orbY);
            state.previousOrb.Copy(state.orb);
        });
        this.prediction.Settle(frames);
        const active = world.Active;
        // With no one in play, what was last seen stays seen - as the host's does.
        if (active.length) {
            context.level.UpdateVisibleRegions(active.map(hero => hero.Tile));
        }
    }

    /** It's leaving the run: the host is told, so the hero goes at once rather than being kept for it to come back. */
    End(): void {
        if (!this.Ended) {
            this.Send(RelayHost, { t: "leave" });
        }
        super.End();
    }

    DrawOffset(index: number): Vec2Like | null {
        return index === this.You ? this.prediction.Offset : null;
    }

    Stats(): string[] {
        const rtt = this.RoundTrip(RelayHost);
        const now = this.now();
        const newest = this.replica && this.replica.Newest;
        const behind = newest ? Math.round(((newest.tick - this.clock.Tick) * 1000) / 60) : 0;
        return [
            "GUEST - ROUND " + (this.round + 1),
            "ROUND TRIP " + (rtt === undefined ? "-" : Math.round(rtt) + " MS") + ", " + this.LinkText(RelayHost),
            // Far ahead of the newest means none are coming - the level is over, or the host stalled.
            "SNAPSHOT " + BytesText(this.received.Last) + ", " + BytesText(this.received.PerSecond(now)) + "/S" + (behind < -250 ? ", NONE COMING" : ", DRAWN " + behind + " MS BEHIND"),
            "CORRECTIONS " + this.prediction.Corrections + ", LAST " + this.prediction.LastError.toFixed(1) + " PX",
            "INPUTS NOT YET PLAYED " + this.prediction.Pending
        ];
    }

    protected OnMessage(from: number, message: PlayMessage, bytes: number): void {
        if (from !== RelayHost) {
            return;
        }
        if (message.t === "catch-up") {
            this.Missed(message);
            return;
        }
        if (this.catchingUp) {
            // From before the host knew it was back: what's in them comes with the catch-up.
            return;
        }
        if (message.t === "snapshot") {
            this.received.Add(bytes, this.now());
            if (message.round !== this.round) {
                return;
            }
            if (this.context) {
                this.Apply(message);
            } else {
                this.queued.push(message);
            }
        } else if (message.t === "restart") {
            this.round = message.round;
            this.queued = [];
            if (this.context) {
                this.context = null;
                if (this.restart) {
                    this.restart();
                }
            }
        }
    }

    /** What it missed while its connection was gone: the round now, and everything lasting done in it. */
    private Missed(message: CatchUpMessage): void {
        if (!this.catchingUp) {
            return;
        }
        this.catchingUp = false;
        if (message.round !== this.round) {
            // The host has started the level over meanwhile: so does this machine, then catches up as it begins.
            this.round = message.round;
            this.missed = message;
            if (this.context) {
                this.context = null;
                if (this.restart) {
                    this.restart();
                }
            }
        } else if (this.context) {
            this.CatchUp(message);
        } else {
            this.missed = message;
        }
    }

    /**
     * Does to this level what lastingly happened in it that it hasn't yet done - quietly, as it's past - and, if it has
     * ended meanwhile, ends it here too, as it still is.
     */
    private CatchUp(message: CatchUpMessage): void {
        const done = this.lasting;
        let index = 0;
        message.events.forEach(event => {
            if (!IsLastingEvent(event)) {
                if (!this.over) {
                    this.Happened(event);
                }
            } else if (index++ >= done) {
                this.Happened(event, true);
            }
        });
    }

    /**
     * A snapshot of this round: what happened, the doors, then the world to draw - and this machine's hero put right.
     * One older than the newest - overtaken on a direct link (see `MayBeLost`) - is only what happened in it: the world
     * has moved on from the rest.
     */
    private Apply(snapshot: Snapshot): void {
        const context = this.context;
        const replica = this.replica;
        if (!context || !replica) {
            return;
        }
        snapshot.events.forEach(event => this.Happened(event));
        // Happening can end the level - an end screen, a restart - and with it this one.
        if (this.context !== context) {
            return;
        }
        const newest = replica.Newest;
        if (newest && snapshot.tick <= newest.tick) {
            return;
        }
        const level = context.level;
        snapshot.doors.forEach((open, i) => {
            if (i < level.doors.length) {
                level.SetDoorOpen(i, open);
            }
        });
        this.clock.Observe(snapshot.tick, this.now());
        replica.Push(snapshot);
        const hero = context.world.Heroes[this.You];
        const mine = snapshot.heroes[this.You];
        if (hero && mine) {
            this.prediction.Reconcile(hero, mine, this.Others(), context.world.Collider, level);
        }
    }

    /** Does on this machine what the host says happened, and tells the game, as the host's world told it - unless it's `past`, caught up with. */
    private Happened(event: NetEvent, past = false): void {
        const context = this.context!;
        const { world, level } = context;
        const emit = past ? () => undefined : context.emit;
        const hero = "hero" in event ? world.Heroes[event.hero] : undefined;
        if (IsLastingEvent(event)) {
            this.lasting++;
        }
        switch (event.e) {
            case "pickup": {
                const collected = level.CollectPickupsAt(event.x, event.y);
                if (hero) {
                    collected.forEach(pickup => hero.ApplyPickup(pickup));
                }
                emit(PICKUP_COLLECTED, event.hero, event.x, event.y, collected);
                break;
            }
            case "keys":
                if (hero) {
                    hero.DropKeys().forEach(key => level.DropPickup(event.x, event.y, { kind: "key", id: key.id }, key.sprite));
                }
                emit(KEYS_DROPPED, event.hero, event.x, event.y);
                break;
            case "spawner": {
                const state = world.encounter.spawners[event.index];
                if (state && !state.destroyed) {
                    state.destroyed = true;
                    level.RemoveSpawner(state.spawner);
                    emit(SPAWNER_DESTROYED, state.spawner);
                }
                break;
            }
            case "spawner-hit": {
                const state = world.encounter.spawners[event.index];
                if (state && !state.destroyed) {
                    emit(SPAWNER_HIT, state.spawner);
                }
                break;
            }
            case "killed":
                emit(MONSTER_KILLED, MonsterRoster.inst.Types[event.type], event.x, event.y, event.hero, event.boss);
                break;
            case "hit":
                emit(MONSTER_HIT, MonsterRoster.inst.Types[event.type]);
                break;
            case "spawned":
                emit(MONSTER_SPAWNED, MonsterRoster.inst.Types[event.type]);
                break;
            case "woke":
                emit(BOSS_WOKE, MonsterRoster.inst.Types[event.type]);
                break;
            case "fired": {
                // This machine's own it heard as it fired them (see `Step`); one the host hasn't yet said the kind of - its snapshot overtaken - goes unheard.
                const setup = this.replica!.Shot(event.shot);
                if (setup && event.hero !== this.You) {
                    emit(SHOT_FIRED, setup, event.hero);
                }
                break;
            }
            case "cast":
                if (event.hero !== this.You) {
                    emit(LIGHT_SPELL_CAST, event.hero);
                }
                break;
            case "locked":
                emit(DOOR_LOCKED, event.hero, event.x, event.y);
                break;
            case "teleported":
                if (event.hero !== this.You) {
                    emit(HERO_TELEPORTED, event.hero, event.fromX, event.fromY, event.x, event.y);
                }
                break;
            case "stopped": {
                const setup = this.replica!.Shot(event.shot);
                if (setup) {
                    emit(SHOT_STOPPED, setup);
                }
                break;
            }
            case "damaged":
                emit(PLAYER_DAMAGED, event.damage, event.hitPoints, event.hero);
                break;
            case "died":
                emit(PLAYER_DIED, event.hero);
                break;
            case "all-died":
                this.over = true;
                emit(ALL_PLAYERS_DIED);
                break;
            case "completed":
                this.over = true;
                emit(LEVEL_COMPLETED, event.hero);
                break;
            case "shot":
                this.replica!.AddShot(event.index, event.setup);
                break;
            case "quest": {
                // The host's quests are the run's: this machine's follow them, never moving on by themselves.
                const was = world.quests.Follow(event.index, event.state, event.progress);
                if (was !== null) {
                    emit(QUEST_UPDATED, world.quests.Quests[event.index].def.id, event.state, event.progress, was);
                }
                break;
            }
        }
    }

    /** The heroes in play besides this machine's, as drawn - who it could warp to, as the host's world sees it. */
    private Others() {
        const world = this.context!.world;
        return world.Active.filter(hero => hero.Index !== this.You);
    }
}
