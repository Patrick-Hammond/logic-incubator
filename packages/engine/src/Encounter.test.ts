import { beforeEach, describe, expect, it } from "vitest";
import { Vec2Like } from "@logic-incubator/lib/math/Geometry";
import { TileSize } from "./Constants";
import Encounter, { EncounterLevel, EncounterPlayer } from "./Encounter";
import { MONSTER_KILLED, PLAYER_DAMAGED, PLAYER_DIED, SPAWNER_DESTROYED } from "./Events";
import { Chase, KeepDistance } from "./level/entities/Behaviours";
import { CreateHealth, DamageHealth, Health, TickHealth } from "./level/entities/Health";
import MonsterRoster, { MonsterDef } from "./level/entities/MonsterRoster";
import { ShotSetup } from "./level/entities/Projectiles";
import { DefaultSpawnerValue, Spawner, SpawnerValue } from "./level/entities/Spawners";
import { BoxCentre, CentreTile } from "./view/helpers/PlayerMovement";

/**
 * Whole frames of play on ASCII maps (`#` solid), against the real flow field,
 * movement and collision - only the level and player are stand-ins.
 */

const Walker: MonsterDef = { idle: "walker_idle", run: "walker_run", hitPoints: 2, speed: 0.5, contactDamage: 1, contactCooldown: 1, behaviour: () => new Chase() };
const Shooter: MonsterDef = {
    ...Walker,
    contactDamage: 0,
    behaviour: () => new KeepDistance({ range: 4 }),
    ranged: { sprite: "bolt", speed: 4, damage: 1, cooldown: 1, range: 8 }
};

const ARROW: ShotSetup = { sprite: "arrow", speed: 6, damage: 1, range: 20 };
const FRAME = 1 / 60;

class TestPlayer implements EncounterPlayer {
    readonly Health: Health = CreateHealth(6);
    constructor(public Position: Vec2Like) {}
    get Centre(): Vec2Like {
        return BoxCentre(this.Position);
    }
    get Tile(): Vec2Like {
        return CentreTile(this.Position);
    }
    Damage(damage: number): boolean {
        return DamageHealth(this.Health, damage);
    }
}

function TestLevel(rows: string[], spawners: Spawner[], visible: (x: number, y: number) => boolean = () => true): EncounterLevel {
    const collisionData: boolean[][] = [];
    const mark = (x: number, y: number, solid: boolean) => ((collisionData[x] = collisionData[x] || [])[y] = solid);
    rows.forEach((row, y) => row.split("").forEach((c, x) => c === "#" && mark(x, y, true)));
    spawners.forEach(s => s.cells.forEach(c => mark(c.x, c.y, true)));
    const width = rows[0].length;
    const height = rows.length;
    return {
        spawners,
        collisionData,
        boundRect: { width, height },
        IsSolid: (x, y) => x < 0 || y < 0 || x >= width || y >= height || !!(collisionData[x] && collisionData[x][y]),
        IsCellVisible: visible,
        HeightAt: () => 0,
        RemoveSpawner(spawner) {
            spawner.cells.forEach(c => mark(c.x, c.y, false));
            spawners.splice(spawners.indexOf(spawner), 1);
        }
    };
}

/** A 2x2 spawner with its top-left at (x, y). */
function TestSpawner(x: number, y: number, value: Partial<SpawnerValue>): Spawner {
    return {
        x,
        y,
        cells: [{ x, y }, { x: x + 1, y }, { x, y: y + 1 }, { x: x + 1, y: y + 1 }],
        value: { ...DefaultSpawnerValue(), monsters: ["walker"], interval: 1, maxAlive: 3, total: 0, activationRange: 0, hitPoints: 2, ...value }
    };
}

function At(tileX: number, tileY: number): Vec2Like {
    return { x: tileX * TileSize, y: tileY * TileSize };
}

const ROOM = [
    "####################",
    "#..................#",
    "#..................#",
    "#..................#",
    "#..................#",
    "#..................#",
    "####################"
];

