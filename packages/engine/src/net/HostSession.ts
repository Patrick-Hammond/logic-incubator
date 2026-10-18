/**
 * The host's side of an online run. Its world is the run's only one: each step
 * it plays the host's own hero from this machine's controls and each guest's
 * from the inputs they've sent (see `RemoteInput`), and every third step it
 * sends every guest a snapshot of the world and what has happened since the
 * last (see `Snapshot`) - 20 a second, and one more as a level ends. As a level
 * starts it waits, up to `WaitForGuestsMs`, for each guest to have it ready. A
 * guest who leaves takes their hero with them (`World.RemoveHero`). One whose
 * connection goes - or who sends nothing for `AwayAfterMs` - leaves their hero
 * away (`World.SetAway`), out of play, for up to `HoldAwayMs` to come back
 * (`Rejoin`, from the host's lobby); they're caught up on what they missed, and
 * their hero is back in play with their first input. The host starting the
 * level over starts it over for everyone. Pure - no pixi - so it runs under the
 * plain node test runner.
 */

import { RelayHost } from "@logic-incubator/lib/net/RelayRooms";
import type { EncounterView } from "../Encounter";
import {
    ALL_PLAYERS_DIED, BOSS_WOKE, KEYS_DROPPED, LEVEL_COMPLETED, MONSTER_HIT, MONSTER_KILLED, MONSTER_SPAWNED, PICKUP_COLLECTED, PLAYER_DAMAGED, PLAYER_DIED,
    LIGHT_SPELL_CAST, QUEST_UPDATED, SHOT_FIRED, SHOT_STOPPED, SPAWNER_DESTROYED, SPAWNER_HIT
} from "../Events";
import { StepSeconds } from "../FixedStep";
import type { IPlayerInput } from "../input/PlayerControl";
import MonsterRoster from "../level/entities/MonsterRoster";
import type { ShotSetup } from "../level/entities/Projectiles";
import type { QuestState } from "../story/Quests";
import type { HeroInput } from "../sim/World";
import { HeroSnapshotOf } from "./HeroSync";
import type { NetLevelContext } from "./NetPlay";
import PlaySession, { ByteRate, BytesText } from "./PlaySession";
import { IsLastingEvent, NetEvent, PlayMessage, Snapshot } from "./PlayMessages";
import RemoteInput from "./RemoteInput";

/** Every how many steps a snapshot goes out: every third, 20 a second. */
export const SnapshotEvery = 3;
/** How long, in milliseconds, a level waits as it starts for every guest to have it ready before it starts without them. */
export const WaitForGuestsMs = 10000;
/** How long, in milliseconds, a guest whose connection has gone has to come back before their hero is taken out for good. */
export const HoldAwayMs = 60000;
/** How long, in milliseconds, without a guest's inputs during play before their hero is away - their machine or its line has stalled - until the next comes. */
export const AwayAfterMs = 3000;

export default class HostSession extends PlaySession {
    readonly IsHost = true;
    /** Which time the level has started this run, counting from 0 - to 255, then round again. */
    private round = 0;
    private tick = 0;
    /** Each guest's hero's inputs, by hero slot (the host's own slot's is never used). */
    private inputs = this.seats.map(() => new RemoteInput());
    /** The guests who have this round's level ready, by peer. */
    private ready = new Set<number>();
    /** Whether this round's play has begun - every guest ready, or tired of waiting for. */
    private playing = false;
    private waitingSince = 0;
    /** The heroes whose players have left, by slot - out of every level from then on. */
    private departed = new Set<number>();
    /** The heroes out of play until their players are back, by slot (see `World.SetAway`). */
    private away = new Set<number>();
    /** When each away hero's player's connection went, by slot - they're taken out for good `HoldAwayMs` after. */
    private lost = new Map<number, number>();
    /** When each guest's hero's last inputs came, by slot. */
    private heard = this.seats.map(() => 0);
    private events: NetEvent[] = [];
    /** What has lastingly happened this level, as sent (see `IsLastingEvent`) - what a guest coming back is caught up with. */
    private history: NetEvent[] = [];
    /** How this level ended (`all-died` or `completed`), once it has and the guests have been told - a guest coming back is told too. */
    private end: NetEvent | null = null;
    /** The kinds of shot fired this level, numbered as the guests were told (the `shot` event). */
    private shots = new Map<ShotSetup, number>();
    private sent = new ByteRate();

