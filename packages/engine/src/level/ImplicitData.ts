/**
 * The data a map gets for free from its tiles' `AssetMetadata` - a wall's
 * collision, a door's footprint, a torch's light, a marker's spawner, a gold
 * sack's pickup - as opposed to what's hand-painted on a data layer. Pure -
 * no pixi - so it runs under the plain node test runner (see
 * ImplicitData.test.ts), same reasoning as Doors.ts.
 *
 * One source of truth for both consumers: `Level.LoadLevel` bakes these
 * into its collision/door/light/spawner/pickup data, and the editor's
 * read-only implicit layer (see `Canvas`) draws exactly the same list, so
 * what the overlay shows is what the game will do. Spawners and lights have
 * a function of their own each, `FindSpawners` and `FindLights`, as a
 * `SPAWNER` or `LIGHT` brush makes one too, and so do the things a hero can
 * push, `FindPushables`, which only a brush makes.
 */

import { Vec2Like } from "@logic-incubator/lib/math/Geometry";
import { AssetMetadata } from "./AssetMetadata";
import { DoorFootprint, EffectiveDoorLock } from "./Doors";
import { IsPickupValue, PickupValue } from "./entities/Pickups";
import { IsSpawnerValue, SpawnerCells, SpawnerPlacements, SpawnerValue } from "./entities/Spawners";
import { DataBrushName } from "./LevelFormat";
import { IsCompleteLightValue, IsLightValue, LightValue } from "./Lighting";

export type ImplicitBrush = { name: string; position: Vec2Like; pixelOffset: Vec2Like; layerId: number; data?: unknown };

export type ImplicitPlacements = {
    /** Every cell of every `collidable` tile's sprite footprint (see `DoorFootprint`). May repeat a cell (several collidable footprints overlapping it). */
    collision: Vec2Like[];
    /** Every cell of the sprite footprint of every tile whose asset sets `blocksLight`, with that value - see `Lighting.LightBlockersFor`. */
    lightBlocks: { x: number; y: number; blocks: boolean }[];
    /** Every cell of every door tile's sprite footprint (see `DoorFootprint`), tagged with that door's `id`. */
    doors: { x: number; y: number; id: number }[];
    /** One per door placement, at its footprint's first cell: the lock id a key has to match to open it (see `EffectiveDoorLock`). */
    doorLocks: { x: number; y: number; lock: number }[];
    /** A tile's effective pickup (its own override, or its asset's default) - see `EffectivePickup`. */
    pickups: { x: number; y: number; value: PickupValue }[];
};

/** A tile's light: its own placement carries an override (set via the data-select tool) if `data` is already a `LightValue`, else its asset's default from `AssetMetadata`, else none. A `LIGHT` brush on its cell takes its place - see `FindLights`. */
export function EffectiveLight(brush: ImplicitBrush, meta: AssetMetadata | undefined): LightValue | undefined {
    return IsLightValue(brush.data) ? brush.data : meta?.light;
}

/** A tile's spawner: its own placement carries an override (see `EffectiveLight`) if `data` is already a `SpawnerValue`, else its asset's default from `AssetMetadata`, else none. */
export function EffectiveSpawner(brush: ImplicitBrush, meta: AssetMetadata | undefined): SpawnerValue | undefined {
    return IsSpawnerValue(brush.data) ? brush.data : meta?.spawner;
}

/** A tile's pickup: its own placement carries an override (see `EffectiveLight`) if `data` is already a `PickupValue`, else its asset's default from `AssetMetadata`, else none. */
export function EffectivePickup(brush: ImplicitBrush, meta: AssetMetadata | undefined): PickupValue | undefined {
    return IsPickupValue(brush.data) ? brush.data : meta?.pickup;
}

/**
 * Positions are returned in the same space as the brushes' own `position`
 * (so possibly negative, for an editor map painted left of/above its origin) -
 * `Level` normalises afterwards, the editor draws them as-is.
 */
export function FindImplicitPlacements(
    brushes: ReadonlyArray<ImplicitBrush>,
    isTileLayer: (layerId: number) => boolean,
    metaFor: (assetName: string) => AssetMetadata | undefined,
    sizeFor: (assetName: string) => { width: number; height: number },
    tileSize: number
): ImplicitPlacements {
    const placements: ImplicitPlacements = { collision: [], lightBlocks: [], doors: [], doorLocks: [], pickups: [] };
    brushes.forEach(brush => {
        if (!isTileLayer(brush.layerId)) {
            return;
        }
        const meta = metaFor(brush.name);
        const { x, y } = brush.position;
        if (meta?.collidable || meta?.door || meta?.blocksLight !== undefined) {
            const footprint = DoorFootprint(brush.position, sizeFor(brush.name), brush.pixelOffset, tileSize);
            if (meta.collidable) {
                footprint.forEach(cell => placements.collision.push(cell));
            }
            const blocks = meta.blocksLight;
            if (blocks !== undefined) {
                footprint.forEach(cell => placements.lightBlocks.push({ x: cell.x, y: cell.y, blocks }));
            }
            if (meta.door) {
                const id = meta.door.id;
                footprint.forEach(cell => placements.doors.push({ x: cell.x, y: cell.y, id }));
                placements.doorLocks.push({ x: footprint[0].x, y: footprint[0].y, lock: EffectiveDoorLock(brush, meta) });
            }
        }
        const pickup = EffectivePickup(brush, meta);
        if (pickup) {
            placements.pickups.push({ x, y, value: pickup });
        }
    });
    return placements;
}