// A wall down the middle, crossed only by a one-tile doorway near the bottom.
const WALLED = [
    "####################",
    "#.......#..........#",
    "#.......#..........#",
    "#.......#..........#",
    "#.......#..........#",
    "#.......#..........#",
    "#..................#",
    "#.......#..........#",
    "####################"
];

type Emitted = { event: string; args: unknown[] }[];

function Setup(rows: string[], spawners: Spawner[], player: TestPlayer, visible?: (x: number, y: number) => boolean) {
    const events: Emitted = [];
    const level = TestLevel(rows, spawners, visible);
    const encounter = new Encounter(level, {
        emit: (event, ...args) => events.push({ event, args }),
        sizeFor: () => ({ width: 16, height: 16 }),
        random: () => 0
    });
    encounter.Reset();
    const run =(frames: number, until?: () => boolean) => {
        for (let i = 0; i < frames && !(until && until()); i++) {
            // What the real Player.Update does for its own health each frame.
            TickHealth(player.Health, FRAME);
            encounter.Update(1, FRAME, player);
        }
    };
    return { events, level, encounter, run, fired: (event: string) => events.filter(e => e.event === event) };
}

beforeEach(() => {
    MonsterRoster.inst.Load({ types: ["walker", "shooter"], defs: { walker: Walker, shooter: Shooter } });
});

describe("Encounter spawning", () => {
    it("spawns on the spawner's side facing the player, every interval, up to maxAlive", () => {
        const player = new TestPlayer(At(2, 3));
        const { encounter, run } = Setup(ROOM, [TestSpawner(12, 2, { interval: 0.5 })], player);

        run(28);
        expect(encounter.monsters).toHaveLength(0);
        run(3);
        expect(encounter.monsters).toHaveLength(1);
        expect(CentreTile(encounter.monsters[0].position).x).toBeLessThanOrEqual(11);

        run(600);
        expect(encounter.monsters).toHaveLength(3);
        expect(encounter.spawners[0].alive).toBe(3);
    });

    it("stays quiet while the player is beyond its activation range", () => {
        const player = new TestPlayer(At(2, 3));
        const { encounter, run } = Setup(ROOM, [TestSpawner(12, 2, { activationRange: 5 })], player);
        run(300);
        expect(encounter.monsters).toHaveLength(0);

        player.Position = At(9, 3);
        run(1);
        expect(encounter.monsters).toHaveLength(1);
    });

    it("starts over from the level's spawners on Reset", () => {
        const player = new TestPlayer(At(2, 3));
        const { encounter, run } = Setup(ROOM, [TestSpawner(12, 2, {})], player);
        run(120);
        encounter.Fire(player.Centre, { x: 1, y: 0 }, ARROW, "player");
        encounter.Reset();
        expect(encounter.monsters).toHaveLength(0);
        expect(encounter.projectiles).toHaveLength(0);
        expect(encounter.spawners[0].produced).toBe(0);
    });
});

describe("Encounter monsters", () => {
    it("find their way round a wall, through a one-tile doorway, to hurt the player - never standing in a wall", () => {
        const player = new TestPlayer(At(3, 2));
        const { level, encounter, run, fired } = Setup(WALLED, [TestSpawner(13, 2, { maxAlive: 1 })], player);

        let inWall = false;
        for (let i = 0; i < 1500 && !fired(PLAYER_DAMAGED).length; i++) {
            run(1);
            inWall = inWall || encounter.monsters.some(m => {
                const tile = CentreTile(m.position);
                return level.IsSolid(tile.x, tile.y);
            });
        }
        expect(fired(PLAYER_DAMAGED)).toHaveLength(1);
        expect(fired(PLAYER_DAMAGED)[0].args).toEqual([1, 5]);
        expect(inWall).toBe(false);
    });

    it("hurt on touch no more often than their cooldown and the player's invulnerability allow", () => {
        const player = new TestPlayer(At(9, 3));
        const { run, fired } = Setup(ROOM, [TestSpawner(11, 3, { maxAlive: 1 })], player);
        run(60 * 3 + 30);
        const hits = fired(PLAYER_DAMAGED).length;
        expect(hits).toBeGreaterThanOrEqual(2);
        expect(hits).toBeLessThanOrEqual(3);
    });

    it("that shoot, do - from a distance, at a player they can see", () => {
        const player = new TestPlayer(At(3, 3));
        const { encounter, run, fired } = Setup(ROOM, [TestSpawner(10, 2, { monsters: ["shooter"], maxAlive: 1 })], player);
        run(240, () => fired(PLAYER_DAMAGED).length > 0);
        expect(fired(PLAYER_DAMAGED)).toHaveLength(1);
        expect(encounter.monsters[0].def).toBe(Shooter);
    });

    it("kill the player - once", () => {
        const player = new TestPlayer(At(9, 3));
        player.Health.hitPoints = 1;
        const { run, fired } = Setup(ROOM, [TestSpawner(11, 3, {})], player);
        run(600);
        expect(fired(PLAYER_DIED)).toHaveLength(1);
    });
});

