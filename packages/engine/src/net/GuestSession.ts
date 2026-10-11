/**
 * A guest's side of an online run. Its world is never stepped: the guest sends
 * the host its hero's inputs every step, and draws the host's snapshots - the
 * monsters, shots and other heroes a little behind, between two snapshots
 * (see `Replica`, `PlayClock`), and its own hero ahead, moved the moment the
 * player moves and put right as the host's word on it comes (see
 * `Prediction`). What happened in between - pickups, keys dropped, spawners
 * destroyed, doors - it does to its own level as it's told, and it passes on
 * the host's events (see Events.ts) as its own, so a HUD, sounds or an end
 * screen hear of them as they would offline. Pure - no pixi - so it runs under
 * the plain node test runner.
 */

import type { Vec2Like } from "@logic-incubator/lib/math/Geometry";
import { RelayHost } from "@logic-incubator/lib/net/RelayRooms";
import type { EncounterView } from "../Encounter";
import { ALL_PLAYERS_DIED, KEYS_DROPPED, LEVEL_COMPLETED, MONSTER_KILLED, PICKUP_COLLECTED, PLAYER_DAMAGED, PLAYER_DIED, SPAWNER_DESTROYED } from "../Events";
import type { IPlayerInput } from "../input/PlayerControl";
import MonsterRoster from "../level/entities/MonsterRoster";
import { NoInput } from "../sim/World";
import { ApplyHeroSnapshot } from "./HeroSync";
import type { NetLevelContext } from "./NetPlay";
import PlaySession, { ByteRate, BytesText } from "./PlaySession";
import type { NetEvent, PlayMessage, Snapshot } from "./PlayMessages";
import PlayClock from "./PlayClock";
import Prediction from "./Prediction";
import Replica from "./Replica";

/** How many of its latest inputs a guest sends each step - one lost on the way costs nothing. */
export const InputsSent = 3;

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

    Begin(context: NetLevelContext): void {
        this.context = context;
        this.restart = context.restart;
        this.replica = new Replica({ you: this.You, sizeFor: context.sizeFor });
        this.replica.Reset(context.world.encounter.spawners);
        this.prediction.Reset();
        this.clock.Reset();
        // No inputs yet - just that this machine has the level ready.
        this.Send(RelayHost, { t: "input", round: this.round, inputs: [] });
        const queued = this.queued.filter(snapshot => snapshot.round === this.round);
        this.queued = [];
        queued.forEach(snapshot => this.Apply(snapshot));
    }

    Step(local: ReadonlyArray<IPlayerInput | undefined>): void {
        const context = this.context;
        const replica = this.replica;
        if (!context || !replica || !this.clock.Started) {
            return;
        }
        const world = context.world;
        const hero = world.Heroes[this.You];
        if (!hero) {
            return;
        }
        const numbered = this.prediction.Step(hero, local[this.You] || NoInput, this.Others(), world.Collider);
        const shot = hero.TakeShot();
        if (shot) {
            replica.Fire(hero.Centre, shot, hero.EquippedWeapon.shot, numbered.seq || 0);
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
        const living = world.Living;
        // With no one standing, what was last seen stays seen - as the host's does.
        if (living.length) {
            context.level.UpdateVisibleRegions(living.map(hero => hero.Tile));
        }
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
            "ROUND TRIP " + (rtt === undefined ? "-" : Math.round(rtt) + " MS"),
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

    /** A snapshot of this round: what happened, the doors, then the world to draw - and this machine's hero put right. */
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
            this.prediction.Reconcile(hero, mine, this.Others(), context.world.Collider);
        }
    }

    /** Does on this machine what the host says happened, and tells the game, as the host's world told it. */
    private Happened(event: NetEvent): void {
        const context = this.context!;
        const { world, level, emit } = context;
        const hero = "hero" in event ? world.Heroes[event.hero] : undefined;
        switch (event.e) {
            case "pickup":
                if (hero) {
                    level.CollectPickupsAt(event.x, event.y).forEach(pickup => hero.ApplyPickup(pickup));
                }
                emit(PICKUP_COLLECTED, event.hero, event.x, event.y);
                break;
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
            case "killed":
                emit(MONSTER_KILLED, MonsterRoster.inst.Types[event.type], event.x, event.y, event.hero);
                break;
            case "damaged":
                emit(PLAYER_DAMAGED, event.damage, event.hitPoints, event.hero);
                break;
            case "died":
                emit(PLAYER_DIED, event.hero);
                break;
            case "all-died":
                emit(ALL_PLAYERS_DIED);
                break;
            case "completed":
                emit(LEVEL_COMPLETED, event.hero);
                break;
            case "shot":
                this.replica!.AddShot(event.index, event.setup);
                break;
        }
    }

    /** The heroes standing besides this machine's, as drawn - who it could warp to. */
    private Others() {
        const world = this.context!.world;
        return world.Living.filter(hero => hero.Index !== this.You);
    }
}