    /** The world's own encounter is what's drawn. */
    get Entities(): EncounterView | null {
        return null;
    }

    /** The round being played. */
    get Round(): number {
        return this.round;
    }

    /** Whether the level is under way: every guest has it ready, or it stopped waiting for them. */
    get Playing(): boolean {
        return this.playing;
    }

    Begin(context: NetLevelContext): void {
        this.context = context;
        this.tick = 0;
        this.events = [];
        this.history = [];
        this.end = null;
        this.shots.clear();
        this.playing = false;
        this.waitingSince = this.now();
        this.heard = this.heard.map(() => this.waitingSince);
        this.departed.forEach(index => context.world.RemoveHero(index));
        this.away.forEach(index => context.world.SetAway(index, true));
    }

    /** Whether guest `index`'s player can come back into the run: they haven't left it, nor been gone too long. */
    CanRejoin(index: number): boolean {
        return !this.Ended && this.IsGuest(index) && !this.departed.has(index);
    }

    /**
     * Guest `index`'s player is back, as peer `peer` (see `HostLobby.SetRejoin`) - when `CanRejoin`. Their inputs are
     * listened for from there, numbered afresh, and they're told the round, what has lastingly happened in it and how
     * it ended, if it has (`catch-up`) - then where everything is now, in a snapshot to everyone, so they needn't wait for
     * one (there are none while a level is over). Their hero stays away until their first input comes.
     */
    Rejoin(index: number, peer: number): void {
        if (!this.CanRejoin(index)) {
            return;
        }
        this.ready.delete(this.seats[index].peer);
        this.seats = this.seats.map((seat, i) => (i === index ? { ...seat, peer } : seat));
        this.lost.delete(index);
        this.inputs[index].Reset();
        this.heard[index] = this.now();
        this.Away(index);
        this.Send(peer, { t: "catch-up", round: this.round, events: this.end ? this.history.concat([this.end]) : this.history });
        this.SendSnapshot();
    }

    Step(local: ReadonlyArray<IPlayerInput | undefined>): void {
        const context = this.context;
        if (!context || !this.ReadyToPlay()) {
            return;
        }
        const world = context.world;
        const now = this.now();
        this.seats.forEach((_, i) => {
            if (this.IsGuest(i) && !this.departed.has(i) && !this.away.has(i) && now - this.heard[i] >= AwayAfterMs) {
                this.Away(i);
            }
        });
        // An away hero isn't stepped, so their inputs wait for them.
        const inputs: HeroInput[] = world.Heroes.map((_, i) => (!this.IsGuest(i) ? local[i] : this.away.has(i) ? undefined : this.inputs[i].Take()));
        world.Step(inputs, 1, StepSeconds);
        this.tick++;
        if (this.tick % SnapshotEvery === 0 || world.AllDown || world.Completed) {
            this.SendSnapshot();
        }
    }

    Frame(_frames: number): void {
        this.PingNow(this.Guests());
        const now = this.now();
        this.lost.forEach((since, index) => {
            if (now - since >= HoldAwayMs) {
                this.Depart(index);
            }
        });
    }

