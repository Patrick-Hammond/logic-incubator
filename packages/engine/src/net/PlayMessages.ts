/**
 * The messages of play itself, once a run has begun: each guest's inputs, the
 * host's snapshots of the world (with what happened since the last one), a
 * restart, pings, a guest leaving, and catching up a guest who has come back. Bytes, as they go many times a second - through the room
 * beside the lobby's messages (see `NetMessages`), each kind with a first byte
 * of its own. Pure - no pixi - so it runs under the plain node test runner.
 */

import { ByteReader, ByteWriter } from "@logic-incubator/lib/net/Bytes";
import { Vec2 } from "@logic-incubator/lib/math/Geometry";
import type { IPlayerInput } from "../input/PlayerControl";
import type { ShotSetup } from "../level/entities/Projectiles";
import { QuestState, QuestStates } from "../story/Quests";

/** The first byte of each kind - clear of the lobby's, which `DecodeMessage` reads. */
const InputKind = 16;
const SnapshotKind = 17;
const RestartKind = 18;
const PingKind = 19;
const PongKind = 20;
const CatchUpKind = 21;
const LeaveKind = 22;

/** How finely a direction or aim is sent: each axis a signed byte, so to 1/127. */
const AxisSteps = 127;
/** Monsters' and shots' positions go to a quarter of a pixel. */
const PositionSteps = 4;
/** Shots' speeds go to 1/128 of a pixel a step. */
const SpeedSteps = 128;

/** Guest to host, every step: its inputs, oldest first, each with its `seq` - the newest and the few before it, so one that's lost on the way costs nothing. */
export type InputMessage = { t: "input"; round: number; inputs: IPlayerInput[] };

/** One hero as the host has them after a step - see `Snapshot`. */
export type HeroSnapshot = {
    /** Their player has left the game (see `Hero.Leave`). */
    gone: boolean;
    /** Their player's connection has gone, for now (see `Hero.Away`). */
    away: boolean;
    /** Top-left of their box, and their speed, in pixels - to the bit, as the host has them. */
    x: number;
    y: number;
    vx: number;
    vy: number;
    facingX: number;
    hitPoints: number;
    /** Seconds before a hit can land again. */
    invulnerable: number;
    gold: number;
    /** Which of their weapons they hold. */
    equipped: number;
    /** Seconds before they can fire again. */
    fireCooldown: number;
    /** Their light spell's seconds left while lit, else null - and `recharging` seconds until it's ready. */
    spellLit: number | null;
    spellRecharging: number;
    /** The seconds their torch has left, or null without one. */
    carried: number | null;
    /** Where their mage-light floats, and how long it's been lit (see `PlayerState.orb`) - only while it is. */
    orbX: number;
    orbY: number;
    orbTime: number;
    /** The `seq` of the last of their player's inputs the host has played - 0 for none, or a hero played on the host. */
    ack: number;
};

export type MonsterSnapshot = {
    /** Its `Monster.id`, to 16 bits - which monster it is from one snapshot to the next. */
    id: number;
    /** Its type, by its place in the monster roster (`MonsterRoster.Types`). */
    type: number;
    x: number;
    y: number;
    facingX: number;
    moving: boolean;
    /** Whether it's showing it's been hit. */
    hit: boolean;
};

export type ProjectileSnapshot = {
    /** Its `Projectile.id`, to 16 bits. */
    id: number;
    /** What it was fired as, by its number in the run's shots (see the `shot` event). */
    shot: number;
    /** Its centre, and its speed, in pixels a step. */
    x: number;
    y: number;
    vx: number;
    vy: number;
    /** The hero who fired it, or -1 for a monster - and the `seq` of the input they fired it with, or -1. */
    hero: number;
    seq: number;
};

