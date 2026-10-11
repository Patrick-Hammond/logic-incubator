import { describe, expect, it } from "vitest";
import { Vec2 } from "@logic-incubator/lib/math/Geometry";
import { TileSize } from "../Constants";
import type { IPlayerInput } from "../input/PlayerControl";
import { WeaponDef } from "../level/entities/Projectiles";
import World from "../sim/World";
import { NetTestLevel } from "./__fixtures__/NetTestLevel";
import { HeroSnapshotOf } from "./HeroSync";
import Prediction from "./Prediction";

const BOW: WeaponDef = { icon: "bow", shot: { sprite: "arrow", speed: 6, damage: 1, range: 20, cooldown: 0.5 } };
const SETUP = { hitPoints: 6, weapons: [BOW] };
const MAP = [
    "##########",
    "#S.......#",
    "#........#",
    "##########"
];

function Input(x: number, y = 0): IPlayerInput {
    return { direction: new Vec2(x, y), firing: false, aimX: 0, casting: false };
}

/** A host's world and a guest's copy of the same level, one hero each - the guest's own. */
function Worlds(): { host: World; guest: World } {
    const options = { emit: () => undefined, sizeFor: () => undefined };
    const host = new World(NetTestLevel(MAP), options);
    const guest = new World(NetTestLevel(MAP), options);
    host.Reset(SETUP, [undefined], 1);
    guest.Reset(SETUP, [undefined], 1);
    return { host, guest };
}

describe("Prediction", () => {
    it("moves the hero at once, numbering each input", () => {
        const { guest } = Worlds();
        const prediction = new Prediction();
        const hero = guest.Heroes[0];
        const x = hero.Position.x;
        const sent = prediction.Step(hero, Input(1), [], guest.Collider);
        expect(sent.seq).toBe(1);
        expect(prediction.Step(hero, Input(1), [], guest.Collider).seq).toBe(2);
        expect(hero.Position.x).toBeGreaterThan(x);
        expect(prediction.Pending).toBe(2);
        expect(prediction.Recent(1).map(input => input.seq)).toEqual([2]);
    });

    it("isn't corrected when the host played the same inputs - however far behind its word comes", () => {
        const { host, guest } = Worlds();
        const prediction = new Prediction();
        const sent: IPlayerInput[] = [];
        for (let i = 0; i < 40; i++) {
            sent.push(prediction.Step(guest.Heroes[0], Input(1, i % 10 < 5 ? 0.5 : -0.5), [], guest.Collider));
        }
        // The host has played the first 25, as they came; 15 more are on their way.
        sent.slice(0, 25).forEach(input => host.Step([input], 1, 1 / 60));
        const before = guest.Heroes[0].Position.x;
        prediction.Reconcile(guest.Heroes[0], HeroSnapshotOf(host.Heroes[0], 25), [], guest.Collider);
        expect(prediction.Pending).toBe(15);
        expect(guest.Heroes[0].Position.x).toBeCloseTo(before, 6);
        expect(prediction.Corrections).toBe(0);
        expect(prediction.Offset.x).toBeCloseTo(0, 6);
    });

    it("puts the hero where the host says, replays the rest, and draws the difference away over a few frames", () => {
        const { host, guest } = Worlds();
        const prediction = new Prediction();
        for (let i = 0; i < 10; i++) {
            prediction.Step(guest.Heroes[0], Input(1), [], guest.Collider);
        }
        // The host saw them stand still for the first five.
        for (let i = 0; i < 5; i++) {
            host.Step([{ ...Input(0), seq: i + 1 }], 1, 1 / 60);
        }
        const drawnBefore = guest.Heroes[0].Position.x;
        prediction.Reconcile(guest.Heroes[0], HeroSnapshotOf(host.Heroes[0], 5), [], guest.Collider);
        const moved = guest.Heroes[0].Position.x - drawnBefore;
        expect(moved).toBeLessThan(-1);
        expect(prediction.Corrections).toBe(1);
        // Drawn where it was, to begin with...
        expect(prediction.Offset.x).toBeCloseTo(-moved, 6);
        // ...and closing on where they are.
        prediction.Settle(10);
        expect(Math.abs(prediction.Offset.x)).toBeLessThan(Math.abs(moved) * 0.25);
        prediction.Settle(60);
        expect(prediction.Offset.x).toBe(0);
    });

    it("jumps a difference too big to draw away - the host warped them", () => {
        const { guest } = Worlds();
        const prediction = new Prediction();
        prediction.Step(guest.Heroes[0], Input(1), [], guest.Collider);
        const far = { ...HeroSnapshotOf(guest.Heroes[0], 1), x: guest.Heroes[0].Position.x + 4 * TileSize };
        prediction.Reconcile(guest.Heroes[0], far, [], guest.Collider);
        expect(prediction.Offset.x).toBe(0);
        expect(guest.Heroes[0].Position.x).toBeCloseTo(far.x, 6);
    });

    it("doesn't fire again when it plays inputs over", () => {
        const { host, guest } = Worlds();
        const prediction = new Prediction();
        const hero = guest.Heroes[0];
        prediction.Step(hero, { ...Input(0), firing: true }, [], guest.Collider);
        expect(hero.TakeShot()).not.toBeNull();
        prediction.Reconcile(hero, HeroSnapshotOf(host.Heroes[0], 0), [], guest.Collider);
        expect(hero.TakeShot()).toBeNull();
    });
});
