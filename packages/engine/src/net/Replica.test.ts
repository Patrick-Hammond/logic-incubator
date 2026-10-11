import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Chase } from "../level/entities/Behaviours";
import MonsterRoster, { MonsterDef } from "../level/entities/MonsterRoster";
import { ShotSetup } from "../level/entities/Projectiles";
import type { HeroSnapshot, MonsterSnapshot, ProjectileSnapshot, Snapshot } from "./PlayMessages";
import Replica from "./Replica";

const Walker: MonsterDef = { idle: "walker_idle", run: "walker_run", hitPoints: 2, speed: 0.5, contactDamage: 1, contactCooldown: 1, behaviour: () => new Chase() };
const ARROW: ShotSetup = { sprite: "arrow", speed: 6, damage: 1, range: 20 };
const BOLT: ShotSetup = { sprite: "bolt", speed: 4, damage: 1, range: 8 };

function HeroAt(x: number, y: number, ack = 0, extra: Partial<HeroSnapshot> = {}): HeroSnapshot {
    return {
        gone: false, x, y, vx: 0, vy: 0, facingX: 1, hitPoints: 6, invulnerable: 0, gold: 0, equipped: 0, fireCooldown: 0,
        spellLit: null, spellRecharging: 0, carried: null, orbX: 0, orbY: 0, orbTime: 0, ack, ...extra
    };
}

function Monster(id: number, x: number, y: number, extra: Partial<MonsterSnapshot> = {}): MonsterSnapshot {
    return { id, type: 0, x, y, facingX: 1, moving: true, hit: false, ...extra };
}

function Shot(id: number, x: number, y: number, extra: Partial<ProjectileSnapshot> = {}): ProjectileSnapshot {
    return { id, shot: 1, x, y, vx: 4, vy: 0, hero: -1, seq: -1, ...extra };
}

function Snap(tick: number, changes: Partial<Snapshot> = {}): Snapshot {
    return { t: "snapshot", round: 0, tick, heroes: [HeroAt(0, 0), HeroAt(100, 100)], monsters: [], projectiles: [], doors: [], flashing: [], events: [], ...changes };
}