/** A spawner as the level places it (see `FindSpawners`), in the brushes' own space. */
export type SpawnerPlacement<B> = {
    x: number;
    y: number;
    value: SpawnerValue;
    /** The tile it's drawn as in play, and which goes when it's destroyed - null for none, when the roster's `spawnerSprite` stands in. */
    tile: B | null;
    /** The `SPAWNER` brush that sets its value, if one is painted on its cell. */
    brush: B | null;
    /** The cells it makes solid: its tile's footprint (see `SpawnerCells`), or with none the roster sprite's. */
    cells: Vec2Like[];
};

/**
 * Every spawner on the map, one to a cell: each spawner tile's (see `EffectiveSpawner`), and each `SPAWNER` brush's,
 * which decides what a spawner tile on its cell does (see `SpawnerPlacements`). Any sprite can be one: it's drawn as
 * a tile on its cell - a spawner tile if there is one, else the top tile that isn't floor, so a brush makes a
 * gravestone or a statue the spawner but never the floor under it - and is as big as that tile. With no such tile, the
 * roster's `spawnerSprite` stands in (`spawnerSpriteSize`, undefined for an invisible one-cell spawner).
 * `tileLayerOrder` is a tile layer's place in the drawing order (undefined for a data layer): it and the brushes'
 * own order say which tile is on top. What `Level` places, and what the editor's overlay outlines.
 */
export function FindSpawners<B extends ImplicitBrush>(
    brushes: ReadonlyArray<B>,
    tileLayerOrder: (layerId: number) => number | undefined,
    metaFor: (assetName: string) => AssetMetadata | undefined,
    sizeFor: (assetName: string) => { width: number; height: number } | undefined,
    tileSize: number,
    spawnerSpriteSize: { width: number; height: number } | undefined
): SpawnerPlacement<B>[] {
    const cellKey = (x: number, y: number): string => x + "," + y;
    /** cell -> the tiles anchored there, with their place in the drawing order */
    const tilesAt = new Map<string, { tile: B; layer: number; index: number }[]>();
    const fromTiles: { x: number; y: number; value: SpawnerValue; brush: B | null }[] = [];
    const fromBrushes: { x: number; y: number; value: SpawnerValue; brush: B | null }[] = [];
    brushes.forEach((brush, index) => {
        const { x, y } = brush.position;
        const layer = tileLayerOrder(brush.layerId);
        if (layer !== undefined) {
            const key = cellKey(x, y);
            const here = tilesAt.get(key) || [];
            here.push({ tile: brush, layer, index });
            tilesAt.set(key, here);
            const value = EffectiveSpawner(brush, metaFor(brush.name));
            if (value) {
                fromTiles.push({ x, y, value, brush: null });
            }
        } else if (brush.name === DataBrushName.SPAWNER && IsSpawnerValue(brush.data)) {
            fromBrushes.push({ x, y, value: brush.data, brush });
        }
    });
    return SpawnerPlacements(fromTiles, fromBrushes).map(({ x, y, value, brush }) => {
        // Top first: the last layer drawn, and on it the last painted.
        const here = (tilesAt.get(cellKey(x, y)) || []).sort((a, b) => b.layer - a.layer || b.index - a.index).map(entry => entry.tile);
        const tile =
            here.find(t => EffectiveSpawner(t, metaFor(t.name)) !== undefined) ||
            here.find(t => {
                const meta = metaFor(t.name);
                return !meta || meta.category !== "floor";
            }) ||
            null;
        const cells = tile ? SpawnerCells(tile.position, sizeFor(tile.name), tileSize, tile.pixelOffset) : SpawnerCells({ x, y }, spawnerSpriteSize, tileSize);
        return { x, y, value, tile, brush, cells };
    });
}

/** A light as the level places it (see `FindLights`), in the brushes' own space. */
export type LightPlacement<B> = {
    x: number;
    y: number;
    value: LightValue;
    /** The tile it belongs to, which puts it out when it goes - a torch picked up, a spawner destroyed - or null for one that stands on its own. */
    tile: B | null;
    /** The `LIGHT` brush that sets it, if it's a painted one. */
    brush: B | null;
};

