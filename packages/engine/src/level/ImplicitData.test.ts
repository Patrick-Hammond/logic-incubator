import { describe, expect, it } from "vitest";
import { AssetMetadata } from "./AssetMetadata";
import { FindImplicitPlacements, ImplicitBrush, OrphanedExplicitData } from "./ImplicitData";

const TILE = 16;
const TILE_LAYER = 0;
const DATA_LAYER = -1;

const SPAWNER_VALUE = { monsters: ["imp"], interval: 3, maxAlive: 4, total: 0, activationRange: 10, hitPoints: 10 };
const GOLD_PICKUP: AssetMetadata["pickup"] = { kind: "gold", amount: 10 };

const META: { [name: string]: AssetMetadata } = {
    wall: { collidable: true },
    big_wall: { collidable: true },
    floor: {},
    door: { door: { id: 1, open: false } },
    torch: { light: { brightness: 1, tint: 0xff8100, range: 5 } },
    goblin_camp: { spawner: SPAWNER_VALUE },
    sack_gold: { pickup: GOLD_PICKUP }
};
const SIZES: { [name: string]: { width: number; height: number } } = { door: { width: 32, height: 32 }, big_wall: { width: 32, height: 32 } };

function brush(name: string, x: number, y: number, layerId = TILE_LAYER, extra: Partial<ImplicitBrush> = {}): ImplicitBrush {
    return { name, position: { x, y }, pixelOffset: { x: 0, y: 0 }, layerId, ...extra };
}

function find(brushes: ImplicitBrush[]) {
    return FindImplicitPlacements(
        brushes,
        layerId => layerId >= 0,
        name => META[name],
        name => SIZES[name] || { width: TILE, height: TILE },
        TILE
    );
}

describe("FindImplicitPlacements", () => {
    it("marks collidable tiles, and nothing for tiles with no relevant metadata", () => {
        const result = find([brush("wall", 1, 2), brush("floor", 3, 3), brush("unknown", 4, 4)]);
        expect(result.collision).toEqual([{ x: 1, y: 2 }]);
        expect(result.doors).toEqual([]);
        expect(result.lights).toEqual([]);
    });

    it("expands a door to every cell of its sprite footprint, tagged with its id", () => {
        const result = find([brush("door", 5, 5)]);
        expect(result.doors.map(d => `${d.x},${d.y}:${d.id}`).sort()).toEqual(["5,5:1", "5,6:1", "6,5:1", "6,6:1"]);
    });

    it("expands a collidable tile to every cell of its sprite footprint too, not just its anchor - a 32x32 column_wall/doors_frame_left on 16px tiles blocks its full 2x2 block", () => {
        const result = find([brush("big_wall", 5, 5)]);
        expect(result.collision.map(c => `${c.x},${c.y}`).sort()).toEqual(["5,5", "5,6", "6,5", "6,6"]);
    });

    it("keeps editor-space coordinates, including negative ones (the editor doesn't normalise)", () => {
        const result = find([brush("door", 28, -4), brush("wall", -3, -1)]);
        expect(result.collision).toEqual([{ x: -3, y: -1 }]);
        expect(result.doors.map(d => `${d.x},${d.y}`).sort()).toEqual(["28,-3", "28,-4", "29,-3", "29,-4"]);
    });

    it("reports a tile's intrinsic light", () => {
        expect(find([brush("torch", 2, 2)]).lights).toEqual([{ x: 2, y: 2, value: META.torch.light }]);
    });

    it("prefers a placement's own override over its asset's intrinsic light - see EffectiveLight", () => {
        const override = { brightness: 0.5, tint: 0xffffff, range: 3 };
        const result = find([brush("torch", 2, 2, TILE_LAYER, { data: override })]);
        expect(result.lights).toEqual([{ x: 2, y: 2, value: override }]);
    });

    it("falls back to the intrinsic light when the placement's own data isn't a light value", () => {
        expect(find([brush("torch", 2, 2, TILE_LAYER, { data: 4 })]).lights).toEqual([{ x: 2, y: 2, value: META.torch.light }]);
        expect(find([brush("torch", 2, 2, TILE_LAYER, { data: null })]).lights).toEqual([{ x: 2, y: 2, value: META.torch.light }]);
    });

    it("reports a tile's intrinsic spawner", () => {
        expect(find([brush("goblin_camp", 4, 4)]).spawners).toEqual([{ x: 4, y: 4, value: SPAWNER_VALUE }]);
    });

    it("prefers a placement's own override over its asset's intrinsic spawner - see EffectiveSpawner", () => {
        const override = { ...SPAWNER_VALUE, monsters: ["ogre"] };
        const result = find([brush("goblin_camp", 4, 4, TILE_LAYER, { data: override })]);
        expect(result.spawners).toEqual([{ x: 4, y: 4, value: override }]);
    });

    it("reports a tile's intrinsic pickup - no per-instance override, unlike light/spawner", () => {
        expect(find([brush("sack_gold", 6, 6)]).pickups).toEqual([{ x: 6, y: 6, value: GOLD_PICKUP }]);
    });

    it("ignores brushes on data layers, even if their name has metadata", () => {
        const result = find([
            brush("wall", 1, 1, DATA_LAYER),
            brush("door", 2, 2, DATA_LAYER),
            brush("torch", 3, 3, DATA_LAYER),
            brush("goblin_camp", 4, 4, DATA_LAYER),
            brush("sack_gold", 6, 6, DATA_LAYER)
        ]);
        expect(result.collision).toEqual([]);
        expect(result.doors).toEqual([]);
        expect(result.lights).toEqual([]);
        expect(result.spawners).toEqual([]);
        expect(result.pickups).toEqual([]);
    });
});