    Record(event: string, args: ReadonlyArray<unknown>): void {
        const context = this.context;
        if (!context) {
            return;
        }
        const n = (i: number) => args[i] as number;
        switch (event) {
            case PICKUP_COLLECTED:
                // What was collected the guest finds for itself, on its own copy of the level.
                this.events.push({ e: "pickup", hero: n(0), x: n(1), y: n(2) });
                break;
            case KEYS_DROPPED:
                this.events.push({ e: "keys", hero: n(0), x: n(1), y: n(2) });
                break;
            case SPAWNER_DESTROYED:
            case SPAWNER_HIT: {
                const index = context.world.encounter.spawners.findIndex(state => state.spawner === args[0]);
                if (index >= 0) {
                    this.events.push(event === SPAWNER_HIT ? { e: "spawner-hit", index } : { e: "spawner", index });
                }
                break;
            }
            case MONSTER_KILLED:
                this.events.push({ e: "killed", type: TypeNumber(args[0]), x: n(1), y: n(2), hero: n(3), boss: !!args[4] });
                break;
            case MONSTER_HIT:
                this.events.push({ e: "hit", type: TypeNumber(args[0]) });
                break;
            case MONSTER_SPAWNED:
                this.events.push({ e: "spawned", type: TypeNumber(args[0]) });
                break;
            case BOSS_WOKE:
                this.events.push({ e: "woke", type: TypeNumber(args[0]) });
                break;
            case SHOT_FIRED:
                // Numbered first, so a new kind's `shot` goes ahead of it.
                this.events.push({ e: "fired", shot: this.ShotNumber(args[0] as ShotSetup), hero: n(1) });
                break;
            case SHOT_STOPPED:
                this.events.push({ e: "stopped", shot: this.ShotNumber(args[0] as ShotSetup) });
                break;
            case LIGHT_SPELL_CAST:
                this.events.push({ e: "cast", hero: n(0) });
                break;
            case PLAYER_DAMAGED:
                this.events.push({ e: "damaged", damage: n(0), hitPoints: n(1), hero: n(2) });
                break;
            case PLAYER_DIED:
                this.events.push({ e: "died", hero: n(0) });
                break;
            case ALL_PLAYERS_DIED:
                this.events.push({ e: "all-died" });
                break;
            case LEVEL_COMPLETED:
                this.events.push({ e: "completed", hero: n(0) });
                break;
            case QUEST_UPDATED: {
                const index = context.world.quests.Index(args[0] as string);
                if (index >= 0) {
                    this.events.push({ e: "quest", index, state: args[1] as QuestState, progress: n(2) });
                }
                break;
            }
        }
    }

    Restart(): void {
        this.round = (this.round + 1) & 0xff;
        this.Broadcast({ t: "restart", round: this.round });
        this.inputs.forEach(inputs => inputs.Reset());
        this.ready.clear();
        this.playing = false;
        this.context = null;
    }

    Stats(): string[] {
        const now = this.now();
        const lines = ["HOST - ROUND " + (this.round + 1) + (this.context && !this.playing ? ", WAITING FOR PLAYERS" : ""), "SNAPSHOT " + BytesText(this.sent.Last) + ", " + BytesText(this.sent.PerSecond(now)) + "/S"];
        this.seats.forEach((seat, i) => {
            if (this.IsGuest(i)) {
                lines.push(seat.name + ": " + this.GuestState(i, now));
            }
        });
        return lines;
    }

    protected OnMessage(from: number, message: PlayMessage): void {
        const index = this.HeroOf(from);
        if (index < 0) {
            return;
        }
        if (message.t === "leave") {
            this.Depart(index);
            return;
        }
        if (message.t !== "input" || message.round !== this.round || this.departed.has(index)) {
            return;
        }
        // Even an empty one says the guest has the level ready.
        this.ready.add(from);
        this.heard[index] = this.now();
        if (this.away.has(index)) {
            this.away.delete(index);
            if (this.context) {
                this.context.world.SetAway(index, false);
            }
        }
        this.inputs[index].Receive(message.inputs);
    }

    /** A guest's connection has gone: their hero is away, kept for them to come back (`Rejoin`) - unless they said they were leaving. */
    protected PeerLeft(peer: number): void {
        const index = this.HeroOf(peer);
        if (index < 0 || this.departed.has(index)) {
            return;
        }
        this.ready.delete(peer);
        if (!this.lost.has(index)) {
            this.lost.set(index, this.now());
        }
        this.Away(index);
    }

    /** Takes hero `index` out of play until their player is back (see `World.SetAway`). */
    private Away(index: number): void {
        if (this.departed.has(index) || this.away.has(index)) {
            return;
        }
        this.away.add(index);
        const context = this.context;
        if (context) {
            context.world.SetAway(index, true);
            // At once: the level may have ended with them (no one else in play), and then there's no next step.
            this.SendSnapshot();
        }
    }

    /** Takes hero `index` out for good: their player has left, or been gone too long. */
    private Depart(index: number): void {
        if (this.departed.has(index)) {
            return;
        }
        this.departed.add(index);
        this.away.delete(index);
        this.lost.delete(index);
        this.ready.delete(this.seats[index].peer);
        const context = this.context;
        if (context) {
            context.world.RemoveHero(index);
            // At once: the level may have ended with them (no one left standing), and then there's no next step.
            this.SendSnapshot();
        }
    }