/**
 * Every light on the map: each lit tile's own (see `EffectiveLight`), and each `LIGHT` brush's, which puts a light on
 * any cell. A brush takes the place of its cell's tile lights, so it retunes a torch rather than doubling it, and belongs
 * to the top lit tile there; on a cell with no lit tile it belongs to the top tile that isn't floor (as `FindSpawners`
 * picks one), so a light painted on a gem goes when the gem's picked up, and on bare floor it stands on its own. One brush
 * a cell counts - the last painted, should a hand-edited file have more - and one without a whole light value (see
 * `IsCompleteLightValue`) none. `tileLayerOrder` is a tile layer's place in the drawing order, as `FindSpawners` has it.
 * Tile lights come first, in the brushes' order, then the painted ones. What `Level` bakes, and what the editor's overlay marks.
 */
export function FindLights<B extends ImplicitBrush>(
    brushes: ReadonlyArray<B>,
    tileLayerOrder: (layerId: number) => number | undefined,
    metaFor: (assetName: string) => AssetMetadata | undefined
): LightPlacement<B>[] {
    const cellKey = (x: number, y: number): string => x + "," + y;
    /** cell -> the tiles anchored there, with their place in the drawing order */
    const tilesAt = new Map<string, { tile: B; layer: number; index: number }[]>();
    /** cell -> the `LIGHT` brush painted there */
    const painted = new Map<string, B>();
    brushes.forEach((brush, index) => {
        const key = cellKey(brush.position.x, brush.position.y);
        const layer = tileLayerOrder(brush.layerId);
        if (layer !== undefined) {
            const here = tilesAt.get(key) || [];
            here.push({ tile: brush, layer, index });
            tilesAt.set(key, here);
        } else if (brush.name === DataBrushName.LIGHT && IsCompleteLightValue(brush.data)) {
            painted.set(key, brush);
        }
    });

    const lights: LightPlacement<B>[] = [];
    brushes.forEach(brush => {
        const { x, y } = brush.position;
        if (tileLayerOrder(brush.layerId) === undefined || painted.has(cellKey(x, y))) {
            return;
        }
        const value = EffectiveLight(brush, metaFor(brush.name));
        if (value) {
            lights.push({ x, y, value, tile: brush, brush: null });
        }
    });
    painted.forEach((brush, key) => {
        // Top first: the last layer drawn, and on it the last painted.
        const here = (tilesAt.get(key) || []).sort((a, b) => b.layer - a.layer || b.index - a.index).map(entry => entry.tile);
        const tile =
            here.find(t => EffectiveLight(t, metaFor(t.name)) !== undefined) ||
            here.find(t => {
                const meta = metaFor(t.name);
                return !meta || meta.category !== "floor";
            }) ||
            null;
        lights.push({ x: brush.position.x, y: brush.position.y, value: brush.data as LightValue, tile, brush });
    });
    return lights;
}

/** A thing a hero can push, as the level places it (see `FindPushables`), in the brushes' own space. */
export type PushablePlacement<B> = {
    x: number;
    y: number;
    /** The tile that's pushed - drawn as itself, wherever it's been pushed to. */
    tile: B;
    /** The `PUSHABLE` brush that makes it pushable. */
    brush: B;
    /** The cells it makes solid where it starts: its tile's sprite footprint (see `DoorFootprint`). */
    cells: Vec2Like[];
};

/**
 * Everything a hero can push, in the order its `PUSHABLE` brushes come - the same on every machine, as an online run's `pushed`
 * event names one by its place in this list. Each is the top tile on its brush's cell that isn't floor (by `tileLayerOrder`, then
 * the brushes' own order, as `FindSpawners` picks one), as big as its sprite (`sizeFor`; one cell without one). A brush makes
 * nothing pushable - it's left out, and its tile stays put - where there's no such tile; where that tile is something else
 * already, a door, a spawner, a pickup or a light; where a `SPAWNER`, `PICKUP`, `DIALOG` or `LIGHT` brush on its cell makes it
 * one (a light is baked where it starts, so it couldn't go along); or where it would overlap one before it. What `Level` places, and what the editor's overlay outlines.
 */
