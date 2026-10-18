import { describe, expect, it } from "vitest";
import { Vec2, Vec2Like } from "@logic-incubator/lib/math/Geometry";
import { TileSize } from "../Constants";
import { ALL_PLAYERS_DIED, DOOR_LOCKED, LEVEL_COMPLETED, LIGHT_SPELL_CAST, NPC_BUMPED, PICKUP_COLLECTED, QUEST_UPDATED } from "../Events";
import type { IPlayerInput } from "../input/PlayerControl";
import { DoorOpens } from "../level/Doors";
import type { CollectedPickup } from "../level/Level";
import { Chase } from "../level/entities/Behaviours";
import { NoLock } from "../level/entities/Keys";
import { LightSpell } from "../level/entities/LightSpell";
import type { MonsterDef } from "../level/entities/MonsterRoster";
import { PickupArea, PickupSpot, PickupValue } from "../level/entities/Pickups";
import { WeaponDef } from "../level/entities/Projectiles";
import type { QuestDef } from "../story/Quests";
import World, { StartCells, WarpDistance, WorldLevel } from "./World";

/**
 * Whole steps of play for a party on ASCII maps (`#` solid, `D` the cells of one door, `S` the start, `E` a way out, `N` an NPC),
 * with the real heroes, collision and encounter - only the level is a stand-in, its doors following the
 * same rule as `Level`'s (`DoorOpens`).
 */

const FRAME = 1 / 60;
const BOW: WeaponDef = { icon: "bow", shot: { sprite: "arrow", speed: 6, damage: 1, range: 20, cooldown: 0.5 } };
const SETUP = { hitPoints: 6, weapons: [BOW] };
const SPELL: LightSpell = { light: { brightness: 1, tint: 0xffffff, range: 5 }, seconds: 10, recharge: 5 };
const Walker: MonsterDef = { idle: "walker_idle", run: "walker_run", hitPoints: 2, speed: 0.5, contactDamage: 1, contactCooldown: 1, behaviour: () => new Chase() };

type Pickup = PickupSpot & { value: PickupValue; sprite: string | null };
type TestLevel = Omit<WorldLevel, "pickups"> & { door: { cells: Vec2Like[]; isOpen: boolean; lockId: number }; pickups: Pickup[]; visibleFrom: Vec2Like[] };

/** Where a pickup on cell `x`, `y` with nothing drawn lies - the whole cell is what's touched. */
function Spot(x: number, y: number): PickupSpot {
    return { x, y, area: PickupArea({ x, y }, TileSize) };
}

function Level(rows: string[], lockId = NoLock, quests: QuestDef[] = []): TestLevel {
    const collisionData: boolean[][] = [];
    const door = { cells: [] as Vec2Like[], isOpen: false, lockId };
    const exits: Vec2Like[] = [];
    const npcs: Vec2Like[] = [];
    let start: Vec2Like | undefined;
    rows.forEach((row, y) => row.split("").forEach((c, x) => {
        (collisionData[x] = collisionData[x] || [])[y] = c === "#" || c === "N";
        if (c === "N") {
            npcs.push({ x, y });
        }
        if (c === "D") {
            door.cells.push({ x, y });
        } else if (c === "S") {
            start = { x, y };
        } else if (c === "E") {
            exits.push({ x, y });
        }
    }));
    const width = rows[0].length;
    const height = rows.length;
    const isSolid = (x: number, y: number) => x < 0 || y < 0 || x >= width || y >= height || collisionData[x][y];
    const isDoor = (x: number, y: number) => door.cells.some(c => c.x === x && c.y === y);
    let doorVersion = 0;
    const level: TestLevel = {
        door,
        pickups: [],
        visibleFrom: [],
        spawners: [],
        bosses: [],
        quests,
        collisionData,
        boundRect: { width, height },
        playerStartPosition: start,
        get doorVersion() {
            return doorVersion;
        },
        IsSolid: isSolid,
        IsDoorClosed: (x, y) => !door.isOpen && isDoor(x, y),
        IsCellVisible: () => true,
        HeightAt: () => 0,
        RemoveSpawner: () => undefined,
        IsFloor: (x, y) => !isSolid(x, y) && !isDoor(x, y),
        IsExit: (x, y) => exits.some(e => e.x === x && e.y === y),
        IsTalker: (x, y) => npcs.some(n => n.x === x && n.y === y),
        Marked: (kind, quest) => (kind === "collect" ? level.pickups.filter(p => p.value.quest === quest).length : 0),
        IsDoorLocked: (x, y, canOpen) => isDoor(x, y) && !door.isOpen && !canOpen(door.lockId),
        UpdateDoors(tiles, canOpen) {
            const open = DoorOpens(door, tiles, canOpen);
            if (open !== door.isOpen) {
                door.isOpen = open;
                doorVersion++;
            }
        },
        UpdateVisibleRegions(tiles) {
            level.visibleFrom = tiles.slice();
        },
        CollectPickupsAt(x, y): CollectedPickup[] {
            const here = level.pickups.filter(p => p.x === x && p.y === y);
            level.pickups = level.pickups.filter(p => here.indexOf(p) < 0);
            return here.map(p => ({ value: p.value, sprite: p.sprite }));
        },
        DropPickup(x, y, value, sprite) {
            level.pickups.push({ ...Spot(x, y), value, sprite });
            return { x, y };
        }
    };
    return level;
}

