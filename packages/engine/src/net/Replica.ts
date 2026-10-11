/**
 * An online guest's copy of the host's monsters, shots and spawners, to draw
 * (see `EncounterView`): built from the host's last few snapshots, at the
 * moment `PlayClock` says - between the two snapshots either side of it, so
 * everything moves smoothly at whatever rate they come - and the other heroes
 * likewise. The guest's own shots are its own stand-ins, fired the moment it
 * fires (see `Fire`) and flying ahead of the host's, which they stand in for
 * until the host's is gone. Nothing here decides anything: the host does.
 * Pure - no pixi - so it runs under the plain node test runner.
 */

import { Vec2, Vec2Like } from "@logic-incubator/lib/math/Geometry";
import { TileSize } from "../Constants";
import type { EncounterView, MonsterLook } from "../Encounter";
import MonsterRoster from "../level/entities/MonsterRoster";
import { CreateProjectile, Overlaps, Projectile, ProjectileBox, ShotSetup, SpriteBox, StepProjectile } from "../level/entities/Projectiles";
import type { SpawnerState } from "../level/entities/Spawners";
import type { HeroSnapshot, MonsterSnapshot, ProjectileSnapshot, Snapshot } from "./PlayMessages";

/** How many snapshots are kept - a second's worth, far more than drawing between them needs. */
const KeptCount = 20;
/** How far past the newest snapshot anything is carried on along its way, in steps, before it waits for the next. */
const MaxAheadTicks = 6;

/** A monster as drawn, kept from frame to frame by its id so its animation runs on. */
type DrawnMonster = MonsterLook & { position: Vec2; previous: Vec2; size: { width: number; height: number } };

/** A snapshot, with its monsters and shots by id for finding them in the next one. */
type Kept = { snapshot: Snapshot; monsters: Map<number, MonsterSnapshot>; projectiles: Map<number, ProjectileSnapshot> };

/** A hero as drawn at a moment: where they are and where their mage-light floats, and the rest of them as of the snapshot before. */
export type HeroMoment = { snapshot: HeroSnapshot; x: number; y: number; orbX: number; orbY: number };

/** One of the guest's own shots, standing in for the host's (see `Replica.Fire`). */
type StandIn = Projectile & { confirmed: boolean };

export type ReplicaOptions = {
    /** The hero played on this machine - whose shots are its own stand-ins. */
    you: number;
    /** Pixel size of a sprite, as `EncounterOptions.sizeFor` - what a stand-in shot hits a monster by. */
    sizeFor: (name: string) => { width: number; height: number } | undefined;
};

export default class Replica implements EncounterView {
    monsters: DrawnMonster[] = [];
    projectiles: Projectile[] = [];
    spawners: SpawnerState[] = [];
    readonly spawnerFlash = new Set<SpawnerState>();

    private kept: Kept[] = [];
    private shots: ShotSetup[] = [];
    private drawnMonsters = new Map<number, DrawnMonster>();
    private drawnShots = new Map<number, Projectile>();
    private standIns: StandIn[] = [];
    /** The `seq`s this machine has fired with lately - the host's shots with them are drawn as their stand-ins, not as themselves. */
    private fired = new Set<number>();
    private moment: HeroMoment = { snapshot: null as unknown as HeroSnapshot, x: 0, y: 0, orbX: 0, orbY: 0 };

    constructor(private options: ReplicaOptions) {}

    /** The newest snapshot - undefined before the first. */
    get Newest(): Snapshot | undefined {
        const last = this.kept[this.kept.length - 1];
        return last && last.snapshot;
    }

    /** Starts a level afresh, with these spawners - the guest's encounter's own, as the level began. */
    Reset(spawners: SpawnerState[]): void {
        this.kept = [];
        this.shots = [];
        this.monsters = [];
        this.projectiles = [];
        this.spawners = spawners;
        this.spawnerFlash.clear();
        this.drawnMonsters.clear();
        this.drawnShots.clear();
        this.standIns = [];
        this.fired.clear();
    }

    /** A kind of shot the host has numbered `index` (the `shot` event). */
    AddShot(index: number, setup: ShotSetup): void {
        this.shots[index] = setup;
    }