export function FindPushables<B extends ImplicitBrush>(
    brushes: ReadonlyArray<B>,
    tileLayerOrder: (layerId: number) => number | undefined,
    metaFor: (assetName: string) => AssetMetadata | undefined,
    sizeFor: (assetName: string) => { width: number; height: number } | undefined,
    tileSize: number
): PushablePlacement<B>[] {
    const cellKey = (x: number, y: number): string => x + "," + y;
    /** cell -> the tiles anchored there, with their place in the drawing order */
    const tilesAt = new Map<string, { tile: B; layer: number; index: number }[]>();
    /** The cells with a data brush that makes their tile something else. */
    const claimed = new Set<string>();
    const brushesOf: B[] = [];
    brushes.forEach((brush, index) => {
        const key = cellKey(brush.position.x, brush.position.y);
        const layer = tileLayerOrder(brush.layerId);
        if (layer !== undefined) {
            const here = tilesAt.get(key) || [];
            here.push({ tile: brush, layer, index });
            tilesAt.set(key, here);
        } else if (brush.name === DataBrushName.PUSHABLE) {
            brushesOf.push(brush);
        } else if (brush.name === DataBrushName.SPAWNER || brush.name === DataBrushName.PICKUP || brush.name === DataBrushName.DIALOG ||
            brush.name === DataBrushName.LIGHT) {
            claimed.add(key);
        }
    });
    const taken = new Set<string>();
    const placements: PushablePlacement<B>[] = [];
    brushesOf.forEach(brush => {
        const { x, y } = brush.position;
        if (claimed.has(cellKey(x, y))) {
            return;
        }
        // Top first: the last layer drawn, and on it the last painted.
        const here = (tilesAt.get(cellKey(x, y)) || []).sort((a, b) => b.layer - a.layer || b.index - a.index).map(entry => entry.tile);
        const tile = here.find(t => {
            const meta = metaFor(t.name);
            return !meta || meta.category !== "floor";
        });
        const meta = tile && metaFor(tile.name);
        if (!tile || meta?.door || EffectiveSpawner(tile, meta) || EffectivePickup(tile, meta) || EffectiveLight(tile, meta)) {
            return;
        }
        const cells = DoorFootprint(tile.position, sizeFor(tile.name) || { width: tileSize, height: tileSize }, tile.pixelOffset, tileSize);
        if (cells.some(cell => taken.has(cellKey(cell.x, cell.y)))) {
            return;
        }
        cells.forEach(cell => taken.add(cellKey(cell.x, cell.y)));
        placements.push({ x, y, tile, brush, cells });
    });
    return placements;
}

type TileProperty = "collidable";
const TILE_PROPERTIES: TileProperty[] = ["collidable"];

/** The data brush that can stand in for each property on a tile's cell - just `COLLISION`. A `LIGHT` or `SPAWNER` brush isn't one: it's a light or a spawner with or without a tile under it, so erasing a torch or a spawner tile leaves it be. Doors have none - their footprint only ever comes from the tile. */
const EXPLICIT_COUNTERPART: { [dataBrushName: string]: TileProperty } = {
    [DataBrushName.COLLISION]: "collidable"
};

/**
 * The data brushes in `remaining` that erasing the `erased` tiles leaves with
 * no tile to belong to: a `COLLISION` brush on a cell that just lost its last
 * collidable tile. Erasing a wall already drops its implicit collision (nothing stores it), but
 * a map painted before `collidable` existed also has hand-painted collision
 * under its walls, which would otherwise outlive the wall and keep the cell
 * blocked. Collision on a cell that never had a collidable tile is a deliberate
 * one-off, so erasing, say, a floor tile there leaves it alone.
 */
export function OrphanedExplicitData<T extends ImplicitBrush>(
    erased: ReadonlyArray<ImplicitBrush>,
    remaining: ReadonlyArray<T>,
    isTileLayer: (layerId: number) => boolean,
    metaFor: (assetName: string) => AssetMetadata | undefined
): T[] {
    const cellKey = (brush: ImplicitBrush): string => brush.position.x + "," + brush.position.y;
    const provides = (brush: ImplicitBrush, property: TileProperty): boolean => {
        const meta = isTileLayer(brush.layerId) ? metaFor(brush.name) : undefined;
        return !!(meta && meta[property]);
    };

    /** cell -> properties an erased tile gave it that no remaining tile still does */
    const lost: { [cell: string]: { [property: string]: boolean } } = {};
    erased.forEach(brush => {
        TILE_PROPERTIES.forEach(property => {
            if (provides(brush, property)) {
                const key = cellKey(brush);
                lost[key] = lost[key] || {};
                lost[key][property] = true;
            }
        });
    });
    remaining.forEach(brush => {
        const cell = lost[cellKey(brush)];
        if (cell) {
            TILE_PROPERTIES.forEach(property => {
                if (provides(brush, property)) {
                    cell[property] = false;
                }
            });
        }
    });

    return remaining.filter(brush => {
        const property = EXPLICIT_COUNTERPART[brush.name];
        const cell = lost[cellKey(brush)];
        return property != null && cell != null && cell[property] === true && !isTileLayer(brush.layerId);
    });
}