describe("OrphanedExplicitData", () => {
    const orphans = (erased: ImplicitBrush[], remaining: ImplicitBrush[]) =>
        OrphanedExplicitData(erased, remaining, layerId => layerId >= 0, name => META[name]);

    it("returns the collision brush under an erased collidable tile, and only on its cell", () => {
        const under = brush("collision", 1, 1, DATA_LAYER);
        const elsewhere = brush("collision", 2, 1, DATA_LAYER);
        expect(orphans([brush("wall", 1, 1)], [under, elsewhere])).toEqual([under]);
    });

    it("never orphans a light or spawner - neither lives on a data layer any more, so there's nothing left to outlive the tile (its override just goes with it)", () => {
        const light = brush("light", 2, 2, DATA_LAYER, { data: { brightness: 0.5, tint: 0xffffff, range: 3 } });
        const spawner = brush("spawner", 4, 4, DATA_LAYER, { data: SPAWNER_VALUE });
        expect(orphans([brush("torch", 2, 2)], [light])).toEqual([]);
        expect(orphans([brush("goblin_camp", 4, 4)], [spawner])).toEqual([]);
    });

    it("leaves data the erased tile didn't provide", () => {
        const collision = brush("collision", 1, 1, DATA_LAYER);
        const z = brush("z-index", 1, 1, DATA_LAYER, { data: 2 });
        // A wall has no z-index of its own to lose - erasing it leaves an unrelated one untouched.
        expect(orphans([brush("wall", 1, 1)], [z])).toEqual([]);
        // Collision on a floor is a deliberate one-off, not the floor's.
        expect(orphans([brush("floor", 1, 1)], [collision])).toEqual([]);
    });

    it("keeps the data while another tile on the cell (on any tile layer) still provides it", () => {
        const collision = brush("collision", 1, 1, DATA_LAYER);
        expect(orphans([brush("wall", 1, 1)], [brush("wall", 1, 1, 3), collision])).toEqual([]);
        // ...but a remaining tile without the property doesn't count.
        expect(orphans([brush("wall", 1, 1)], [brush("floor", 1, 1, 3), collision])).toEqual([collision]);
    });

    it("ignores erased brushes on data layers", () => {
        const collision = brush("collision", 1, 1, DATA_LAYER);
        expect(orphans([brush("wall", 1, 1, DATA_LAYER)], [collision])).toEqual([]);
    });
});

describe("pickups and door locks in FindImplicitPlacements", () => {
    const KEY: AssetMetadata["pickup"] = { kind: "key", id: 3 };

    it("takes a tile's pickup from its asset", () => {
        const result = find([brush("sack_gold", 2, 3)]);
        expect(result.pickups).toEqual([{ x: 2, y: 3, value: GOLD_PICKUP }]);
    });

    it("lets a placement carry its own pickup, over its asset's", () => {
        const result = find([brush("sack_gold", 2, 3, TILE_LAYER, { data: KEY as never })]);
        expect(result.pickups).toEqual([{ x: 2, y: 3, value: KEY }]);
    });

    it("lets a plain tile become a pickup by carrying one", () => {
        expect(find([brush("floor", 1, 1, TILE_LAYER, { data: KEY as never })]).pickups).toEqual([{ x: 1, y: 1, value: KEY }]);
    });

    it("ignores data that isn't a pickup - a light's, or a malformed one - and falls back to the asset's", () => {
        const light = { brightness: 1, tint: 0, range: 4 };
        expect(find([brush("sack_gold", 0, 0, TILE_LAYER, { data: light })]).pickups[0].value).toBe(GOLD_PICKUP);
        expect(find([brush("sack_gold", 0, 0, TILE_LAYER, { data: { kind: "gold" } })]).pickups[0].value).toBe(GOLD_PICKUP);
        expect(find([brush("floor", 0, 0, TILE_LAYER, { data: { kind: "gold" } })]).pickups).toEqual([]);
    });

    it("gives each door placement one lock, at its footprint's first cell - unlocked (-1) unless it sets its own", () => {
        expect(find([brush("door", 5, 5)]).doorLocks).toEqual([{ x: 5, y: 5, lock: -1 }]);
        expect(find([brush("door", 5, 5, TILE_LAYER, { data: { lock: 9 } })]).doorLocks).toEqual([{ x: 5, y: 5, lock: 9 }]);
        expect(find([brush("door", 5, 5, TILE_LAYER, { data: { lock: 0 } })]).doorLocks).toEqual([{ x: 5, y: 5, lock: 0 }]);
    });

    it("puts a door placement's lock at the first cell of its footprint even when the sprite is nudged off its anchor", () => {
        const nudged = find([brush("door", 5, 5, TILE_LAYER, { pixelOffset: { x: 16, y: 0 } })]);
        expect(nudged.doorLocks).toEqual([{ x: 4, y: 5, lock: -1 }]);
    });

    it("leaves a door's cells tagged by its sprite pair id, whatever its lock", () => {
        const result = find([brush("door", 5, 5, TILE_LAYER, { data: { lock: 9 } })]);
        expect(result.doors.every(cell => cell.id === 1)).toBe(true);
    });

    it("has no locks for tiles that aren't doors", () => {
        expect(find([brush("wall", 1, 1), brush("torch", 2, 2)]).doorLocks).toEqual([]);
    });
});