    /**
     * Keeps a snapshot to draw from, and settles the stand-ins against it: one the host's own shot has shown up
     * for flies on until that's gone; one the host has played the input of, yet shows no shot for, goes (it never
     * fired, or its shot hit at once).
     */
    Push(snapshot: Snapshot): void {
        const kept: Kept = { snapshot, monsters: new Map(), projectiles: new Map() };
        snapshot.monsters.forEach(m => kept.monsters.set(m.id, m));
        snapshot.projectiles.forEach(p => kept.projectiles.set(p.id, p));
        this.kept.push(kept);
        if (this.kept.length > KeptCount) {
            this.kept.shift();
        }

        const you = this.options.you;
        const mine = new Set<number>();
        snapshot.projectiles.forEach(p => {
            if (p.hero === you) {
                mine.add(p.seq);
            }
        });
        const hero = snapshot.heroes[you];
        const acked = hero ? hero.ack : 0;
        this.standIns.forEach(shot => {
            if (mine.has(shot.seq)) {
                shot.confirmed = true;
            } else if (shot.confirmed || acked >= shot.seq) {
                shot.dead = true;
            }
        });
        this.standIns = this.standIns.filter(shot => !shot.dead);
        // Long played: no shot of the host's can still be waiting to show for them.
        Array.from(this.fired).forEach(seq => {
            if (seq < acked - 600) {
                this.fired.delete(seq);
            }
        });

        this.spawnerFlash.clear();
        snapshot.flashing.forEach(index => {
            const state = this.spawners[index];
            if (state) {
                this.spawnerFlash.add(state);
            }
        });
    }

    /** This machine's hero fired, with input `seq`: a stand-in shot flies from now, until the host's own is gone. */
    Fire(from: Vec2Like, direction: Vec2Like, setup: ShotSetup, seq: number): void {
        const shot = CreateProjectile(from, direction, setup, "player", TileSize, 0, this.options.you, seq) as StandIn;
        shot.confirmed = false;
        this.standIns.push(shot);
        this.fired.add(seq);
    }

    /**
     * Moves the stand-ins one step: each stops at a cell `isBlocked` says it can't enter - a wall, or where no hero
     * can see - or at a monster as it's drawn, as the host's shot would have, to the player's eye.
     */
    StepStandIns(isBlocked: (tileX: number, tileY: number) => boolean): void {
        this.standIns.forEach(shot => {
            StepProjectile(shot, 1, isBlocked, TileSize);
            if (!shot.dead) {
                const box = ProjectileBox(shot);
                shot.dead = this.monsters.some(m => Overlaps(box, SpriteBox(m.position, m.size, TileSize)));
            }
        });
        this.standIns = this.standIns.filter(shot => !shot.dead);
    }

    /**
     * Sets out the monsters and shots to draw at the host's step `tick` (fractional - see `PlayClock`), `frames`
     * 60ths of a second after the last time.
     */
    Sample(tick: number, frames: number): void {
        const span = this.Span(tick);
        if (!span) {
            return;
        }
        const { from, to, f, ahead } = span;
        const roster = MonsterRoster.inst;

        const monsters: DrawnMonster[] = [];
        const seen = new Set<number>();
        from.snapshot.monsters.forEach(m => {
            const def = roster.Def(roster.Types[m.type]);
            if (!def) {
                return;
            }
            let drawn = this.drawnMonsters.get(m.id);
            if (!drawn || drawn.def !== def) {
                drawn = {
                    def,
                    position: new Vec2(m.x, m.y),
                    previous: new Vec2(m.x, m.y),
                    moving: m.moving,
                    // Offset like the host's, so a crowd doesn't step in lockstep.
                    animTime: (m.id * 37) % 100,
                    hitFlash: 0,
                    facingX: m.facingX,
                    size: this.options.sizeFor(def.idle) || { width: TileSize, height: TileSize }
                };
                this.drawnMonsters.set(m.id, drawn);
            }
            const next = to ? to.monsters.get(m.id) : undefined;
            if (next) {
                drawn.position.Set(m.x + (next.x - m.x) * f, m.y + (next.y - m.y) * f);
            } else {
                const before = ahead > 0 ? this.Before(from, m.id) : undefined;
                drawn.position.Set(m.x + (before ? before.vx * ahead : 0), m.y + (before ? before.vy * ahead : 0));
            }
            drawn.previous.Copy(drawn.position);
            drawn.moving = m.moving;
            drawn.facingX = m.facingX;
            drawn.hitFlash = m.hit ? 1 : 0;
            drawn.animTime += frames;
            monsters.push(drawn);
            seen.add(m.id);
        });
        this.drawnMonsters.forEach((_, id) => {
            if (!seen.has(id)) {
                this.drawnMonsters.delete(id);
            }
        });
        this.monsters = monsters;

        const projectiles: Projectile[] = [];
        const flying = new Set<number>();
        from.snapshot.projectiles.forEach(p => {
            const setup = this.shots[p.shot];
            // This machine's own are drawn as its stand-ins.
            if (!setup || (p.hero === this.options.you && this.fired.has(p.seq))) {
                return;
            }
            let drawn = this.drawnShots.get(p.id);
            if (!drawn || drawn.setup !== setup) {
                drawn = CreateProjectile(p, { x: p.vx, y: p.vy }, setup, p.hero >= 0 ? "player" : "monster", TileSize, p.id, p.hero, p.seq);
                this.drawnShots.set(p.id, drawn);
            }
            const next = to ? to.projectiles.get(p.id) : undefined;
            const x = next ? p.x + (next.x - p.x) * f : p.x + p.vx * ahead;
            const y = next ? p.y + (next.y - p.y) * f : p.y + p.vy * ahead;
            drawn.x = drawn.px = x;
            drawn.y = drawn.py = y;
            drawn.vx = p.vx;
            drawn.vy = p.vy;
            projectiles.push(drawn);
            flying.add(p.id);
        });
        this.drawnShots.forEach((_, id) => {
            if (!flying.has(id)) {
                this.drawnShots.delete(id);
            }
        });
        this.standIns.forEach(shot => projectiles.push(shot));
        this.projectiles = projectiles;
    }

