import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Vec2 } from "@logic-incubator/lib/math/Geometry";
import { WithLag } from "@logic-incubator/lib/net/Lag";
import { LoopbackRelay } from "@logic-incubator/lib/net/Loopback";
import RelaySession from "@logic-incubator/lib/net/RelaySession";
import { TileSize } from "../Constants";
import { ALL_PLAYERS_DIED, PICKUP_COLLECTED } from "../Events";
import type { IPlayerInput } from "../input/PlayerControl";
import { Chase } from "../level/entities/Behaviours";
import MonsterRoster, { MonsterDef } from "../level/entities/MonsterRoster";
import { WeaponDef } from "../level/entities/Projectiles";
import { SeededRandom } from "../Random";
import World from "../sim/World";
import { NetTestLevel } from "./__fixtures__/NetTestLevel";
import GuestSession from "./GuestSession";
import HostSession, { AwayAfterMs, HoldAwayMs, WaitForGuestsMs } from "./HostSession";
import type { LobbySeat } from "./NetMessages";
import type { NetPlay } from "./NetPlay";

/**
 * Whole online runs, headless: a host and its guests, each with its own world on its own copy of the level,
 * talking through an in-memory relay - slowed down and losing packets where a test says - and played a 60th of a
 * second at a time.
 */

const BOW: WeaponDef = { icon: "bow", shot: { sprite: "arrow", speed: 6, damage: 1, range: 20, cooldown: 0.5 } };
const SETUP = { hitPoints: 6, weapons: [BOW] };
const Walker: MonsterDef = { idle: "walker_idle", run: "walker_run", hitPoints: 2, speed: 0.5, contactDamage: 1, contactCooldown: 1, behaviour: () => new Chase() };
const MAP = [
    "####################",
    "#S.......D.........#",
    "#........D.........#",
    "#...$....D.........#",
    "#........D.........#",
    "#........D.........#",
    "#........D.........#",
    "####################"
];
const StepMs = 1000 / 60;

type Machine = { world: World; level: NetNetLevel; session: NetPlay; relay: RelaySession; events: unknown[][]; restarts: number };
type NetNetLevel = ReturnType<typeof NetTestLevel>;

/** Lets the loopback's own deliveries (promise callbacks) run. */
async function Flush(): Promise<void> {
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
}

function Input(x: number, y = 0, extra: Partial<IPlayerInput> = {}): IPlayerInput {
    return { direction: new Vec2(x, y), firing: false, aimX: 0, casting: false, ...extra };
}

class Run {
    host!: Machine;
    guests: Machine[] = [];
    now = 0;
    /** Machines that have stalled - nothing they do goes out, as a frozen tab's wouldn't. */
    stalled = new Set<Machine>();
    private relay!: LoopbackRelay;
    private seats: LobbySeat[] = [];

    /** Opens a room with `guests` guests in it, each line to the relay slowed by `lag` if given. */
    async Open(guests: number, lag?: (i: number) => Parameters<typeof WithLag>[1]): Promise<void> {
        const relay = this.relay = new LoopbackRelay();
        const hostRelay = await RelaySession.Host(relay.Connect(), "test");
        const guestRelays: RelaySession[] = [];
        for (let i = 0; i < guests; i++) {
            const line = lag ? WithLag(relay.Connect(), lag(i)) : relay.Connect();
            const joining = RelaySession.Join(line, "test", hostRelay.Code);
            await vi.advanceTimersByTimeAsync(1000);
            guestRelays.push(await joining);
        }
        this.seats = [hostRelay, ...guestRelays].map((session, i) => ({ peer: session.You, name: "P" + i, character: "x" }));
        const now = () => this.now;
        this.host = this.Machine(hostRelay, new HostSession(hostRelay, this.seats, { now }));
        this.guests = guestRelays.map(session => this.Machine(session, new GuestSession(session, this.seats, { now })));
    }

    /** Guest `guest` (from 0) is back in the room on a new connection, and the host's lobby has let it back into the run. */
    async Rejoin(guest: number): Promise<void> {
        const machine = this.guests[guest];
        const joining = RelaySession.Join(this.relay.Connect(), "test", this.host.relay.Code);
        await vi.advanceTimersByTimeAsync(10);
        const session = machine.relay = await joining;
        (machine.session as GuestSession).Rejoin(session);
        (this.host.session as HostSession).Rejoin(guest + 1, session.You);
    }