describe("Replica", () => {
    let replica: Replica;

    beforeEach(() => {
        MonsterRoster.inst.Load({ types: ["walker"], defs: { walker: Walker } });
        replica = new Replica({ you: 0, sizeFor: () => ({ width: 16, height: 16 }) });
        replica.Reset([]);
        replica.AddShot(0, ARROW);
        replica.AddShot(1, BOLT);
    });

    afterEach(() => {
        MonsterRoster.Destroy();
    });

    it("draws a monster between the two snapshots either side of the moment", () => {
        replica.Push(Snap(3, { monsters: [Monster(7, 100, 50)] }));
        replica.Push(Snap(6, { monsters: [Monster(7, 106, 56)] }));
        replica.Sample(4, 1);
        expect(replica.monsters).toHaveLength(1);
        const drawn = replica.monsters[0];
        expect(drawn.def).toBe(Walker);
        expect(drawn.position.x).toBeCloseTo(102);
        expect(drawn.position.y).toBeCloseTo(52);
        // Drawn where it is, whatever the step's alpha.
        expect(drawn.previous.x).toBeCloseTo(102);
    });

    it("keeps a monster's animation running from frame to frame", () => {
        replica.Push(Snap(3, { monsters: [Monster(7, 100, 50)] }));
        replica.Push(Snap(6, { monsters: [Monster(7, 106, 56)] }));
        replica.Sample(4, 1);
        const time = replica.monsters[0].animTime;
        replica.Sample(5, 2);
        expect(replica.monsters[0].animTime).toBe(time + 2);
    });

    it("carries a monster on past the newest snapshot a little way, then waits for the next", () => {
        replica.Push(Snap(3, { monsters: [Monster(7, 100, 50)] }));
        replica.Push(Snap(6, { monsters: [Monster(7, 106, 50)] }));
        replica.Sample(8, 1);
        expect(replica.monsters[0].position.x).toBeCloseTo(110);
        replica.Sample(60, 1);
        // Six steps at most: 2 px a step.
        expect(replica.monsters[0].position.x).toBeCloseTo(118);
    });

    it("drops a monster once the moment is past the last snapshot that had it", () => {
        replica.Push(Snap(3, { monsters: [Monster(7, 100, 50), Monster(8, 0, 0)] }));
        replica.Push(Snap(6, { monsters: [Monster(8, 0, 0)] }));
        replica.Sample(5, 1);
        expect(replica.monsters).toHaveLength(2);
        replica.Sample(6, 1);
        expect(replica.monsters).toHaveLength(1);
    });

    it("draws the host's shots between snapshots, and a hit monster flashing", () => {
        replica.Push(Snap(3, { projectiles: [Shot(20, 40, 8)], monsters: [Monster(7, 0, 0, { hit: true })] }));
        replica.Push(Snap(6, { projectiles: [Shot(20, 52, 8)], monsters: [Monster(7, 0, 0)] }));
        replica.Sample(4.5, 1);
        expect(replica.projectiles).toHaveLength(1);
        const shot = replica.projectiles[0];
        expect(shot.x).toBeCloseTo(46);
        expect(shot.px).toBeCloseTo(46);
        expect(shot.sprite).toBe("bolt");
        expect(replica.monsters[0].hitFlash).toBeGreaterThan(0);
    });

    it("draws the other heroes between snapshots", () => {
        replica.Push(Snap(3, { heroes: [HeroAt(0, 0), HeroAt(100, 100)] }));
        replica.Push(Snap(6, { heroes: [HeroAt(0, 0), HeroAt(106, 103, 0, { hitPoints: 4 })] }));
        const moment = replica.HeroAt(1, 5)!;
        expect(moment.x).toBeCloseTo(104);
        expect(moment.y).toBeCloseTo(102);
        // The rest of them as of the snapshot before.
        expect(moment.snapshot.hitPoints).toBe(6);
    });

    describe("this machine's own shots", () => {
        it("fly from the moment they're fired, as stand-ins", () => {
            replica.Push(Snap(3));
            replica.Fire({ x: 8, y: 8 }, { x: 1, y: 0 }, ARROW, 5);
            replica.StepStandIns(() => false);
            replica.Sample(3, 1);
            expect(replica.projectiles).toHaveLength(1);
            expect(replica.projectiles[0].x).toBe(14);
        });

        it("stand in for the host's: its copy isn't drawn, and the stand-in goes once the host's has", () => {
            replica.Fire({ x: 8, y: 8 }, { x: 1, y: 0 }, ARROW, 5);
            replica.Push(Snap(3, { heroes: [HeroAt(0, 0, 5), HeroAt(100, 100)], projectiles: [Shot(30, 20, 8, { shot: 0, hero: 0, seq: 5 })] }));
            replica.Sample(3, 1);
            expect(replica.projectiles).toHaveLength(1);
            expect(replica.projectiles[0].id).toBe(0);
            replica.Push(Snap(6, { heroes: [HeroAt(0, 0, 6), HeroAt(100, 100)] }));
            replica.Sample(6, 1);
            expect(replica.projectiles).toEqual([]);
        });

        it("go when the host has played the input they were fired with and shows no shot for it", () => {
            replica.Fire({ x: 8, y: 8 }, { x: 1, y: 0 }, ARROW, 5);
            replica.Push(Snap(3, { heroes: [HeroAt(0, 0, 4), HeroAt(100, 100)] }));
            replica.Sample(3, 1);
            expect(replica.projectiles).toHaveLength(1);
            replica.Push(Snap(6, { heroes: [HeroAt(0, 0, 5), HeroAt(100, 100)] }));
            replica.Sample(6, 1);
            expect(replica.projectiles).toEqual([]);
        });

        it("stop at a wall, or at a monster as it's drawn", () => {
            replica.Fire({ x: 8, y: 8 }, { x: 1, y: 0 }, ARROW, 5);
            replica.StepStandIns(x => x >= 1);
            replica.Sample(0, 1);
            expect(replica.projectiles).toEqual([]);

            replica.Push(Snap(3, { monsters: [Monster(7, 16, 0, { moving: false })] }));
            replica.Sample(3, 1);
            replica.Fire({ x: 8, y: 8 }, { x: 1, y: 0 }, ARROW, 6);
            replica.StepStandIns(() => false);
            replica.Sample(3, 1);
            expect(replica.projectiles.filter(p => p.seq === 6)).toHaveLength(1);
            replica.StepStandIns(() => false);
            replica.Sample(3, 1);
            expect(replica.projectiles.filter(p => p.seq === 6)).toEqual([]);
        });

        it("are drawn from the host's copy when this machine never fired them", () => {
            replica.Push(Snap(3, { projectiles: [Shot(30, 20, 8, { shot: 0, hero: 0, seq: 9 })] }));
            replica.Sample(3, 1);
            expect(replica.projectiles).toHaveLength(1);
            expect(replica.projectiles[0].id).toBe(30);
        });
    });
});
