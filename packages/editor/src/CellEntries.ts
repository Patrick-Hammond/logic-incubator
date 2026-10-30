/**
 * Everything on one cell of the map that the cell inspector lists (see `CellInspector`): the data brushes painted
 * there, each tile's own light, spawner, pickup or door lock where its sprite covers the cell, and the cell's height.
 * Pure - no pixi - so it runs under the plain node test runner (see CellEntries.test.ts); the footprints, which need
 * the sprites' sizes, are looked up by whoever asks.
 */

import { Vec2Like } from "@logic-incubator/lib/math/Geometry";
import { AssetMetadata } from "@logic-incubator/engine/level/AssetMetadata";
import { EffectiveDoorLock } from "@logic-incubator/engine/level/Doors";
import { EffectiveLight, EffectivePickup, EffectiveSpawner } from "@logic-incubator/engine/level/ImplicitData";
import { Brush, DataBrushName, DataBrushValue, HEIGHT_LAYER_ID, IsTileLayer, LevelLayer } from "@logic-incubator/engine/level/LevelFormat";
import { IsCompleteLightValue } from "@logic-incubator/engine/level/Lighting";
import { FootprintReach } from "./tools/ToolGeometry";

/** What a tile can carry of its own, rather than as a data brush - what `OpenDataBrushDialog` calls each one's editor. */
export type TileValueKind = "light" | "spawner" | "pickup" | "door";

/**
 * One thing on a cell: a data brush painted on a data layer (`target` is it), a tile's own value (`target` is the
 * tile, which `SET_DATA` writes an edit onto, and `kind` says which value - `replaced` for a light a `LIGHT` brush on
 * the tile's own cell takes the place of, see `FindLights`), or the cell's height (`target` is its brush on the height
 * layer, or null where it's unpainted - 0).
 */
export type CellEntry =
    | { type: "data"; target: Brush }
    | { type: "tile"; target: Brush; kind: TileValueKind; value: DataBrushValue; replaced?: boolean }
    | { type: "height"; target: Brush | null; height: number };

/** What `CellEntriesAt` needs from the art: each brush's footprint, and each tile's metadata. */
export type CellLookups = {
    /** The cells a data brush stands for in play - a spawner's whole footprint, any other's own cell. */
    dataFootprint: (brush: Brush) => ReadonlyArray<Vec2Like>;
    /** The cells a tile's sprite covers. */
    tileFootprint: (brush: Brush) => ReadonlyArray<Vec2Like>;
    metaFor: (name: string) => AssetMetadata | undefined;
};

/**
 * `brush`'s own light, spawner, pickup or door lock - its own override, or its asset's default (see `EffectiveLight` and the
 * rest) - tagged with which kind it is. A tile with more than one gets the first in that order; a door's value is the lock.
 */
export function TileValueOf(brush: Brush, meta: AssetMetadata | undefined): { kind: TileValueKind; value: DataBrushValue } | undefined {
    const light = EffectiveLight(brush, meta);
    if (light) {
        return { kind: "light", value: light };
    }
    const spawner = EffectiveSpawner(brush, meta);
    if (spawner) {
        return { kind: "spawner", value: spawner };
    }
    const pickup = EffectivePickup(brush, meta);
    if (pickup) {
        return { kind: "pickup", value: pickup };
    }
    const lock = EffectiveDoorLock(brush, meta);
    return lock !== undefined ? { kind: "door", value: { lock } } : undefined;
}

/**
 * Everything on `cell`, on any layer whether it's shown or not: first the data brushes covering it (in the order they
 * were painted), then the tiles' own values (the tile drawn on top first), then always its height, last. Brushes
 * anchored further than `FootprintReach` away are passed over without working out their footprints.
 */
export function CellEntriesAt(levelData: ReadonlyArray<Brush>, layers: ReadonlyArray<LevelLayer>, cell: Vec2Like, lookups: CellLookups): CellEntry[] {
    const tileOrder = new Map<number, number>();
    const dataLayers = new Set<number>();
    layers.forEach(layer => {
        if (IsTileLayer(layer)) {
            tileOrder.set(layer.id, tileOrder.size);
        } else if (layer.isData && layer.id !== HEIGHT_LAYER_ID) {
            dataLayers.add(layer.id);
        }
    });
    const covers = (cells: ReadonlyArray<Vec2Like>) => cells.some(c => c.x === cell.x && c.y === cell.y);
    const near = (brush: Brush) => Math.abs(brush.position.x - cell.x) <= FootprintReach && Math.abs(brush.position.y - cell.y) <= FootprintReach;

    const data: CellEntry[] = [];
    const tiles: { entry: CellEntry; order: number; index: number }[] = [];
    /** The cells with a light painted on them, which takes the place of the lights of the tiles anchored there. */
    const painted = new Set<string>();
    let height: CellEntry = { type: "height", target: null, height: 0 };
    levelData.forEach((brush, index) => {
        if (brush.layerId === HEIGHT_LAYER_ID) {
            if (brush.position.x === cell.x && brush.position.y === cell.y && typeof brush.data === "number") {
                height = { type: "height", target: brush, height: brush.data };
            }
        } else if (dataLayers.has(brush.layerId)) {
            if (brush.name === DataBrushName.LIGHT && IsCompleteLightValue(brush.data)) {
                painted.add(brush.position.x + "," + brush.position.y);
            }
            if (near(brush) && covers(lookups.dataFootprint(brush))) {
                data.push({ type: "data", target: brush });
            }
        } else if (tileOrder.has(brush.layerId) && near(brush)) {
            const own = TileValueOf(brush, lookups.metaFor(brush.name));
            if (own && covers(lookups.tileFootprint(brush))) {
                tiles.push({ entry: { type: "tile", target: brush, kind: own.kind, value: own.value }, order: tileOrder.get(brush.layerId), index });
            }
        }
    });
    tiles.forEach(({ entry }) => {
        if (entry.type === "tile" && entry.kind === "light" && painted.has(entry.target.position.x + "," + entry.target.position.y)) {
            entry.replaced = true;
        }
    });
    // On top first: a later layer, or later on the same one.
    tiles.sort((a, b) => b.order - a.order || b.index - a.index);
    return data.concat(tiles.map(tile => tile.entry), [height]);
}

/** What an entry is, in a word or two: a data brush's name, a tile's kind of value ("light"), or "height 2". */
export function EntryName(entry: CellEntry): string {
    switch (entry.type) {
        case "data":
            return entry.target.name;
        case "tile":
            return entry.kind;
        default:
            return "height " + entry.height;
    }
}

/** A cell's entries in one line, for the label beside the cursor - "collision · dialog · light · height 2" - leaving out a height of 0, and a tile's light a painted one replaces. Empty for an empty cell. */
export function SummariseCell(entries: ReadonlyArray<CellEntry>): string {
    return entries
        .filter(entry => (entry.type !== "height" || entry.height !== 0) && (entry.type !== "tile" || !entry.replaced))
        .map(EntryName)
        .join(" · ");
}