function Input(x = 0, y = 0, extra: Partial<IPlayerInput> = {}): IPlayerInput {
    return { direction: new Vec2(x, y), firing: false, aimX: 0, casting: false, ...extra };
}

function Setup(rows: string[], heroes: number, lockId = NoLock, quests: QuestDef[] = []) {
    const level = Level(rows, lockId, quests);
    const events: { event: string; args: unknown[] }[] = [];
    const world = new World(level, { emit: (event, ...args) => events.push({ event, args }), sizeFor: () => ({ width: TileSize, height: TileSize }) });
    world.Reset(SETUP, Array.from({ length: heroes }, () => undefined));
    return { level, world, events };
}

/** A hero's position, in whole tiles, where `t` is in tiles. */
function Put(world: World, index: number, t: Vec2Like): void {
    const state = world.Heroes[index].State as { position: Vec2; previous: Vec2 };
    state.position.Set(t.x * TileSize, t.y * TileSize);
    state.previous.Set(t.x * TileSize, t.y * TileSize);
}

const ROOM = [
    "##########",
    "#........#",
    "#...S....#",
    "#........#",
    "##########"
];

// The start, and a way out four steps to its right.
const EXIT = [
    "##########",
    "#.S...E..#",
    "##########"
];

const HALL = [
    "##############################",
    "#............................#",
    "#.S..........................#",
    "#............................#",
    "##############################"
];

// A room split by a two-cell door, the start to its left.
const DOORED = [
    "##########",
    "#...D....#",
    "#.S.D....#",
    "##########"
];

describe("StartCells", () => {
    const open = (rows: string[]) => (x: number, y: number) => !!rows[y] && rows[y][x] === ".";

    it("puts the first on the start and the rest on the nearest floor, by steps", () => {
        const rows = [
            "#####",
            "#...#",
            "#...#",
            "#####"
        ];
        const cells = StartCells({ x: 1, y: 1 }, 3, open(rows));
        expect(cells[0]).toEqual({ x: 1, y: 1 });
        expect(cells.slice(1)).toEqual(expect.arrayContaining([{ x: 2, y: 1 }, { x: 1, y: 2 }]));
    });

    it("never starts anyone beyond a wall", () => {
        const rows = [
            "#######",
            "#.#...#",
            "#######"
        ];
        const cells = StartCells({ x: 1, y: 1 }, 2, open(rows));
        expect(cells).toEqual([{ x: 1, y: 1 }, { x: 1, y: 1 }]);
    });
});

