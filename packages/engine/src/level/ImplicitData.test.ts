import { describe, expect, it } from "vitest";
import { AssetMetadata } from "./AssetMetadata";
import { FindImplicitPlacements, FindLights, FindPushables, FindSpawners, ImplicitBrush, OrphanedExplicitData } from "./ImplicitData";

const TILE = 16;
const TILE_LAYER = 0;
const DATA_LAYER = -1;

const SPAWNER_VALUE = { monsters: ["imp"], interval: 3, maxAlive: 4, total: 0, activationRange: 10, hitPoints: 10 };
const GOLD_PICKUP: AssetMetadata["pickup"] = { kind: "gold", amount: 10 };

const META: { [name: string]: AssetMetadata } = {
    wall: { collidable: true },
    big_wall: { collidable: true },
    floor: { category: "floor" },
    statue: { category: "misc" },
    door: { door: { id: 1, open: false } },
    torch: { light: { brightness: 1, tint: 0xff8100, range: 5 } },
    goblin_camp: { spawner: SPAWNER_VALUE },
    sack_gold: { pickup: GOLD_PICKUP },
    table: { collidable: true, blocksLight: false },
    curtain: { blocksLight: true }
};
const SIZES: { [name: string]: { width: number; height: number } } = {
    door: { width: 32, height: 32 },
    big_wall: { width: 32, height: 32 },
    statue: { width: 16, height: 32 }
};

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
        expect(result.pickups).toEqual([]);
    });

    it("lists every cell of a tile with blocksLight, with its value, and nothing for tiles without one", () => {
        const result = find([brush("table", 1, 1), brush("curtain", 3, 3), brush("wall", 5, 5), brush("big_wall", 7, 7)]);
        expect(result.lightBlocks).toEqual([{ x: 1, y: 1, blocks: false }, { x: 3, y: 3, blocks: true }]);
        expect(result.collision).toEqual(expect.arrayContaining([{ x: 1, y: 1 }]));
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
        expect(result.pickups).toEqual([]);
    });
});

describe("FindLights", () => {
    /** Tile layers 0 and up, drawn in that order; anything below is a data layer. */
    const lights = (brushes: ImplicitBrush[]) => FindLights(brushes, layerId => (layerId >= 0 ? layerId : undefined), name => META[name]);
    const BLUE = { brightness: 0.8, tint: 0x6688ff, range: 9 };

    it("gives a lit tile its asset's light, belonging to it, and nothing to tiles with none", () => {
        const torch = brush("torch", 2, 2);
        expect(lights([brush("floor", 2, 2), torch, brush("wall", 3, 3)])).toEqual([{ x: 2, y: 2, value: META.torch.light, tile: torch, brush: null }]);
    });

    it("prefers a placement's own override over its asset's light - see EffectiveLight", () => {
        const override = { brightness: 0.5, tint: 0xffffff, range: 3 };
        expect(lights([brush("torch", 2, 2, TILE_LAYER, { data: override })]).map(l => l.value)).toEqual([override]);
    });

    it("falls back to the asset's light when the placement's own data isn't a light value", () => {
        expect(lights([brush("torch", 2, 2, TILE_LAYER, { data: 4 })]).map(l => l.value)).toEqual([META.torch.light]);
        expect(lights([brush("torch", 2, 2, TILE_LAYER, { data: null })]).map(l => l.value)).toEqual([META.torch.light]);
    });

    it("puts a painted light on bare floor, or nothing, standing on its own", () => {
        const onFloor = brush("light", 5, 5, DATA_LAYER, { data: BLUE });
        expect(lights([brush("floor", 5, 5), onFloor])).toEqual([{ x: 5, y: 5, value: BLUE, tile: null, brush: onFloor }]);
        const alone = brush("light", 7, 1, DATA_LAYER, { data: BLUE });
        expect(lights([alone])).toEqual([{ x: 7, y: 1, value: BLUE, tile: null, brush: alone }]);
    });

    it("retunes a torch a light's painted over instead of doubling it, and the light stays the torch's", () => {
        const torch = brush("torch", 2, 2);
        const painted = brush("light", 2, 2, DATA_LAYER, { data: BLUE });
        expect(lights([torch, brush("torch", 3, 2), painted])).toEqual([
            { x: 3, y: 2, value: META.torch.light, tile: expect.objectContaining({ position: { x: 3, y: 2 } }), brush: null },
            { x: 2, y: 2, value: BLUE, tile: torch, brush: painted }
        ]);
    });

    it("belongs to the lit tile on its cell before any other, even one under it", () => {
        const torch = brush("torch", 1, 1, 0);
        const painted = brush("light", 1, 1, DATA_LAYER, { data: BLUE });
        expect(lights([torch, brush("statue", 1, 1, 1), painted])[0].tile).toBe(torch);
    });

    it("belongs to the top tile that isn't floor on a cell with no lit tile - a gem goes with its light", () => {
        const gem = brush("sack_gold", 4, 4, 1);
        const painted = brush("light", 4, 4, DATA_LAYER, { data: BLUE });
        expect(lights([brush("floor", 4, 4, 0), gem, brush("floor", 4, 4, 0), painted])[0].tile).toBe(gem);
        // The later layer's, and on one layer the later brush's.
        const first = brush("statue", 6, 6, 0);
        const second = brush("table", 6, 6, 0);
        expect(lights([first, second, brush("light", 6, 6, DATA_LAYER, { data: BLUE })])[0].tile).toBe(second);
    });

    it("counts one painted light a cell, the last, and leaves out one whose value isn't a whole light", () => {
        const last = brush("light", 1, 1, -2, { data: BLUE });
        expect(lights([brush("light", 1, 1, DATA_LAYER, { data: META.torch.light }), last]).map(l => l.brush)).toEqual([last]);
        expect(lights([brush("light", 1, 1, DATA_LAYER, { data: { range: 4 } }), brush("light", 2, 2, DATA_LAYER, { data: 3 })])).toEqual([]);
    });

    it("leaves out a lit tile painted on a data layer", () => {
        expect(lights([brush("torch", 3, 3, DATA_LAYER)])).toEqual([]);
    });
});