    /** Starts the level on `machine`, as its `LEVEL_CREATED` would. */
    Begin(machine: Machine): void {
        const level = machine.level = NetTestLevel(MAP);
        machine.world = new World(level, {
            emit: (event, ...args) => {
                machine.session.Record(event, args);
                machine.events.push([event, ...args]);
            },
            sizeFor: () => ({ width: 16, height: 16 }),
            random: SeededRandom(7)
        });
        machine.world.Reset(SETUP, this.seats.map(() => undefined), 7);
        machine.session.Begin({
            world: machine.world,
            level,
            emit: (event, ...args) => machine.events.push([event, ...args]),
            restart: () => machine.restarts++,
            sizeFor: () => ({ width: 16, height: 16 })
        });
    }

    async BeginAll(): Promise<void> {
        this.Begin(this.host);
        this.guests.forEach(guest => this.Begin(guest));
        await this.Frames(1, () => undefined);
    }

    /** Plays `frames` 60ths of a second, each machine's hero doing what `input` says (by hero, 0 the host's). */
    async Frames(frames: number, input: (hero: number, frame: number) => IPlayerInput | undefined): Promise<void> {
        for (let frame = 0; frame < frames; frame++) {
            this.now += StepMs;
            [this.host, ...this.guests].forEach((machine, hero) => {
                if (this.stalled.has(machine)) {
                    return;
                }
                const local: Array<IPlayerInput | undefined> = [];
                local[hero] = input(hero, frame);
                machine.session.Step(local);
            });
            await vi.advanceTimersByTimeAsync(StepMs);
            await Flush();
            [this.host, ...this.guests].forEach(machine => !this.stalled.has(machine) && machine.session.Frame(1));
        }
    }

    private Machine(relay: RelaySession, session: NetPlay): Machine {
        return { relay, session, world: undefined as unknown as World, level: undefined as unknown as NetNetLevel, events: [], restarts: 0 };
    }
}