/** What happened in the steps since the last snapshot, in the order it did - for a guest to do the same to its own copy, and to show. */
export type NetEvent =
    /** Hero `hero` picked up everything on this cell (`PICKUP_COLLECTED`). */
    | { e: "pickup"; hero: number; x: number; y: number }
    /** Hero `hero` fell, or left, and their keys dropped on this cell (`KEYS_DROPPED`). */
    | { e: "keys"; hero: number; x: number; y: number }
    /** The spawner at `index` (of the level's spawners, as it started) was shot to pieces (`SPAWNER_DESTROYED`). */
    | { e: "spawner"; index: number }
    /** `MONSTER_KILLED` - `type` by its place in the roster, and whether it was a boss. */
    | { e: "killed"; type: number; x: number; y: number; hero: number; boss: boolean }
    | { e: "damaged"; damage: number; hitPoints: number; hero: number }
    | { e: "died"; hero: number }
    | { e: "all-died" }
    | { e: "completed"; hero: number }
    /** A kind of shot not seen before in this run: `ProjectileSnapshot.shot` numbers it from now on. */
    | { e: "shot"; index: number; setup: ShotSetup }
    /** The level's quest at `index` (of its quests, in order) is now in `state`, `progress` along (`QUEST_UPDATED`). */
    | { e: "quest"; index: number; state: QuestState; progress: number }
    /** A shot was fired (`SHOT_FIRED`) - what as, by its number (see `shot`), and by which hero, -1 for a monster. */
    | { e: "fired"; shot: number; hero: number }
    /** A shot stopped against a wall (`SHOT_STOPPED`). */
    | { e: "stopped"; shot: number }
    /** A monster was hit and lived (`MONSTER_HIT`) - `type` by its place in the roster. */
    | { e: "hit"; type: number }
    /** A spawner made a monster (`MONSTER_SPAWNED`). */
    | { e: "spawned"; type: number }
    /** A boss woke (`BOSS_WOKE`). */
    | { e: "woke"; type: number }
    /** The spawner at `index` was hit and stands (`SPAWNER_HIT`). */
    | { e: "spawner-hit"; index: number }
    /** Hero `hero` cast their light spell (`LIGHT_SPELL_CAST`). */
    | { e: "cast"; hero: number }
    /** Hero `hero` walked into the door on this cell, which no one has the key for (`DOOR_LOCKED`). */
    | { e: "locked"; hero: number; x: number; y: number };

/** Host to every guest, 20 times a second and as a level ends: the world after step `tick` of level `round`, and what happened since the last one. */
export type Snapshot = {
    t: "snapshot";
    round: number;
    tick: number;
    heroes: HeroSnapshot[];
    monsters: MonsterSnapshot[];
    projectiles: ProjectileSnapshot[];
    /** Whether each of the level's doors is open, in the level's order. */
    doors: boolean[];
    /** The spawners showing they've been hit, by index. */
    flashing: number[];
    events: NetEvent[];
};

/** Host to every guest: the level starts over, as round `round`. */
export type RestartMessage = { t: "restart"; round: number };

/** Guest to host, and back again as a pong: how long a round trip takes. */
export type PingMessage = { t: "ping" | "pong"; id: number };

/**
 * Host to a guest back after its connection went (see `HostSession.Rejoin`): the round being played, and everything
 * lasting that has happened in it (`IsLastingEvent`) - what its own copy of the level may have missed - then, if the
 * level has ended, how (`all-died` or `completed`).
 */
export type CatchUpMessage = { t: "catch-up"; round: number; events: NetEvent[] };

/** Guest to host: its player is leaving the run for good - their hero goes at once, not held for them to come back. */
export type LeaveMessage = { t: "leave" };

export type PlayMessage = InputMessage | Snapshot | RestartMessage | PingMessage | CatchUpMessage | LeaveMessage;

/** Whether `event` changes the level or a hero for good - a pickup, keys dropped, a spawner gone, a kind of shot, a quest moved on - rather than just being shown. */
export function IsLastingEvent(event: NetEvent): boolean {
    return event.e === "pickup" || event.e === "keys" || event.e === "spawner" || event.e === "shot" || event.e === "quest";
}

/**
 * Whether `event` is only heard - a shot fired, a hit - and changes nothing a guest shows for longer than a sound: a
 * snapshot with only these in it may still go by a direct link's fast lane (see `MayBeLost`), as losing one loses a sound.
 * A boss waking isn't one: it puts the boss music on (`SoundTable.bossMusic`) until the boss falls.
 */
export function IsFleetingEvent(event: NetEvent): boolean {
    return (
        event.e === "fired" || event.e === "stopped" || event.e === "hit" || event.e === "spawned" || event.e === "spawner-hit" || event.e === "cast" || event.e === "locked"
    );
}

const EventKinds = [
    "pickup", "keys", "spawner", "killed", "damaged", "died", "all-died", "completed", "shot", "quest", "fired", "stopped", "hit", "spawned", "woke", "spawner-hit", "cast", "locked"
];

const HeroGone = 1;
const HeroFacingLeft = 2;
const HeroSpellLit = 4;
const HeroCarrying = 8;
const HeroAway = 16;
const MonsterFacingLeft = 1;
const MonsterMoving = 2;
const MonsterHit = 4;
const InputFiring = 1;
const InputCasting = 2;
const InputWarping = 4;