describe("World", () => {
    it("starts one hero per slot, together at the level's start, each with their own light spell", () => {
        const level = Level(ROOM);
        const world = new World(level, { emit: () => undefined, sizeFor: () => undefined });
        world.Reset(SETUP, [undefined, SPELL, undefined]);
        expect(world.Heroes.map(h => h.Index)).toEqual([0, 1, 2]);
        expect(world.Heroes[0].Tile).toEqual({ x: 4, y: 2 });
        const tiles = world.Heroes.map(h => h.Tile.x + "," + h.Tile.y);
        expect(new Set(tiles).size).toBe(3);
        expect(world.Heroes.map(h => !!h.Spell)).toEqual([false, true, false]);
        expect(level.visibleFrom.length).toBe(3);
    });

    it("says a hero cast their light spell as they cast it - not while it stays lit", () => {
        const level = Level(ROOM);
        const events: { event: string; args: unknown[] }[] = [];
        const world = new World(level, { emit: (event, ...args) => events.push({ event, args }), sizeFor: () => undefined });
        world.Reset(SETUP, [undefined, SPELL]);
        world.Step([Input(0, 0, { casting: true }), Input(0, 0, { casting: true })], 1, FRAME);
        world.Step([undefined, Input(0, 0, { casting: true })], 1, FRAME);
        expect(events.filter(e => e.event === LIGHT_SPELL_CAST).map(e => e.args)).toEqual([[1]]);
    });

    it("moves each hero with their own input, and leaves one with none standing", () => {
        const { world } = Setup(ROOM, 2);
        const before = world.Heroes.map(h => ({ x: h.Position.x, y: h.Position.y }));
        world.Step([Input(1, 0)], 1, FRAME);
        expect(world.Heroes[0].Position.x).toBeGreaterThan(before[0].x);
        expect(world.Heroes[1].Position).toEqual(before[1]);
    });

    it("gives a pickup to the first hero there, by slot", () => {
        const { level, world } = Setup(ROOM, 2);
        Put(world, 0, { x: 6, y: 2 });
        Put(world, 1, { x: 6, y: 2 });
        level.pickups.push({ ...Spot(6, 2), value: { kind: "gold", amount: 5 }, sprite: null });
        world.Step([], 1, FRAME);
        expect(world.Heroes[0].Gold.amount).toBe(5);
        expect(world.Heroes[1].Gold.amount).toBe(0);
    });

    it("picks up what any part of a hero's sprite overlaps, off their own cell - a tall hero's head reaching into the cell above", () => {
        const { level, world, events } = Setup(ROOM, 1);
        level.pickups.push({ ...Spot(6, 1), value: { kind: "gold", amount: 5 }, sprite: null });
        Put(world, 0, { x: 6, y: 2 });
        world.Step([], 1, FRAME);
        // A one-tile sprite only meets the cell's edge.
        expect(world.Heroes[0].Gold.amount).toBe(0);
        world.Heroes[0].SetFigure({ width: TileSize, height: 28 });
        world.Step([], 1, FRAME);
        expect(world.Heroes[0].Gold.amount).toBe(5);
        expect(level.pickups).toEqual([]);
        expect(events.filter(e => e.event === PICKUP_COLLECTED).map(e => e.args)).toEqual([[0, 6, 1, [{ value: { kind: "gold", amount: 5 }, sprite: null }]]]);
    });

    it("picks up from every cell a hero's sprite overlaps at once, telling of each", () => {
        const { level, world, events } = Setup(ROOM, 1);
        level.pickups.push({ ...Spot(5, 2), value: { kind: "gold", amount: 1 }, sprite: null });
        level.pickups.push({ ...Spot(6, 2), value: { kind: "gold", amount: 2 }, sprite: null });
        level.pickups.push({ ...Spot(7, 2), value: { kind: "gold", amount: 4 }, sprite: null });
        Put(world, 0, { x: 5.5, y: 2 });
        world.Step([], 1, FRAME);
        expect(world.Heroes[0].Gold.amount).toBe(3);
        expect(level.pickups.map(p => p.x)).toEqual([7]);
        expect(events.filter(e => e.event === PICKUP_COLLECTED).map(e => e.args)).toEqual([
            [0, 5, 2, [{ value: { kind: "gold", amount: 1 }, sprite: null }]],
            [0, 6, 2, [{ value: { kind: "gold", amount: 2 }, sprite: null }]]
        ]);
    });

    it("touches a pickup where it's drawn, not anywhere on its cell", () => {
        const { level, world } = Setup(ROOM, 1);
        // A coin drawn at the right of its cell.
        level.pickups.push({ x: 6, y: 2, area: { x: 6 * TileSize + 10, y: 2 * TileSize, width: 6, height: 7 }, value: { kind: "gold", amount: 5 }, sprite: "coin" });
        // Half over its cell, from the left, short of the coin.
        Put(world, 0, { x: 5.5, y: 2 });
        world.Step([], 1, FRAME);
        expect(world.Heroes[0].Gold.amount).toBe(0);
        // From the right, a pixel over it.
        Put(world, 0, { x: 7 - 1 / TileSize, y: 2 });
        world.Step([], 1, FRAME);
        expect(world.Heroes[0].Tile).toEqual({ x: 7, y: 2 });
        expect(world.Heroes[0].Gold.amount).toBe(5);
    });

    it("doesn't reach a pickup up on a ledge too high to step onto, until the hero is up there", () => {
        const { level, world } = Setup(ROOM, 1);
        level.HeightAt = (_x, y) => (y === 1 ? 2 : 0);
        level.pickups.push({ ...Spot(6, 1), value: { kind: "gold", amount: 5 }, sprite: null });
        world.Heroes[0].SetFigure({ width: TileSize, height: 28 });
        Put(world, 0, { x: 6, y: 2 });
        world.Step([], 1, FRAME);
        expect(world.Heroes[0].Gold.amount).toBe(0);
        Put(world, 0, { x: 6, y: 1 });
        world.Step([], 1, FRAME);
        expect(world.Heroes[0].Gold.amount).toBe(5);
    });

    it("opens a locked door for every hero once any of them carries its key", () => {
        const { level, world } = Setup(DOORED, 2, 7);
        expect(world.IsLockedOut(4, 1)).toBe(true);
        world.Heroes[1].ApplyPickup({ value: { kind: "key", id: 7 }, sprite: "key" });
        expect(world.TeamCanOpen(7)).toBe(true);
        expect(world.IsLockedOut(4, 1)).toBe(false);
        Put(world, 0, { x: 4, y: 1 });
        world.Step([], 1, FRAME);
        expect(level.door.isOpen).toBe(true);
    });

    it("tells of a hero walking into a door no one has the key for - once, until they walk away from it", () => {
        const { world, events } = Setup(DOORED, 1, 7);
        const locked = () => events.filter(e => e.event === DOOR_LOCKED).map(e => e.args);
        Put(world, 0, { x: 3, y: 2 });
        for (let i = 0; i < 20; i++) {
            world.Step([Input(1, 0)], 1, FRAME);
        }
        expect(locked()).toEqual([[0, 4, 2]]);
        for (let i = 0; i < 20; i++) {
            world.Step([Input(-1, 0)], 1, FRAME);
        }
        for (let i = 0; i < 40; i++) {
            world.Step([Input(1, 0)], 1, FRAME);
        }
        expect(locked()).toHaveLength(2);
        // With its key, the door opens instead.
        events.length = 0;
        world.Heroes[0].ApplyPickup({ value: { kind: "key", id: 7 }, sprite: "key" });
        for (let i = 0; i < 20; i++) {
            world.Step([Input(1, 0)], 1, FRAME);
        }
        expect(locked()).toEqual([]);
    });

    it("drops a fallen hero's keys where they fell, and the rest play on", () => {
        const { level, world, events } = Setup(DOORED, 2, 7);
        world.Heroes[1].ApplyPickup({ value: { kind: "key", id: 7 }, sprite: "key" });
        world.Heroes[1].Damage(6);
        world.Step([], 1, FRAME);
        expect(world.Living.map(h => h.Index)).toEqual([0]);
        expect(world.Heroes[1].Keys.keys).toEqual([]);
        const fell = world.Heroes[1].Tile;
        expect(level.pickups).toEqual([{ ...Spot(fell.x, fell.y), value: { kind: "key", id: 7 }, sprite: "key" }]);
        expect(world.TeamCanOpen(7)).toBe(false);
        expect(events.some(e => e.event === ALL_PLAYERS_DIED)).toBe(false);

        // Once only - the next step drops nothing more.
        world.Step([], 1, FRAME);
        expect(level.pickups.length).toBe(1);
    });

    it("never shuts a door on a hero after the key's carrier falls", () => {
        const { level, world } = Setup(DOORED, 2, 7);
        world.Heroes[1].ApplyPickup({ value: { kind: "key", id: 7 }, sprite: "key" });
        Put(world, 0, { x: 4, y: 1 });
        world.Step([], 1, FRAME);
        expect(level.door.isOpen).toBe(true);
        world.Heroes[1].Damage(6);
        world.Step([], 1, FRAME);
        world.Step([], 1, FRAME);
        expect(level.door.isOpen).toBe(true);
        expect(world.IsLockedOut(4, 1)).toBe(false);
    });

    it("ends when the last hero falls, and holds still until the next Reset", () => {
        const { world, events } = Setup(ROOM, 2);
        world.Heroes[0].Damage(6);
        world.Step([], 1, FRAME);
        expect(world.AllDown).toBe(false);
        world.Heroes[1].Damage(6);
        world.Step([], 1, FRAME);
        expect(world.AllDown).toBe(true);
        expect(events.filter(e => e.event === ALL_PLAYERS_DIED).length).toBe(1);

        const at = { x: world.Heroes[1].Position.x, y: world.Heroes[1].Position.y };
        world.Step([Input(1, 0), Input(1, 0)], 1, FRAME);
        expect(world.Heroes[1].Position).toEqual(at);
        expect(events.filter(e => e.event === ALL_PLAYERS_DIED).length).toBe(1);

        world.Reset(SETUP, [undefined, undefined]);
        expect(world.AllDown).toBe(false);
        expect(world.Living.length).toBe(2);
    });

    it("names which hero a shot came from", () => {
        const { world } = Setup(ROOM, 2);
        world.Step([undefined, Input(0, 0, { firing: true })], 1, FRAME);
        expect(world.encounter.projectiles.map(p => p.hero)).toEqual([1]);
    });

    it("holds a hero at the leash's edge, as far from the others as it allows", () => {
        const { world } = Setup(HALL, 2);
        world.SetLeash({ width: 5, height: 5 });
        Put(world, 0, { x: 2, y: 2 });
        Put(world, 1, { x: 6, y: 2 });
        for (let i = 0; i < 120; i++) {
            world.Step([undefined, Input(1, 0)], 1, FRAME);
        }
        expect(world.Heroes[1].Position.x).toBe(7 * TileSize);

        world.SetLeash(null);
        for (let i = 0; i < 30; i++) {
            world.Step([undefined, Input(1, 0)], 1, FRAME);
        }
        expect(world.Heroes[1].Position.x).toBeGreaterThan(7 * TileSize);
    });

    it("warps a hero far from the rest to the nearest of them - not one close by", () => {
        const { world } = Setup(HALL, 3);
        Put(world, 0, { x: 2, y: 2 });
        Put(world, 1, { x: 2 + WarpDistance - 1, y: 2 });
        Put(world, 2, { x: 2 + WarpDistance + 15, y: 2 });
        world.Step([Input(0, 0, { warping: true }), undefined, Input(0, 0, { warping: true })], 1, FRAME);
        expect(world.Heroes[0].Position).toEqual({ x: 2 * TileSize, y: 2 * TileSize });
        expect(world.Heroes[2].Position).toEqual({ x: (2 + WarpDistance - 1) * TileSize, y: 2 * TileSize });
        expect(world.Heroes[2].State.previous).toEqual(world.Heroes[2].State.position);
    });

    it("never warps a lone hero, or to a fallen one", () => {
        const { world } = Setup(HALL, 2);
        Put(world, 1, { x: 25, y: 2 });
        world.Heroes[1].Damage(6);
        const at = { x: world.Heroes[0].Position.x, y: world.Heroes[0].Position.y };
        world.Step([Input(0, 0, { warping: true })], 1, FRAME);
        expect(world.Heroes[0].Position).toEqual(at);
    });

    it("leaves a hero who is away standing where they were, out of play - picking nothing up, gone for by no monster - until they're back", () => {
        const { level, world } = Setup(ROOM, 2);
        Put(world, 0, { x: 2, y: 2 });
        Put(world, 1, { x: 6, y: 2 });
        level.pickups.push({ ...Spot(6, 2), value: { kind: "gold", amount: 5 }, sprite: null });
        const walker = WalkerAt(7, 2);
        world.encounter.monsters.push(walker);
        world.SetAway(1, true);
        expect(world.Heroes[1].Away).toBe(true);
        expect(world.Active.map(h => h.Index)).toEqual([0]);
        expect(world.Living.map(h => h.Index)).toEqual([0, 1]);

        const at = { x: world.Heroes[1].Position.x, y: world.Heroes[1].Position.y };
        for (let i = 0; i < 30; i++) {
            world.Step([undefined, Input(1, 0)], 1, FRAME);
        }
        expect(world.Heroes[1].Position).toEqual(at);
        expect(world.Heroes[1].Gold.amount).toBe(0);
        expect(world.Heroes[1].Health.hitPoints).toBe(SETUP.hitPoints);
        expect(level.pickups).toHaveLength(1);
        // Past them, after the one in play.
        expect(walker.position.x).toBeLessThan(7 * TileSize);

        world.SetAway(1, false);
        world.Step([], 1, FRAME);
        expect(world.Heroes[1].Gold.amount).toBe(5);
    });

    it("ends the level when every hero still standing is away, as if all had fallen", () => {
        const { world, events } = Setup(ROOM, 2);
        world.Heroes[0].Damage(6);
        world.Step([], 1, FRAME);
        expect(world.AllDown).toBe(false);
        world.SetAway(1, true);
        expect(world.AllDown).toBe(true);
        expect(events.filter(e => e.event === ALL_PLAYERS_DIED)).toHaveLength(1);

        // The next level starts with everyone in play; one who has left for good is never away.
        world.Reset(SETUP, [undefined, undefined]);
        expect(world.Heroes[1].Away).toBe(false);
        world.RemoveHero(1);
        world.SetAway(1, true);
        expect(world.Heroes[1].Away).toBe(false);
    });

    it("ends the level when any hero reaches a way out, and holds still until the next Reset", () => {
        const { world, events } = Setup(EXIT, 2);
        Put(world, 1, { x: 5, y: 1 });
        world.Heroes[0].Damage(6);
        for (let i = 0; i < 60 && !world.Completed; i++) {
            world.Step([undefined, Input(1, 0)], 1, FRAME);
        }
        expect(world.Completed).toBe(true);
        expect(events.filter(e => e.event === LEVEL_COMPLETED).map(e => e.args)).toEqual([[1]]);

        const at = { x: world.Heroes[1].Position.x, y: world.Heroes[1].Position.y };
        world.Step([undefined, Input(1, 0)], 1, FRAME);
        expect(world.Heroes[1].Position).toEqual(at);

        // Everyone - the fallen too - starts the next one on their feet.
        world.Reset(SETUP, [undefined, undefined]);
        expect(world.Completed).toBe(false);
        expect(world.Living.length).toBe(2);
    });
});