describe("FindSpawners", () => {
    /** Tile layers 0 and up, drawn in that order; anything below is a data layer. */
    /** `spawnerSprite` null for a roster with none. */
    const spawners = (brushes: ImplicitBrush[], spawnerSprite: { width: number; height: number } | null = { width: 32, height: 32 }) =>
        FindSpawners(
            brushes,
            layerId => (layerId >= 0 ? layerId : undefined),
            name => META[name],
            name => SIZES[name] || { width: TILE, height: TILE },
            TILE,
            spawnerSprite || undefined
        );
    const cellsOf = (placement: { cells: { x: number; y: number }[] }) => placement.cells.map(c => `${c.x},${c.y}`).sort();
    const OGRES = { ...SPAWNER_VALUE, monsters: ["ogre"] };

    it("makes a spawner tile a spawner, drawn as itself and as big as its sprite", () => {
        const camp = brush("goblin_camp", 4, 4);
        expect(spawners([brush("floor", 4, 4), camp])).toEqual([{ x: 4, y: 4, value: SPAWNER_VALUE, tile: camp, brush: null, cells: [{ x: 4, y: 4 }] }]);
    });

    it("prefers a placement's own override over its asset's spawner - see EffectiveSpawner", () => {
        const result = spawners([brush("goblin_camp", 4, 4, TILE_LAYER, { data: OGRES })]);
        expect(result.map(s => s.value)).toEqual([OGRES]);
    });

    it("turns the top tile that isn't floor into the spawner a brush makes, with that tile's footprint", () => {
        const statue = brush("statue", 3, 3, 1, { pixelOffset: { x: 0, y: 16 } });
        const marker = brush("spawner", 3, 3, DATA_LAYER, { data: OGRES });
        const [placement] = spawners([brush("floor", 3, 3), statue, brush("floor", 3, 3, 0), marker]);
        expect(placement.tile).toBe(statue);
        expect(placement.brush).toBe(marker);
        expect(placement.value).toBe(OGRES);
        // Nudged up a cell, the 16x32 statue covers its own cell and the one above.
        expect(cellsOf(placement)).toEqual(["3,2", "3,3"]);
    });

    it("picks the tile drawn last - the later layer, and on one layer the later brush", () => {
        const marker = brush("spawner", 1, 1, DATA_LAYER, { data: OGRES });
        const lower = brush("statue", 1, 1, 0);
        const upper = brush("table", 1, 1, 2);
        expect(spawners([upper, lower, marker])[0].tile).toBe(upper);
        const first = brush("statue", 1, 1, 0);
        const second = brush("table", 1, 1, 0);
        expect(spawners([first, second, marker])[0].tile).toBe(second);
    });

    it("keeps a spawner tile the spawner a brush on its cell sets up, even under another tile", () => {
        const camp = brush("goblin_camp", 2, 2, 0);
        const marker = brush("spawner", 2, 2, DATA_LAYER, { data: OGRES });
        const result = spawners([camp, brush("statue", 2, 2, 1), marker]);
        expect(result).toHaveLength(1);
        expect(result[0].tile).toBe(camp);
        expect(result[0].value).toBe(OGRES);
    });

    it("never turns floor into a spawner: on bare floor, or nothing, the roster's sprite stands in", () => {
        const onFloor = spawners([brush("floor", 5, 5), brush("spawner", 5, 5, DATA_LAYER, { data: OGRES })]);
        expect(onFloor[0].tile).toBeNull();
        expect(cellsOf(onFloor[0])).toEqual(["5,5", "5,6", "6,5", "6,6"]);
        const alone = spawners([brush("spawner", 5, 5, DATA_LAYER, { data: OGRES })], null);
        expect(alone[0].tile).toBeNull();
        expect(alone[0].cells).toEqual([{ x: 5, y: 5 }]);
    });

    it("leaves out a spawner brush whose value isn't one, and spawner tiles painted on a data layer", () => {
        expect(spawners([brush("spawner", 1, 1, DATA_LAYER, { data: 3 }), brush("goblin_camp", 2, 2, DATA_LAYER)])).toEqual([]);
    });
});

