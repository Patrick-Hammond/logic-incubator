/**
 * The data a map gets for free from its tiles' `AssetMetadata` - a wall's
 * collision, a door's footprint, a torch's light - as opposed to what's
 * hand-painted on a data layer. Pure - no pixi - so it runs under the plain
 * node test runner (see ImplicitData.test.ts), same reasoning as Doors.ts.
 *
 * One source of truth for both consumers: `Level.LoadEditorData` bakes these
 * into its collision/door/light grids, and the editor's read-only implicit
 * layer (see `Canvas`) draws exactly the same list, so what the overlay shows
 * is what the game will do.
 */

import { Vec2Like } from "../../../_lib/math/Geometry";
import { DataBrushName, DataBrushValue } from "../../editor/stores/EditorStore";
import { AssetMetadata } from "./AssetMetadata";
import { DoorFootprint } from "./Doors";
import { IsLightValue, LightValue } from "./Lighting";

export type ImplicitBrush = { name: string; position: Vec2Like; pixelOffset: Vec2Like; layerId: number; data?: DataBrushValue | null };

export type ImplicitPlacements = {
    /** Cells under a `collidable` tile. May repeat a cell (several collidable tiles stacked on it). */
    collision: Vec2Like[];
    /** Every cell of every door tile's sprite footprint (see `DoorFootprint`), tagged with that door's `id`. */
    doors: { x: number; y: number; id: number }[];
    /** A tile's intrinsic light - skipped where an explicit `LIGHT` data brush sits on the same cell, which takes precedence rather than doubling up. */
    lights: { x: number; y: number; value: LightValue }[];
};

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
    const explicitLightCells = new Set<string>();
    brushes.forEach(brush => {
        if (!isTileLayer(brush.layerId) && brush.name === DataBrushName.LIGHT && IsLightValue(brush.data)) {
            explicitLightCells.add(brush.position.x + "," + brush.position.y);
        }
    });

    const placements: ImplicitPlacements = { collision: [], doors: [], lights: [] };
    brushes.forEach(brush => {
        if (!isTileLayer(brush.layerId)) {
            return;
        }
        const meta = metaFor(brush.name);
        if (!meta) {
            return;
        }
        const { x, y } = brush.position;
        if (meta.collidable) {
            placements.collision.push({ x, y });
        }
        if (meta.door) {
            const id = meta.door.id;
            DoorFootprint(brush.position, sizeFor(brush.name), brush.pixelOffset, tileSize).forEach(cell =>
                placements.doors.push({ x: cell.x, y: cell.y, id })
            );
        }
        if (meta.light && !explicitLightCells.has(x + "," + y)) {
            placements.lights.push({ x, y, value: meta.light });
        }
    });
    return placements;
}

type TileProperty = "collidable" | "light";
const TILE_PROPERTIES: TileProperty[] = ["collidable", "light"];

/** The data brush that can stand in for (collision) or override (light) each property on a tile's cell. Doors have none - their footprint only ever comes from the tile. */
const EXPLICIT_COUNTERPART: { [dataBrushName: string]: TileProperty } = {
    [DataBrushName.COLLISION]: "collidable",
    [DataBrushName.LIGHT]: "light"
};

/**
 * The data brushes in `remaining` that erasing the `erased` tiles leaves with
 * no tile to belong to: a `COLLISION` brush on a cell that just lost its last
 * collidable tile, a `LIGHT` brush on one that just lost its last lit tile.
 * Erasing a wall already drops its implicit collision (nothing stores it), but
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