/**
 * `input` as it arrives at the host, numbered `seq`: its direction and aim to `AxisSteps`. A guest moves its own
 * hero with this, not the input it read, so the host plays exactly what the guest did.
 */
export function QuantiseInput(input: IPlayerInput, seq: number): IPlayerInput {
    return {
        direction: new Vec2(Axis(ToAxis(input.direction.x)), Axis(ToAxis(input.direction.y))),
        firing: input.firing,
        aimX: Axis(ToAxis(input.aimX)),
        casting: input.casting,
        warping: !!input.warping,
        seq
    };
}

/** The message as bytes to send. */
export function EncodePlay(message: PlayMessage, writer = new ByteWriter(256)): Uint8Array {
    writer.Clear();
    switch (message.t) {
        case "input":
            WriteInputs(writer, message);
            break;
        case "snapshot":
            WriteSnapshot(writer, message);
            break;
        case "restart":
            writer.U8(RestartKind).U8(message.round & 0xff);
            break;
        case "ping":
        case "pong":
            writer.U8(message.t === "ping" ? PingKind : PongKind).U16(message.id & 0xffff);
            break;
        case "catch-up":
            writer.U8(CatchUpKind).U8(message.round & 0xff);
            WriteEvents(writer, message.events);
            break;
        case "leave":
            writer.U8(LeaveKind);
            break;
    }
    return writer.ToBytes();
}

/** A message of play from bytes another machine sent - null for any other kind (a lobby message), or one that's garbled. */
export function DecodePlay(bytes: Uint8Array): PlayMessage | null {
    if (!bytes.length) {
        return null;
    }
    const reader = new ByteReader(bytes);
    try {
        switch (reader.U8()) {
            case InputKind:
                return ReadInputs(reader);
            case SnapshotKind:
                return ReadSnapshot(reader);
            case RestartKind:
                return { t: "restart", round: reader.U8() };
            case PingKind:
                return { t: "ping", id: reader.U16() };
            case PongKind:
                return { t: "pong", id: reader.U16() };
            case CatchUpKind: {
                const round = reader.U8();
                return { t: "catch-up", round, events: ReadEvents(reader) };
            }
            case LeaveKind:
                return { t: "leave" };
            default:
                return null;
        }
    } catch {
        return null;
    }
}

function WriteInputs(writer: ByteWriter, message: InputMessage): void {
    const inputs = message.inputs;
    writer.U8(InputKind).U8(message.round & 0xff).U32(inputs.length ? inputs[inputs.length - 1].seq || 0 : 0).U8(inputs.length);
    inputs.forEach(input => {
        const flags = (input.firing ? InputFiring : 0) | (input.casting ? InputCasting : 0) | (input.warping ? InputWarping : 0);
        writer.I8(ToAxis(input.direction.x)).I8(ToAxis(input.direction.y)).I8(ToAxis(input.aimX)).U8(flags);
    });
}

function ReadInputs(reader: ByteReader): InputMessage {
    const round = reader.U8();
    const newest = reader.U32();
    const count = reader.U8();
    const inputs: IPlayerInput[] = [];
    for (let i = 0; i < count; i++) {
        const x = reader.I8();
        const y = reader.I8();
        const aim = reader.I8();
        const flags = reader.U8();
        inputs.push({
            direction: new Vec2(Axis(x), Axis(y)),
            aimX: Axis(aim),
            firing: (flags & InputFiring) !== 0,
            casting: (flags & InputCasting) !== 0,
            warping: (flags & InputWarping) !== 0,
            seq: newest - (count - 1 - i)
        });
    }
    return { t: "input", round, inputs };
}