describe("Encounter shots", () => {
    it("kill monsters, letting their spawner make more", () => {
        const player = new TestPlayer(At(2, 3));
        const { encounter, run, fired } = Setup(ROOM, [TestSpawner(12, 2, { maxAlive: 1, interval: 0 })], player);
        run(1);
        expect(encounter.monsters).toHaveLength(1);
        const monster = encounter.monsters[0];

        for (let shot = 0; shot < 5 && !fired(MONSTER_KILLED).length; shot++) {
            encounter.Fire(player.Centre, { x: monster.position.x - player.Position.x, y: monster.position.y - player.Position.y }, ARROW, "player");
            run(30, () => fired(MONSTER_KILLED).length > 0);
        }
        expect(fired(MONSTER_KILLED)).toHaveLength(1);
        expect(fired(MONSTER_KILLED)[0].args[0]).toBe("walker");
        expect(encounter.monsters).not.toContain(monster);

        run(2);
        expect(encounter.monsters).toHaveLength(1);
    });

    it("destroy a spawner, opening up its cells", () => {
        const player = new TestPlayer(At(2, 3));
        const { level, encounter, run, fired } = Setup(ROOM, [TestSpawner(12, 3, { activationRange: 1 })], player);
        for (let shot = 0; shot < 2; shot++) {
            encounter.Fire(player.Centre, { x: 1, y: 0 }, ARROW, "player");
            run(60);
        }
        expect(fired(SPAWNER_DESTROYED)).toHaveLength(1);
        expect(encounter.spawners[0].destroyed).toBe(true);
        expect(level.spawners).toHaveLength(0);
        expect(level.IsSolid(12, 3)).toBe(false);
        // The flow field saw it open up.
        expect(encounter.Flow.DistanceAt(13, 3)).toBeGreaterThan(0);
    });

    it("glance off an indestructible spawner", () => {
        const player = new TestPlayer(At(2, 3));
        const { encounter, run, fired } = Setup(ROOM, [TestSpawner(12, 3, { activationRange: 1, hitPoints: 0 })], player);
        for (let shot = 0; shot < 5; shot++) {
            encounter.Fire(player.Centre, { x: 1, y: 0 }, ARROW, "player");
            run(60);
        }
        expect(fired(SPAWNER_DESTROYED)).toHaveLength(0);
        expect(encounter.projectiles).toHaveLength(0);
    });

    it("stop at the edge of what the player can see", () => {
        const player = new TestPlayer(At(2, 3));
        const { encounter, run } = Setup(ROOM, [], player, x => x < 6);
        encounter.Fire(player.Centre, { x: 1, y: 0 }, ARROW, "player");
        run(1);
        let furthest = 0;
        for (let i = 0; i < 60 && encounter.projectiles.length; i++) {
            furthest = Math.max(furthest, encounter.projectiles[0].x);
            run(1);
        }
        expect(encounter.projectiles).toHaveLength(0);
        expect(furthest).toBeLessThan(6 * TileSize);
    });
});
