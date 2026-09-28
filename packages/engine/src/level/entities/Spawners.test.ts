import { describe, expect, it } from "vitest";
import { TEST_MONSTERS } from "../__fixtures__/TestMonsters";
import { IsLightValue } from "../Lighting";
import { UNREACHABLE } from "./FlowField";
import MonsterRoster from "./MonsterRoster";
import {
    CreateSpawnerState,
    DamageSpawner,
    DefaultSpawnerValue,
    IsSpawnerValue,
    RecordDeath,
    RecordSpawn,
    SanitiseSpawnerValue,
    SpawnCell,
    Spawner,
    SpawnerCells,
    SpawnerState,
    SpawnerValue,
    StepSpawner
} from "./Spawners";

MonsterRoster.inst.Load(TEST_MONSTERS);

describe("SpawnerValue", () => {
    it("is told apart from a LightValue, both ways", () => {
        const light = { brightness: 0.5, tint: 0xff8100, range: 5 };
        expect(IsSpawnerValue(DefaultSpawnerValue())).toBe(true);
        expect(IsLightValue(DefaultSpawnerValue())).toBe(false);
        expect(IsSpawnerValue(light)).toBe(false);
        expect(IsLightValue(light)).toBe(true);
        expect(IsSpawnerValue(3)).toBe(false);
        expect(IsSpawnerValue(null)).toBe(false);
    });

    it("starts with the roster's default pool", () => {
        expect(DefaultSpawnerValue().monsters).toEqual(["goblin"]);
    });

    it("fills in fields missing from older saves", () => {
        expect(SanitiseSpawnerValue({ monsters: ["imp"], interval: 1 })).toEqual({ ...DefaultSpawnerValue(), monsters: ["imp"], interval: 1 });
        expect(SanitiseSpawnerValue(null)).toEqual(DefaultSpawnerValue());
    });

    it("drops monsters the roster doesn't know, falling back to the default pool if none survive", () => {
        expect(SanitiseSpawnerValue({ monsters: ["imp", "dragon"] }).monsters).toEqual(["imp"]);
        expect(SanitiseSpawnerValue({ monsters: ["dragon"] }).monsters).toEqual(["goblin"]);
    });

    it("floors numbers at 0, keeps maxAlive at least 1 and rounds counts", () => {
        const v = SanitiseSpawnerValue({ monsters: ["imp"], interval: -2, maxAlive: 0, total: 2.6, activationRange: NaN, hitPoints: -1 });
        expect(v).toEqual({ monsters: ["imp"], interval: 0, maxAlive: 1, total: 3, activationRange: DefaultSpawnerValue().activationRange, hitPoints: 0 });
    });

    it("doesn't share the roster's default pool array", () => {
        SanitiseSpawnerValue(null).monsters.push("ogre");
        DefaultSpawnerValue().monsters.push("ogre");
        expect(MonsterRoster.inst.DefaultPool).toEqual(["goblin"]);
    });
});

describe("SpawnerCells", () => {
    it("covers the cells its sprite does, drawn top-left on its own cell", () => {
        expect(SpawnerCells({ x: 3, y: 4 }, { width: 32, height: 32 }, 16)).toEqual([
            { x: 3, y: 4 }, { x: 3, y: 5 }, { x: 4, y: 4 }, { x: 4, y: 5 }
        ]);
        expect(SpawnerCells({ x: 3, y: 4 }, { width: 16, height: 16 }, 16)).toEqual([{ x: 3, y: 4 }]);
    });

    it("is just its own cell without a sprite", () => {
        expect(SpawnerCells({ x: 3, y: 4 }, undefined, 16)).toEqual([{ x: 3, y: 4 }]);
    });
});