    /** Whether play can go on: it has, or every guest still in the room has the level ready, or they've been waited for long enough. */
    private ReadyToPlay(): boolean {
        if (!this.playing) {
            // Not one whose connection has gone - but one merely quiet may yet say it's ready.
            const waiting = this.seats.some((seat, i) => this.IsGuest(i) && !this.departed.has(i) && !this.lost.has(i) && !this.ready.has(seat.peer));
            this.playing = !waiting || this.now() - this.waitingSince >= WaitForGuestsMs;
            if (this.playing) {
                const now = this.now();
                this.heard = this.heard.map(() => now);
            }
        }
        return this.playing;
    }

    /** How guest `index`'s connection is doing, for `Stats`. */
    private GuestState(index: number, now: number): string {
        if (this.departed.has(index)) {
            return "LEFT";
        }
        const lost = this.lost.get(index);
        if (lost !== undefined) {
            return "GONE, HELD " + Math.max(0, Math.ceil((HoldAwayMs - (now - lost)) / 1000)) + " S MORE";
        }
        if (this.away.has(index)) {
            return "AWAY, NOTHING FOR " + Math.floor((now - this.heard[index]) / 1000) + " S";
        }
        const peer = this.seats[index].peer;
        const rtt = this.RoundTrip(peer);
        return this.LinkText(peer) + ", " + (rtt === undefined ? "-" : Math.round(rtt) + " MS") + ", " + this.inputs[index].Waiting + " INPUTS WAITING";
    }

    private SendSnapshot(): void {
        const context = this.context;
        if (!context) {
            return;
        }
        const world = context.world;
        const encounter = world.encounter;
        const snapshot: Snapshot = {
            t: "snapshot",
            round: this.round,
            tick: this.tick,
            heroes: world.Heroes.map((hero, i) => HeroSnapshotOf(hero, this.inputs[i].Acked)),
            monsters: encounter.monsters.filter(m => !m.dead).map(m => ({
                id: m.id,
                type: TypeNumber(m.type),
                x: m.position.x,
                y: m.position.y,
                facingX: m.facingX,
                moving: m.moving,
                hit: m.hitFlash > 0
            })),
            projectiles: encounter.projectiles.filter(p => !p.dead).map(p => ({
                id: p.id,
                shot: this.ShotNumber(p.setup),
                x: p.x,
                y: p.y,
                vx: p.vx,
                vy: p.vy,
                hero: p.hero,
                seq: p.seq
            })),
            doors: context.level.doors.map(door => door.isOpen),
            flashing: [],
            // Last, as numbering the shots above can add to them.
            events: []
        };
        encounter.spawners.forEach((state, i) => {
            if (encounter.spawnerFlash.has(state)) {
                snapshot.flashing.push(i);
            }
        });
        snapshot.events = this.events.splice(0);
        snapshot.events.forEach(event => {
            if (IsLastingEvent(event)) {
                this.history.push(event);
            } else if (event.e === "all-died" || event.e === "completed") {
                this.end = event;
            }
        });
        this.sent.Add(this.Broadcast(snapshot), this.now());
    }

    /** The number guests know this kind of shot by - told them, with the next snapshot, the first time it's fired. */
    private ShotNumber(setup: ShotSetup): number {
        let index = this.shots.get(setup);
        if (index === undefined) {
            index = this.shots.size;
            this.shots.set(setup, index);
            this.events.push({ e: "shot", index, setup });
        }
        return index;
    }

    /** Whether hero `index` is played on a guest's machine. */
    private IsGuest(index: number): boolean {
        const seat = this.seats[index];
        return !!seat && seat.peer !== RelayHost;
    }

    /** The guests, by peer, still in the room. */
    private Guests(): number[] {
        return this.seats.filter((seat, i) => this.IsGuest(i) && !this.departed.has(i) && !this.lost.has(i)).map(seat => seat.peer);
    }

    /** Which hero peer `peer` plays - -1 for none. */
    private HeroOf(peer: number): number {
        return this.seats.findIndex(seat => seat.peer === peer);
    }
}

/** A monster type by its place in the roster - how guests are told it. */
function TypeNumber(type: unknown): number {
    return Math.max(0, MonsterRoster.inst.Types.indexOf(type as string));
}