function WriteSnapshot(writer: ByteWriter, snapshot: Snapshot): void {
    writer.U8(SnapshotKind).U8(snapshot.round & 0xff).U32(snapshot.tick);

    writer.U8(snapshot.heroes.length);
    snapshot.heroes.forEach(hero => {
        const flags = (hero.gone ? HeroGone : 0) | (hero.away ? HeroAway : 0) | (hero.facingX < 0 ? HeroFacingLeft : 0) | (hero.spellLit !== null ? HeroSpellLit : 0) | (hero.carried !== null ? HeroCarrying : 0);
        // Exactly: a guest moves its own hero on from here, and must land where the host's steps will.
        writer.U8(flags).F64(hero.x).F64(hero.y).F64(hero.vx).F64(hero.vy);
        writer.U16(Math.max(0, Math.round(hero.hitPoints))).F32(hero.invulnerable).U32(Math.max(0, Math.round(hero.gold)));
        // Timers a guest's own steps run on from here, exactly too - when they can next fire, or cast.
        writer.U8(hero.equipped).F64(hero.fireCooldown).F64(hero.spellLit !== null ? hero.spellLit : hero.spellRecharging);
        if (hero.carried !== null) {
            writer.F64(hero.carried);
        }
        if (hero.spellLit !== null) {
            writer.F32(hero.orbX).F32(hero.orbY).F32(hero.orbTime);
        }
        writer.U32(hero.ack);
    });

    writer.U16(snapshot.monsters.length);
    snapshot.monsters.forEach(m => {
        const flags = (m.facingX < 0 ? MonsterFacingLeft : 0) | (m.moving ? MonsterMoving : 0) | (m.hit ? MonsterHit : 0);
        writer.U16(m.id & 0xffff).U8(m.type).U16(ToPosition(m.x)).U16(ToPosition(m.y)).U8(flags);
    });

    writer.U16(snapshot.projectiles.length);
    snapshot.projectiles.forEach(p => {
        writer.U16(p.id & 0xffff).U16(p.shot).U16(ToPosition(p.x)).U16(ToPosition(p.y));
        writer.I16(ToSpeed(p.vx)).I16(ToSpeed(p.vy)).I8(p.hero).I32(p.seq);
    });

    writer.U16(snapshot.doors.length);
    for (let i = 0; i < snapshot.doors.length; i += 8) {
        let bits = 0;
        for (let b = 0; b < 8 && i + b < snapshot.doors.length; b++) {
            bits |= snapshot.doors[i + b] ? 1 << b : 0;
        }
        writer.U8(bits);
    }

    writer.U8(snapshot.flashing.length);
    snapshot.flashing.forEach(index => writer.U16(index));

    WriteEvents(writer, snapshot.events);
}

function WriteEvents(writer: ByteWriter, events: ReadonlyArray<NetEvent>): void {
    writer.U16(events.length);
    events.forEach(event => {
        writer.U8(EventKinds.indexOf(event.e));
        switch (event.e) {
            case "pickup":
            case "keys":
            case "locked":
                writer.U8(event.hero).U16(event.x).U16(event.y);
                break;
            case "spawner":
            case "spawner-hit":
                writer.U16(event.index);
                break;
            case "killed":
                writer.U8(event.type).F32(event.x).F32(event.y).I8(event.hero).U8(event.boss ? 1 : 0);
                break;
            case "damaged":
                writer.U16(event.damage).U16(Math.max(0, event.hitPoints)).U8(event.hero);
                break;
            case "died":
            case "completed":
                writer.U8(event.hero);
                break;
            case "all-died":
                break;
            case "shot":
                writer.U16(event.index).String(JSON.stringify(event.setup));
                break;
            case "quest":
                writer.U8(event.index).U8(QuestStates.indexOf(event.state)).U16(Math.max(0, Math.min(0xffff, event.progress)));
                break;
            case "fired":
                writer.U16(event.shot).I8(event.hero);
                break;
            case "stopped":
                writer.U16(event.shot);
                break;
            case "hit":
            case "spawned":
            case "woke":
                writer.U8(event.type);
                break;
            case "cast":
                writer.U8(event.hero);
                break;
        }
    });
}