describe("StepSpawner", () => {
    function State(value: Partial<SpawnerValue> = {}): SpawnerState {
        const spawner: Spawner = { x: 0, y: 0, cells: [{ x: 0, y: 0 }], value: { ...DefaultSpawnerValue(), interval: 2, maxAlive: 2, total: 0, activationRange: 5, hitPoints: 3, ...value } };
        return CreateSpawnerState(spawner);
    }
    const first = () => 0;

    it("spawns every interval while the player's in range", () => {
        const state = State();
        expect(StepSpawner(state, 1.5, 3, first)).toBeNull();
        expect(StepSpawner(state, 0.5, 3, first)).toBe("goblin");
        RecordSpawn(state);
        expect(StepSpawner(state, 1, 3, first)).toBeNull();
        expect(StepSpawner(state, 1, 3, first)).toBe("goblin");
    });

    it("keeps asking until the spawn is recorded", () => {
        const state = State();
        expect(StepSpawner(state, 2, 3, first)).toBe("goblin");
        expect(StepSpawner(state, 0, 3, first)).toBe("goblin");
    });

    it("waits while the player's out of range or unreachable, then spawns at once when they come near", () => {
        const state = State();
        expect(StepSpawner(state, 5, 6, first)).toBeNull();
        expect(StepSpawner(state, 5, UNREACHABLE, first)).toBeNull();
        expect(StepSpawner(state, 0, 5, first)).toBe("goblin");
    });

    it("is always active with an activation range of 0, even with no way to the player", () => {
        expect(StepSpawner(State({ activationRange: 0 }), 2, UNREACHABLE, first)).toBe("goblin");
    });

    it("pauses at maxAlive and resumes as its monsters die", () => {
        const state = State({ interval: 0 });
        StepSpawner(state, 0, 1, first);
        RecordSpawn(state);
        StepSpawner(state, 0, 1, first);
        RecordSpawn(state);
        expect(StepSpawner(state, 10, 1, first)).toBeNull();
        RecordDeath(state);
        expect(StepSpawner(state, 0, 1, first)).toBe("goblin");
    });

    it("goes dormant once it has produced its total", () => {
        const state = State({ interval: 0, total: 1 });
        StepSpawner(state, 0, 1, first);
        RecordSpawn(state);
        RecordDeath(state);
        expect(StepSpawner(state, 10, 1, first)).toBeNull();
    });

    it("picks at random from its pool", () => {
        const state = State({ monsters: ["goblin", "imp", "ogre"] });
        expect(StepSpawner(state, 2, 1, () => 0)).toBe("goblin");
        expect(StepSpawner(state, 0, 1, () => 0.5)).toBe("imp");
        expect(StepSpawner(state, 0, 1, () => 0.999)).toBe("ogre");
    });

    it("takes damage until destroyed, and then never spawns again", () => {
        const state = State();
        expect(DamageSpawner(state, 2)).toBe(false);
        expect(DamageSpawner(state, 1)).toBe(true);
        expect(state.destroyed).toBe(true);
        expect(DamageSpawner(state, 1)).toBe(false);
        expect(StepSpawner(state, 10, 1, first)).toBeNull();
    });

    it("shrugs off every hit when indestructible (hitPoints 0)", () => {
        const state = State({ hitPoints: 0 });
        expect(DamageSpawner(state, 1000)).toBe(false);
        expect(state.destroyed).toBe(false);
    });
});

describe("SpawnCell", () => {
    const cells = [{ x: 2, y: 2 }, { x: 3, y: 2 }, { x: 2, y: 3 }, { x: 3, y: 3 }];
    const open = (x: number, y: number) => x >= 0 && y >= 0 && x < 8 && y < 8;

    it("picks the open cell bordering the footprint that's the shortest walk to the player", () => {
        // Player off to the right: distance is just how far right of x=7 you are.
        const cell = SpawnCell(cells, open, x => 7 - x);
        expect(cell.x).toBe(4);
    });

    it("never picks a cell of the footprint itself, or a solid one", () => {
        const cell = SpawnCell(cells, (x, y) => open(x, y) && x !== 4, x => 7 - x);
        expect(cells.some(c => c.x === cell.x && c.y === cell.y)).toBe(false);
        expect(cell.x).not.toBe(4);
    });

    it("falls back to any open bordering cell when the player can't be reached, and null when there's none", () => {
        expect(SpawnCell(cells, open, () => UNREACHABLE)).not.toBeNull();
        expect(SpawnCell(cells, () => false, () => 1)).toBeNull();
    });
});