    /** Hero `index` at the host's step `tick`, as `Sample` places everything - null before the first snapshot. The same object each time. */
    HeroAt(index: number, tick: number): HeroMoment | null {
        const span = this.Span(tick);
        const hero = span && span.from.snapshot.heroes[index];
        if (!span || !hero) {
            return null;
        }
        const next = span.to ? span.to.snapshot.heroes[index] : undefined;
        const f = next ? span.f : 0;
        const moment = this.moment;
        moment.snapshot = hero;
        moment.x = hero.x + ((next ? next.x : hero.x) - hero.x) * f;
        moment.y = hero.y + ((next ? next.y : hero.y) - hero.y) * f;
        // A mage-light just lit appears where it is, not on its way from wherever it last went out.
        const orbFrom = next && next.spellLit !== null && hero.spellLit === null ? next : hero;
        moment.orbX = orbFrom.orbX + ((next && next.spellLit !== null ? next.orbX : orbFrom.orbX) - orbFrom.orbX) * f;
        moment.orbY = orbFrom.orbY + ((next && next.spellLit !== null ? next.orbY : orbFrom.orbY) - orbFrom.orbY) * f;
        return moment;
    }

    /**
     * The two snapshots either side of `tick` and how far it is between them (`f`, 0 to 1) - or, past the newest,
     * that one and how many steps past it (`ahead`, up to `MaxAheadTicks`). Null with none kept.
     */
    private Span(tick: number): { from: Kept; to: Kept | null; f: number; ahead: number } | null {
        const kept = this.kept;
        if (!kept.length) {
            return null;
        }
        if (tick <= kept[0].snapshot.tick) {
            return { from: kept[0], to: null, f: 0, ahead: 0 };
        }
        for (let i = kept.length - 2; i >= 0; i--) {
            const from = kept[i];
            const to = kept[i + 1];
            if (tick >= from.snapshot.tick && tick < to.snapshot.tick) {
                return { from, to, f: (tick - from.snapshot.tick) / Math.max(1, to.snapshot.tick - from.snapshot.tick), ahead: 0 };
            }
        }
        const newest = kept[kept.length - 1];
        return { from: newest, to: null, f: 0, ahead: Math.min(MaxAheadTicks, tick - newest.snapshot.tick) };
    }

    /** How monster `id` was moving into `kept`, in pixels a step, from the snapshot before it - undefined if it wasn't in that one. */
    private Before(kept: Kept, id: number): { vx: number; vy: number } | undefined {
        const index = this.kept.indexOf(kept);
        const before = index > 0 ? this.kept[index - 1] : undefined;
        const was = before && before.monsters.get(id);
        const now = kept.monsters.get(id);
        if (!before || !was || !now) {
            return undefined;
        }
        const steps = Math.max(1, kept.snapshot.tick - before.snapshot.tick);
        return { vx: (now.x - was.x) / steps, vy: (now.y - was.y) / steps };
    }
}