describe("an online run", () => {
    let run: Run;

    beforeEach(() => {
        vi.useFakeTimers();
        MonsterRoster.inst.Load({ types: ["walker"], defs: { walker: Walker } });
        run = new Run();
    });

    afterEach(() => {
        [run.host, ...run.guests].forEach(machine => machine && machine.session.End());
        vi.useRealTimers();
        MonsterRoster.Destroy();
    });

    it("waits as each level starts for every guest to have it ready", async () => {
        await run.Open(2);
        run.Begin(run.host);
        run.Begin(run.guests[0]);
        const start = run.host.world.Heroes[0].Position.x;
        await run.Frames(30, () => Input(1));
        expect(run.host.world.Heroes[0].Position.x).toBe(start);
        expect((run.host.session as HostSession).Playing).toBe(false);

        run.Begin(run.guests[1]);
        await run.Frames(30, () => Input(1));
        expect((run.host.session as HostSession).Playing).toBe(true);
        expect(run.host.world.Heroes[0].Position.x).toBeGreaterThan(start);
    });

    it("stops waiting for a guest who takes too long", async () => {
        await run.Open(1);
        run.Begin(run.host);
        await run.Frames(Math.ceil(WaitForGuestsMs / StepMs) + 2, () => undefined);
        expect((run.host.session as HostSession).Playing).toBe(true);
    });

    it("lands each guest's hero where the host has it, without correcting them, however they move", async () => {
        await run.Open(2);
        await run.BeginAll();
        const walk = (hero: number, frame: number) => Input(Math.sin(frame / 20 + hero), Math.cos(frame / 13 + hero * 2));
        await run.Frames(240, walk);
        // Long enough to come to a stop, so neither is a step ahead of the other.
        await run.Frames(60, () => undefined);
        run.guests.forEach((guest, i) => {
            const mine = guest.world.Heroes[i + 1];
            const theirs = run.host.world.Heroes[i + 1];
            expect(mine.Position.x).toBe(theirs.Position.x);
            expect(mine.Position.y).toBe(theirs.Position.y);
            expect((guest.session as GuestSession).Prediction.Corrections).toBe(0);
        });
    });

    it("shows each guest the other heroes where the host has them", async () => {
        await run.Open(2);
        await run.BeginAll();
        await run.Frames(60, hero => Input(hero === 1 ? 0 : 1, hero === 2 ? 1 : 0));
        // Stood still long enough for the copies, drawn a little behind, to catch up.
        await run.Frames(60, () => undefined);
        const guest = run.guests[0];
        [0, 2].forEach(hero => {
            expect(guest.world.Heroes[hero].Position.x).toBeCloseTo(run.host.world.Heroes[hero].Position.x, 6);
            expect(guest.world.Heroes[hero].Position.y).toBeCloseTo(run.host.world.Heroes[hero].Position.y, 6);
        });
    });

    it("does on each guest what happened on the host: pickups, doors", async () => {
        await run.Open(1);
        await run.BeginAll();
        // The guest's hero walks down and right over the gold, the host's right through the door.
        await run.Frames(70, hero => (hero === 1 ? Input(0.6, 0.4) : Input(1)));
        await run.Frames(60, () => undefined);
        const guest = run.guests[0];
        expect(run.host.level.pickups).toEqual([]);
        expect(guest.level.pickups).toEqual([]);
        expect(run.host.world.Heroes[1].Gold.amount).toBe(5);
        expect(guest.world.Heroes[1].Gold.amount).toBe(5);
        expect(guest.events).toContainEqual([PICKUP_COLLECTED, 1, 4, 3]);
        // Opened as the heroes went through, and shut behind them.
        expect(guest.level.doorVersion).toBeGreaterThanOrEqual(2);
        expect(guest.level.door.isOpen).toBe(run.host.level.door.isOpen);
    });

    it("draws the host's monsters on each guest", async () => {
        await run.Open(1);
        await run.BeginAll();
        run.host.world.encounter.monsters.push(MonsterAt(run.host.world, 15, 3));
        await run.Frames(30, () => undefined);
        const replica = run.guests[0].session.Entities!;
        expect(replica.monsters).toHaveLength(1);
        expect(replica.monsters[0].def).toBe(Walker);
    });

    it("takes a guest's hero out when they leave, on the host and every other guest", async () => {
        await run.Open(2);
        await run.BeginAll();
        run.guests[0].session.End();
        run.guests[0].relay.Leave();
        await run.Frames(10, () => undefined);
        expect(run.host.world.Heroes[1].Gone).toBe(true);
        expect(run.guests[1].world.Heroes[1].Gone).toBe(true);
        expect(run.guests[1].world.Heroes[2].Gone).toBe(false);
        expect((run.host.session as HostSession).CanRejoin(1)).toBe(false);
        expect(run.host.session.Stats()).toContain("P1: LEFT");
    });

    it("holds the hero of a guest whose connection goes - away, where they stood - and takes them out once they've been gone too long", async () => {
        await run.Open(2);
        await run.BeginAll();
        await run.Frames(30, hero => (hero === 1 ? Input(1, 1) : undefined));
        run.guests[0].relay.Drop("lost");
        await run.Frames(10, () => undefined);
        expect(run.guests[0].session.Connected).toBe(false);
        const host = run.host.session as HostSession;
        expect(run.host.world.Heroes[1].Away).toBe(true);
        const at = { x: run.host.world.Heroes[1].Position.x, y: run.host.world.Heroes[1].Position.y };
        expect(run.host.world.Heroes[1].Gone).toBe(false);
        expect(run.guests[1].world.Heroes[1].Away).toBe(true);
        expect(run.host.world.Active.map(hero => hero.Index)).toEqual([0, 2]);
        expect(host.CanRejoin(1)).toBe(true);
        expect(host.Stats()).toContain("P1: GONE, HELD 60 S MORE");

        await run.Frames(60, () => Input(1));
        expect(run.host.world.Heroes[1].Position).toEqual(at);

        run.now += HoldAwayMs;
        await run.Frames(30, () => undefined);
        expect(run.host.world.Heroes[1].Gone).toBe(true);
        expect(run.guests[1].world.Heroes[1].Gone).toBe(true);
        expect(host.CanRejoin(1)).toBe(false);
    });

    it("lets a guest whose connection went back in, caught up on what it missed, and plays on from where the host has them", async () => {
        await run.Open(1);
        await run.BeginAll();
        const guest = run.guests[0];
        await run.Frames(30, hero => (hero === 1 ? Input(1) : undefined));
        await run.Frames(10, () => undefined);
        guest.relay.Drop("lost");
        // While it's gone, the host's hero takes the gold - and the guest's own, played on, goes nowhere.
        await run.Frames(70, hero => (hero === 0 ? Input(0.6, 0.4) : Input(0, 1)));
        expect(run.host.level.pickups).toEqual([]);
        expect(guest.level.pickups).toHaveLength(1);

        await run.Rejoin(0);
        expect(guest.session.Connected).toBe(false);
        await run.Frames(5, () => undefined);
        expect(guest.session.Connected).toBe(true);
        expect(guest.level.pickups).toEqual([]);
        // Quietly: what it missed is past, so nothing tells the game it just happened.
        expect(guest.events.filter(event => event[0] === PICKUP_COLLECTED)).toEqual([]);
        expect((run.host.session as HostSession).Stats().join("\n")).not.toContain("GONE");

        await run.Frames(60, hero => (hero === 1 ? Input(0, 1) : undefined));
        await run.Frames(60, () => undefined);
        expect(run.host.world.Heroes[1].Away).toBe(false);
        expect(guest.world.Heroes[1].Away).toBe(false);
        expect(guest.world.Heroes[1].Position.x).toBe(run.host.world.Heroes[1].Position.x);
        expect(guest.world.Heroes[1].Position.y).toBe(run.host.world.Heroes[1].Position.y);
        expect(run.host.world.Heroes[1].Position.y).toBeGreaterThan(TileSize * 2);
        expect((guest.session as GuestSession).Prediction.Corrections).toBe(0);
    });

    it("starts the level over on a guest back to find the host has, and catches it up as it begins", async () => {
        await run.Open(1);
        await run.BeginAll();
        const guest = run.guests[0];
        guest.relay.Drop("lost");
        await run.Frames(5, () => undefined);
        run.host.session.Restart();
        run.Begin(run.host);
        // It plays on without waiting for a guest who isn't there.
        await run.Frames(70, hero => (hero === 0 ? Input(0.6, 0.4) : undefined));
        expect(run.host.level.pickups).toEqual([]);

        await run.Rejoin(0);
        await run.Frames(5, () => undefined);
        expect(guest.restarts).toBe(1);
        run.Begin(guest);
        expect(guest.level.pickups).toEqual([]);
        await run.Frames(60, hero => (hero === 1 ? Input(0, 1) : undefined));
        await run.Frames(30, () => undefined);
        expect(guest.world.Heroes[1].Position.y).toBe(run.host.world.Heroes[1].Position.y);
        expect(run.host.world.Heroes[1].Position.y).toBeGreaterThan(TileSize * 2);
    });

    it("tells a guest back after the level ended how it ended - once - and where everyone is", async () => {
        await run.Open(1);
        await run.BeginAll();
        const guest = run.guests[0];
        guest.relay.Drop("lost");
        await run.Frames(5, () => undefined);
        run.host.world.Heroes[0].Damage(100);
        await run.Frames(5, () => undefined);
        expect(run.host.world.AllDown).toBe(true);
        expect(guest.events).not.toContainEqual([ALL_PLAYERS_DIED]);

        await run.Rejoin(0);
        await run.Frames(5, () => undefined);
        expect(guest.events.filter(event => event[0] === ALL_PLAYERS_DIED)).toHaveLength(1);
        expect(guest.world.Heroes[0].Alive).toBe(false);

        // Gone again and back: it has heard already.
        guest.relay.Drop("lost");
        await run.Frames(5, () => undefined);
        await run.Rejoin(0);
        await run.Frames(5, () => undefined);
        expect(guest.events.filter(event => event[0] === ALL_PLAYERS_DIED)).toHaveLength(1);
    });

    it("takes the hero of a guest gone quiet out of play, and back in with their next input", async () => {
        await run.Open(1);
        await run.BeginAll();
        const guest = run.guests[0];
        run.stalled.add(guest);
        await run.Frames(Math.ceil(AwayAfterMs / StepMs) + 10, () => undefined);
        expect(run.host.world.Heroes[1].Away).toBe(true);
        expect(run.host.session.Stats().join("\n")).toMatch(/P1: AWAY, NOTHING FOR 3 S/);
        // Only out of play: their connection is still there.
        expect((run.host.session as HostSession).CanRejoin(1)).toBe(true);

        run.stalled.delete(guest);
        await run.Frames(10, () => undefined);
        expect(run.host.world.Heroes[1].Away).toBe(false);
        expect(guest.world.Heroes[1].Away).toBe(false);
    });

    it("tells every guest when the last hero falls - with a snapshot at once, as nothing steps after", async () => {
        await run.Open(1);
        await run.BeginAll();
        run.host.world.Heroes.forEach(hero => hero.Damage(100));
        await run.Frames(1, () => undefined);
        expect(run.host.world.AllDown).toBe(true);
        expect(run.guests[0].events).toContainEqual([ALL_PLAYERS_DIED]);
    });

    it("starts the level over on every guest when the host does, and plays the new one", async () => {
        await run.Open(1);
        await run.BeginAll();
        await run.Frames(30, () => Input(1));
        run.host.session.Restart();
        await run.Frames(1, () => undefined);
        expect(run.guests[0].restarts).toBe(1);
        // Old snapshots and inputs don't carry over: each machine's level starts again from the start.
        await run.BeginAll();
        await run.Frames(60, hero => (hero === 1 ? Input(0, 1) : undefined));
        await run.Frames(10, () => undefined);
        expect(run.guests[0].world.Heroes[1].Position.y).toBe(run.host.world.Heroes[1].Position.y);
        expect(run.guests[0].world.Heroes[1].Position.y).toBeGreaterThan(TileSize * 2);
    });

    it("says how the connection is doing, for the developer's overlay", async () => {
        await run.Open(1, () => ({ delayMs: 40 }));
        await run.BeginAll();
        await run.Frames(120, hero => Input(hero ? 1 : 0));
        const host = run.host.session.Stats().join("\n");
        expect(host).toContain("HOST - ROUND 1");
        expect(host).toMatch(/P1: \d+ MS, \d+ INPUTS WAITING/);
        const guest = run.guests[0].session.Stats().join("\n");
        expect(guest).toMatch(/ROUND TRIP \d+ MS/);
        expect(guest).toMatch(/\/S, DRAWN -?\d+ MS BEHIND/);
        expect(guest).toContain("CORRECTIONS 0");

        // Nothing from the host for a while - its level over, say: the guest says so rather than how far ahead it's drawing.
        run.host.session.End();
        await run.Frames(60, () => undefined);
        expect(run.guests[0].session.Stats().join("\n")).toContain("NONE COMING");
    });

    it("over a slow line that loses packets (150 ms each way, up to 30 more, 2% lost), still lands each guest where the host has them, uncorrected", async () => {
        const random = SeededRandom(99);
        await run.Open(3, () => ({ delayMs: 150, jitterMs: 30, lossChance: 0.02, random }));
        await run.BeginAll();
        const walk = (hero: number, frame: number) => (Math.floor(frame / 40 + hero) % 3 === 0 ? undefined : Input(Math.sin(frame / 25 + hero), Math.cos(frame / 17 + hero)));
        await run.Frames(600, walk);
        await run.Frames(60, () => undefined);
        run.guests.forEach((guest, i) => {
            const session = guest.session as GuestSession;
            expect(guest.world.Heroes[i + 1].Position.x).toBe(run.host.world.Heroes[i + 1].Position.x);
            expect(guest.world.Heroes[i + 1].Position.y).toBe(run.host.world.Heroes[i + 1].Position.y);
            expect(session.Prediction.Corrections).toBe(0);
        });
    });
});

/** A walker standing at a cell of `world`'s level, as its encounter would make one. */
function MonsterAt(world: World, x: number, y: number) {
    return {
        id: 500,
        type: "walker",
        def: Walker,
        behaviour: Walker.behaviour(),
        position: new Vec2(x * TileSize, y * TileSize),
        previous: new Vec2(x * TileSize, y * TileSize),
        velocity: new Vec2(),
        hitPoints: 2,
        size: { width: 16, height: 16 },
        facingX: 1,
        moving: false,
        animTime: 0,
        contactCooldown: 0,
        rangedCooldown: 0,
        hitFlash: 0,
        spawner: null,
        dead: false
    };
}
