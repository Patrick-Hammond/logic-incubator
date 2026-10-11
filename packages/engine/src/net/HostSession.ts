/**
 * The host's side of an online run. Its world is the run's only one: each step
 * it plays the host's own hero from this machine's controls and each guest's
 * from the inputs they've sent (see `RemoteInput`), and every third step it
 * sends every guest a snapshot of the world and what has happened since the
 * last (see `Snapshot`) - 20 a second, and one more as a level ends. As a level
 * starts it waits, up to `WaitForGuestsMs`, for each guest to have it ready. A
 * guest who leaves takes their hero with them (`World.RemoveHero`); the host
 * starting the level over starts it over for everyone. Pure - no pixi - so it
 * runs under the plain node test runner.
 */

import { RelayHost } from "@logic-incubator/lib/net/RelayRooms";
import type { EncounterView } from "../Encounter";
import { ALL_PLAYERS_DIED, KEYS_DROPPED, LEVEL_COMPLETED, MONSTER_KILLED, PICKUP_COLLECTED, PLAYER_DAMAGED, PLAYER_DIED, SPAWNER_DESTROYED } from "../Events";
import { StepSeconds } from "../FixedStep";
import type { IPlayerInput } from "../input/PlayerControl";
import MonsterRoster from "../level/entities/MonsterRoster";
import type { ShotSetup } from "../level/entities/Projectiles";
import type { HeroInput } from "../sim/World";
import { HeroSnapshotOf } from "./HeroSync";
import type { NetLevelContext } from "./NetPlay";
import PlaySession, { ByteRate, BytesText } from "./PlaySession";
import type { NetEvent, PlayMessage, Snapshot } from "./PlayMessages";
import RemoteInput from "./RemoteInput";

/** Every how many steps a snapshot goes out: every third, 20 a second. */
export const SnapshotEvery = 3;
/** How long, in milliseconds, a level waits as it starts for every guest to have it ready before it starts without them. */
export const WaitForGuestsMs = 10000;

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
    private events: NetEvent[] = [];
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
        this.shots.clear();
        this.playing = false;
        this.waitingSince = this.now();
        this.departed.forEach(index => context.world.RemoveHero(index));
    }

    Step(local: ReadonlyArray<IPlayerInput | undefined>): void {
        const context = this.context;
        if (!context || !this.ReadyToPlay()) {
            return;
        }
        const world = context.world;
        const inputs: HeroInput[] = world.Heroes.map((_, i) => (this.IsGuest(i) ? this.inputs[i].Take() : local[i]));
        world.Step(inputs, 1, StepSeconds);
        this.tick++;
        if (this.tick % SnapshotEvery === 0 || world.AllDown || world.Completed) {
            this.SendSnapshot();
        }
    }

    Frame(_frames: number): void {
        this.PingNow(this.Guests());
    }

    Record(event: string, args: ReadonlyArray<unknown>): void {
        const context = this.context;
        if (!context) {
            return;
        }
        const n = (i: number) => args[i] as number;
        switch (event) {
            case PICKUP_COLLECTED:
                this.events.push({ e: "pickup", hero: n(0), x: n(1), y: n(2) });
                break;
            case KEYS_DROPPED:
                this.events.push({ e: "keys", hero: n(0), x: n(1), y: n(2) });
                break;
            case SPAWNER_DESTROYED: {
                const index = context.world.encounter.spawners.findIndex(state => state.spawner === args[0]);
                if (index >= 0) {
                    this.events.push({ e: "spawner", index });
                }
                break;
            }
            case MONSTER_KILLED:
                this.events.push({ e: "killed", type: Math.max(0, MonsterRoster.inst.Types.indexOf(args[0] as string)), x: n(1), y: n(2), hero: n(3) });
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
                const rtt = this.RoundTrip(seat.peer);
                const state = this.departed.has(i) ? "LEFT" : (rtt === undefined ? "-" : Math.round(rtt) + " MS") + ", " + this.inputs[i].Waiting + " INPUTS WAITING";
                lines.push(seat.name + ": " + state);
            }
        });
        return lines;
    }

    protected OnMessage(from: number, message: PlayMessage): void {
        const index = this.HeroOf(from);
        if (message.t !== "input" || index < 0 || message.round !== this.round) {
            return;
        }
        // Even an empty one says the guest has the level ready.
        this.ready.add(from);
        this.inputs[index].Receive(message.inputs);
    }

    protected PeerLeft(peer: number): void {
        const index = this.HeroOf(peer);
        if (index < 0 || this.departed.has(index)) {
            return;
        }
        this.departed.add(index);
        this.ready.delete(peer);
        const context = this.context;
        if (context) {
            context.world.RemoveHero(index);
            // At once: the level may have ended with them (no one left standing), and then there's no next step.
            this.SendSnapshot();
        }
    }

    /** Whether play can go on: it has, or every guest still here has the level ready, or they've been waited for long enough. */
    private ReadyToPlay(): boolean {
        if (!this.playing) {
            const waiting = this.seats.some((seat, i) => this.IsGuest(i) && !this.departed.has(i) && !this.ready.has(seat.peer));
            this.playing = !waiting || this.now() - this.waitingSince >= WaitForGuestsMs;
        }
        return this.playing;
    }

    private SendSnapshot(): void {
        const context = this.context;
        if (!context) {
            return;
        }
        const world = context.world;
        const encounter = world.encounter;
        const types = MonsterRoster.inst.Types;
        const snapshot: Snapshot = {
            t: "snapshot",
            round: this.round,
            tick: this.tick,
            heroes: world.Heroes.map((hero, i) => HeroSnapshotOf(hero, this.inputs[i].Acked)),
            monsters: encounter.monsters.filter(m => !m.dead).map(m => ({
                id: m.id,
                type: Math.max(0, types.indexOf(m.type)),
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
        return this.seats.filter((seat, i) => this.IsGuest(i) && !this.departed.has(i)).map(seat => seat.peer);
    }

    /** Which hero peer `peer` plays - -1 for none. */
    private HeroOf(peer: number): number {
        return this.seats.findIndex(seat => seat.peer === peer);
    }
}