function ReadSnapshot(reader: ByteReader): Snapshot {
    const round = reader.U8();
    const tick = reader.U32();

    const heroes: HeroSnapshot[] = [];
    const heroCount = reader.U8();
    for (let i = 0; i < heroCount; i++) {
        const flags = reader.U8();
        const x = reader.F64();
        const y = reader.F64();
        const vx = reader.F64();
        const vy = reader.F64();
        const hitPoints = reader.U16();
        const invulnerable = reader.F32();
        const gold = reader.U32();
        const equipped = reader.U8();
        const fireCooldown = reader.F64();
        const spell = reader.F64();
        const lit = (flags & HeroSpellLit) !== 0;
        const carried = (flags & HeroCarrying) !== 0 ? reader.F64() : null;
        const orbX = lit ? reader.F32() : 0;
        const orbY = lit ? reader.F32() : 0;
        const orbTime = lit ? reader.F32() : 0;
        heroes.push({
            gone: (flags & HeroGone) !== 0,
            away: (flags & HeroAway) !== 0,
            x, y, vx, vy,
            facingX: (flags & HeroFacingLeft) !== 0 ? -1 : 1,
            hitPoints, invulnerable, gold, equipped, fireCooldown,
            spellLit: lit ? spell : null,
            spellRecharging: lit ? 0 : spell,
            carried, orbX, orbY, orbTime,
            ack: reader.U32()
        });
    }

    const monsters: MonsterSnapshot[] = [];
    const monsterCount = reader.U16();
    for (let i = 0; i < monsterCount; i++) {
        const id = reader.U16();
        const type = reader.U8();
        const x = FromPosition(reader.U16());
        const y = FromPosition(reader.U16());
        const flags = reader.U8();
        monsters.push({ id, type, x, y, facingX: (flags & MonsterFacingLeft) !== 0 ? -1 : 1, moving: (flags & MonsterMoving) !== 0, hit: (flags & MonsterHit) !== 0 });
    }

    const projectiles: ProjectileSnapshot[] = [];
    const projectileCount = reader.U16();
    for (let i = 0; i < projectileCount; i++) {
        const id = reader.U16();
        const shot = reader.U16();
        const x = FromPosition(reader.U16());
        const y = FromPosition(reader.U16());
        const vx = reader.I16() / SpeedSteps;
        const vy = reader.I16() / SpeedSteps;
        const hero = reader.I8();
        projectiles.push({ id, shot, x, y, vx, vy, hero, seq: reader.I32() });
    }

    const doors: boolean[] = [];
    const doorCount = reader.U16();
    for (let i = 0; i < doorCount; i += 8) {
        const bits = reader.U8();
        for (let b = 0; b < 8 && i + b < doorCount; b++) {
            doors.push((bits & (1 << b)) !== 0);
        }
    }

    const flashing: number[] = [];
    const flashCount = reader.U8();
    for (let i = 0; i < flashCount; i++) {
        flashing.push(reader.U16());
    }

    return { t: "snapshot", round, tick, heroes, monsters, projectiles, doors, flashing, events: ReadEvents(reader) };
}

function ReadEvents(reader: ByteReader): NetEvent[] {
    const events: NetEvent[] = [];
    const count = reader.U16();
    for (let i = 0; i < count; i++) {
        events.push(ReadEvent(reader));
    }
    return events;
}

function ReadEvent(reader: ByteReader): NetEvent {
    const kind = EventKinds[reader.U8()];
    switch (kind) {
        case "pickup":
        case "keys":
        case "locked":
            return { e: kind, hero: reader.U8(), x: reader.U16(), y: reader.U16() };
        case "spawner":
        case "spawner-hit":
            return { e: kind, index: reader.U16() };
        case "killed":
            return { e: kind, type: reader.U8(), x: reader.F32(), y: reader.F32(), hero: reader.I8(), boss: reader.U8() === 1 };
        case "damaged":
            return { e: kind, damage: reader.U16(), hitPoints: reader.U16(), hero: reader.U8() };
        case "died":
        case "completed":
            return { e: kind, hero: reader.U8() };
        case "all-died":
            return { e: kind };
        case "shot": {
            const index = reader.U16();
            return { e: kind, index, setup: JSON.parse(reader.String()) as ShotSetup };
        }
        case "quest": {
            const index = reader.U8();
            const state = QuestStates[reader.U8()];
            if (!state) {
                throw new RangeError("Unknown quest state.");
            }
            return { e: kind, index, state, progress: reader.U16() };
        }
        case "fired":
            return { e: kind, shot: reader.U16(), hero: reader.I8() };
        case "stopped":
            return { e: kind, shot: reader.U16() };
        case "hit":
        case "spawned":
        case "woke":
            return { e: kind, type: reader.U8() };
        case "cast":
            return { e: kind, hero: reader.U8() };
        default:
            throw new RangeError("Unknown event.");
    }
}

function ToAxis(value: number): number {
    return Math.max(-AxisSteps, Math.min(AxisSteps, Math.round(value * AxisSteps)));
}

function Axis(steps: number): number {
    return steps / AxisSteps;
}

function ToPosition(value: number): number {
    return Math.max(0, Math.min(0xffff, Math.round(value * PositionSteps)));
}

function FromPosition(steps: number): number {
    return steps / PositionSteps;
}

function ToSpeed(value: number): number {
    return Math.max(-0x8000, Math.min(0x7fff, Math.round(value * SpeedSteps)));
}
