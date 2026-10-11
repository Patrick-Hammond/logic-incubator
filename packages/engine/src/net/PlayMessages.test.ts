import { describe, expect, it } from "vitest";
import { Vec2 } from "@logic-incubator/lib/math/Geometry";
import type { IPlayerInput } from "../input/PlayerControl";
import { DecodeMessage, EncodeMessage } from "./NetMessages";
import { DecodePlay, EncodePlay, HeroSnapshot, IsLastingEvent, QuantiseInput, Snapshot } from "./PlayMessages";

function Input(x: number, y: number, extra: Partial<IPlayerInput> = {}): IPlayerInput {
    return { direction: new Vec2(x, y), firing: false, aimX: 0, casting: false, ...extra };
}

const Hero: HeroSnapshot = {
    gone: false,
    away: false,
    x: 123.25,
    y: 456.5,
    vx: 0.5,
    vy: -0.25,
    facingX: -1,
    hitPoints: 5,
    invulnerable: 0.5,
    gold: 42,
    equipped: 1,
    fireCooldown: 0.25,
    spellLit: 12.5,
    spellRecharging: 0,
    carried: 30,
    orbX: 130,
    orbY: 460,
    orbTime: 2.5,
    ack: 812
};

function SnapshotOf(changes: Partial<Snapshot> = {}): Snapshot {
    return {
        t: "snapshot",
        round: 3,
        tick: 9001,
        heroes: [Hero, { ...Hero, gone: true, facingX: 1, spellLit: null, spellRecharging: 4, carried: null, orbX: 0, orbY: 0, orbTime: 0, ack: 0 }, { ...Hero, away: true }],
        monsters: [
            { id: 7, type: 2, x: 100.25, y: 200.75, facingX: -1, moving: true, hit: false },
            { id: 65535, type: 0, x: 0, y: 3000, facingX: 1, moving: false, hit: true }
        ],
        projectiles: [{ id: 12, shot: 1, x: 50.5, y: 60.25, vx: 6, vy: -0.5, hero: 1, seq: 800 }, { id: 13, shot: 0, x: 1, y: 2, vx: -4, vy: 0, hero: -1, seq: -1 }],
        doors: [true, false, false, true, true, false, true, false, true],
        flashing: [0, 4],
        events: [
            { e: "pickup", hero: 1, x: 10, y: 20 },
            { e: "keys", hero: 0, x: 11, y: 21 },
            { e: "spawner", index: 3 },
            { e: "killed", type: 2, x: 100.5, y: 200.25, hero: 1 },
            { e: "killed", type: 1, x: 5, y: 6, hero: -1 },
            { e: "damaged", damage: 2, hitPoints: 3, hero: 0 },
            { e: "died", hero: 0 },
            { e: "all-died" },
            { e: "completed", hero: 2 },
            { e: "shot", index: 1, setup: { sprite: "arrow", speed: 6, damage: 1, range: 20, light: { brightness: 1, tint: 0xffaa00, range: 3 } } }
        ],
        ...changes
    };
}

describe("QuantiseInput", () => {
    it("keeps a direction to 1/127 an axis, numbered", () => {
        const input = QuantiseInput(Input(Math.SQRT1_2, -Math.SQRT1_2, { firing: true, aimX: -0.4, warping: true }), 9);
        expect(input.seq).toBe(9);
        expect(input.direction.x).toBeCloseTo(90 / 127, 10);
        expect(input.direction.y).toBeCloseTo(-90 / 127, 10);
        expect(input.aimX).toBeCloseTo(-51 / 127, 10);
        expect(input.firing).toBe(true);
        expect(input.warping).toBe(true);
        expect(input.casting).toBe(false);
    });

    it("comes through the wire unchanged, so the host plays what the guest did", () => {
        const sent = [QuantiseInput(Input(0.31, -1, { casting: true }), 41), QuantiseInput(Input(-1, 0, { firing: true, aimX: 1 }), 42)];
        const message = DecodePlay(EncodePlay({ t: "input", round: 7, inputs: sent }));
        expect(message).toEqual({ t: "input", round: 7, inputs: sent });
    });
});

describe("EncodePlay and DecodePlay", () => {
    it("carry inputs numbered back from the newest", () => {
        const message = DecodePlay(EncodePlay({ t: "input", round: 1, inputs: [Input(1, 0, { seq: 5 }), Input(0, 1, { seq: 6 }), Input(0, 0, { seq: 7 })] }));
        expect(message && message.t === "input" && message.inputs.map(input => input.seq)).toEqual([5, 6, 7]);
    });

    it("carry no inputs at all - a guest saying it has the level ready", () => {
        expect(DecodePlay(EncodePlay({ t: "input", round: 2, inputs: [] }))).toEqual({ t: "input", round: 2, inputs: [] });
    });

    it("carry a snapshot: heroes (gone or away), monsters to a quarter pixel, shots, doors, flashing spawners and every kind of event", () => {
        const snapshot = SnapshotOf();
        expect(DecodePlay(EncodePlay(snapshot))).toEqual(snapshot);
    });

    it("carry an empty world", () => {
        const snapshot = SnapshotOf({ heroes: [], monsters: [], projectiles: [], doors: [], flashing: [], events: [] });
        expect(DecodePlay(EncodePlay(snapshot))).toEqual(snapshot);
    });

    it("round monsters' and shots' positions to a quarter pixel", () => {
        const snapshot = SnapshotOf({ monsters: [{ id: 1, type: 0, x: 10.13, y: 7.9, facingX: 1, moving: false, hit: false }] });
        const decoded = DecodePlay(EncodePlay(snapshot)) as Snapshot;
        expect(decoded.monsters[0].x).toBe(10.25);
        expect(decoded.monsters[0].y).toBe(8);
    });

    it("carry restarts and pings", () => {
        expect(DecodePlay(EncodePlay({ t: "restart", round: 4 }))).toEqual({ t: "restart", round: 4 });
        expect(DecodePlay(EncodePlay({ t: "ping", id: 300 }))).toEqual({ t: "ping", id: 300 });
        expect(DecodePlay(EncodePlay({ t: "pong", id: 65535 }))).toEqual({ t: "pong", id: 65535 });
    });

    it("carry a guest leaving, and catching one up that's back: the round, and what lastingly happened in it", () => {
        expect(DecodePlay(EncodePlay({ t: "leave" }))).toEqual({ t: "leave" });
        const lasting = SnapshotOf().events.filter(IsLastingEvent);
        expect(lasting.map(event => event.e)).toEqual(["pickup", "keys", "spawner", "shot"]);
        expect(DecodePlay(EncodePlay({ t: "catch-up", round: 255, events: lasting }))).toEqual({ t: "catch-up", round: 255, events: lasting });
        expect(DecodePlay(EncodePlay({ t: "catch-up", round: 0, events: [] }))).toEqual({ t: "catch-up", round: 0, events: [] });
    });

    it("are told apart from the lobby's messages both ways", () => {
        expect(DecodePlay(EncodeMessage({ t: "need-level" }))).toBeNull();
        expect(DecodeMessage(EncodePlay({ t: "restart", round: 1 }))).toBeNull();
        expect(DecodeMessage(EncodePlay(SnapshotOf()))).toBeNull();
    });

    it("turn down a garbled or cut-short message", () => {
        const bytes = EncodePlay(SnapshotOf());
        expect(DecodePlay(bytes.subarray(0, bytes.length - 3))).toBeNull();
        expect(DecodePlay(new Uint8Array([]))).toBeNull();
        expect(DecodePlay(new Uint8Array([200, 1, 2]))).toBeNull();
    });
});