describe("FindPushables", () => {
    /** Tile layers 0 and up, drawn in that order; anything below is a data layer. */
    const pushables = (brushes: ImplicitBrush[]) =>
        FindPushables(brushes, layerId => (layerId >= 0 ? layerId : undefined), name => META[name], name => SIZES[name], TILE);
    const marker = (x: number, y: number) => brush("pushable", x, y, DATA_LAYER, { data: 0 });

    it("makes the top tile on its cell that isn't floor the thing pushed, as big as its sprite", () => {
        const statue = brush("statue", 3, 3, 1, { pixelOffset: { x: 0, y: 16 } });
        const crate = brush("crate", 3, 3, 1);
        const pushable = marker(3, 3);
        expect(pushables([brush("floor", 3, 3), statue, pushable])).toEqual([{ x: 3, y: 3, tile: statue, brush: pushable, cells: [{ x: 3, y: 2 }, { x: 3, y: 3 }] }]);
        // The later layer, and on one layer the later brush; one with no size of its own is one cell.
        expect(pushables([brush("floor", 3, 3, 2), statue, crate, pushable])[0].tile).toBe(crate);
        expect(pushables([crate, brush("box", 3, 3, 0), pushable])[0]).toMatchObject({ tile: crate, cells: [{ x: 3, y: 3 }] });
    });

    it("pushes nothing on bare floor, or nothing at all", () => {
        expect(pushables([brush("floor", 3, 3), marker(3, 3)])).toEqual([]);
        expect(pushables([marker(3, 3)])).toEqual([]);
    });

    it("leaves a door, a spawner, a pickup or a light where it is - and a tile another brush on its cell makes one", () => {
        ["door", "goblin_camp", "sack_gold", "torch"].forEach(name => expect(pushables([brush(name, 3, 3), marker(3, 3)])).toEqual([]));
        expect(pushables([brush("crate", 3, 3, 0, { data: GOLD_PICKUP }), marker(3, 3)])).toEqual([]);
        ["spawner", "pickup", "dialog", "light"].forEach(name => expect(pushables([brush("crate", 3, 3), brush(name, 3, 3, DATA_LAYER), marker(3, 3)])).toEqual([]));
        // A brush on another cell is its own cell's.
        expect(pushables([brush("crate", 3, 3), brush("spawner", 4, 3, DATA_LAYER), marker(3, 3)])).toHaveLength(1);
    });

    it("keeps to the order the brushes come in, and leaves out one that would overlap one before it", () => {
        // The statue stands a cell tall over the crate's cell.
        const brushes = [brush("crate", 6, 2), brush("statue", 3, 4, TILE_LAYER, { pixelOffset: { x: 0, y: 16 } }), brush("crate", 3, 3), marker(6, 2), marker(3, 4), marker(3, 3)];
        expect(pushables(brushes).map(p => `${p.x},${p.y}`)).toEqual(["6,2", "3,4"]);
    });

    it("leaves tiles on data layers alone", () => {
        expect(pushables([brush("crate", 3, 3, DATA_LAYER), marker(3, 3)])).toEqual([]);
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

    it("never orphans a light or a spawner brush - each is a light or a spawner with or without a tile under it", () => {
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