/** A walker standing at cell (`x`, `y`), going for the nearest hero in play. */
describe("World's quests and talk", () => {
    const Mushrooms: QuestDef = { id: "mushrooms", name: "MUSHROOMS", goal: { kind: "collect" }, start: true };

    it("counts the pickups marked for a quest, and tells of it", () => {
        const { level, world, events } = Setup(ROOM, 1, NoLock, [Mushrooms]);
        level.pickups.push({ ...Spot(5, 2), value: { kind: "item", quest: "mushrooms" }, sprite: "mushroom" });
        level.pickups.push({ ...Spot(6, 2), value: { kind: "item", quest: "mushrooms" }, sprite: "mushroom" });
        world.Reset(SETUP, [undefined]);
        expect(world.quests.Get("mushrooms")).toMatchObject({ state: "active", target: 2 });
        Put(world, 0, { x: 5, y: 2 });
        world.Step([Input()], 1, FRAME);
        Put(world, 0, { x: 6, y: 2 });
        world.Step([Input()], 1, FRAME);
        expect(events.filter(e => e.event === QUEST_UPDATED).map(e => e.args)).toEqual([
            ["mushrooms", "active", 1, "active"],
            ["mushrooms", "complete", 2, "active"]
        ]);
        // It doesn't end the level.
        expect(world.Completed).toBe(false);
    });

    it("ends the level when a quest that ends it is complete - the hero who did it got there", () => {
        const { level, world, events } = Setup(ROOM, 2, NoLock, [{ ...Mushrooms, ends: true }]);
        level.pickups.push({ ...Spot(7, 2), value: { kind: "item", quest: "mushrooms" }, sprite: null });
        world.Reset(SETUP, [undefined, undefined]);
        Put(world, 1, { x: 7, y: 2 });
        world.Step([Input(), Input()], 1, FRAME);
        expect(world.Completed).toBe(true);
        expect(events.filter(e => e.event === LEVEL_COMPLETED).map(e => e.args)).toEqual([[1]]);
    });

    it("counts a monster marked for a quest when a hero's shot kills it", () => {
        const { world } = Setup(ROOM, 1, NoLock, [{ id: "king", name: "KING", goal: { kind: "kill" }, start: true, ends: true }]);
        Put(world, 0, { x: 2, y: 2 });
        const king = { ...WalkerAt(4, 2), hitPoints: 1, quest: "king" };
        world.encounter.monsters.push(king);
        for (let i = 0; i < 30 && !world.Completed; i++) {
            world.Step([Input(0, 0, { firing: true })], 1, FRAME);
        }
        expect(king.dead).toBe(true);
        expect(world.quests.State("king")).toBe("complete");
        expect(world.Completed).toBe(true);
    });

    it("starts the quests over, and forgets what dialogs set, with each Reset", () => {
        const { world } = Setup(ROOM, 1, NoLock, [{ id: "smith", name: "SMITH", goal: { kind: "script" } }]);
        world.quests.Give("smith");
        world.flags.add("met");
        world.Reset(SETUP, [undefined]);
        expect(world.quests.State("smith")).toBe("none");
        expect(world.flags.size).toBe(0);
    });

    const SHOP = [
        "#######",
        "#.S.N.#",
        "#######"
    ];

    it("asks for a talk as a hero walks into an NPC - once, until they walk into it again", () => {
        const { world, events } = Setup(SHOP, 1);
        world.SetTalk(true);
        const bumps = () => events.filter(e => e.event === NPC_BUMPED).map(e => e.args);
        for (let i = 0; i < 60; i++) {
            world.Step([Input(1, 0)], 1, FRAME);
        }
        expect(bumps()).toEqual([[0, 4, 1]]);
        world.Step([Input()], 1, FRAME);
        world.Step([Input(1, 0)], 1, FRAME);
        expect(bumps()).toEqual([[0, 4, 1], [0, 4, 1]]);
        // An NPC is solid.
        expect(world.Heroes[0].Tile.x).toBe(3);
    });

    it("leaves NPCs be with talk off", () => {
        const { world, events } = Setup(SHOP, 1);
        for (let i = 0; i < 60; i++) {
            world.Step([Input(1, 0)], 1, FRAME);
        }
        expect(events.some(e => e.event === NPC_BUMPED)).toBe(false);
    });
});

function WalkerAt(x: number, y: number) {
    return {
        id: 1,
        type: "walker",
        def: Walker,
        behaviour: Walker.behaviour(),
        position: new Vec2(x * TileSize, y * TileSize),
        previous: new Vec2(x * TileSize, y * TileSize),
        velocity: new Vec2(),
        hitPoints: 2,
        size: { width: TileSize, height: TileSize },
        facingX: 1,
        moving: false,
        animTime: 0,
        contactCooldown: 0,
        rangedCooldown: 0,
        hitFlash: 0,
        spawner: null,
        boss: false,
        asleep: false,
        dead: false
    };
}
