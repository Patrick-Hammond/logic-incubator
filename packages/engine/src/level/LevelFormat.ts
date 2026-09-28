/**
 * The level file: what the editor saves (its S export, and the localStorage copy Enter plays) and
 * the engine loads (`Level.LoadLevel`). The engine owns it - the editor is only its writer, and
 * saves more of its own state alongside, which the engine ignores. Types plus one enum, so
 * importing it pulls in no other module at runtime.
 */

import type { Vec2Like } from "@logic-incubator/lib/math/Geometry";
import type { SpawnerValue } from "./entities/Spawners";
import type { LightValue } from "./Lighting";

/**
 * The data brushes: painted on data layers, and read by the engine rather than drawn. A light or a
 * spawner is no longer among them - both are placed as an ordinary tile brush instead, carrying
 * their value via `AssetMetadata` (a default per asset name) or, per placement, an override in that
 * tile's own `Brush.data` (see `ImplicitData.EffectiveLight`/`EffectiveSpawner`). "light"/"spawner"
 * still identify their kind of value wherever one's edited (see `DataBrushEditors`) - just not as a
 * paintable brush name any more.
 */
export const enum DataBrushName {
    PLAYER_START = "player-start",
    COLLISION = "collision",
    Z_INDEX = "z-index"
}

/** A data brush's value - a number (`Z_INDEX`'s height), or a light's or spawner's settings. */
export type DataBrushValue = number | LightValue | SpawnerValue;

/** One placed tile or data brush. `position` is in map cells; `layerId` is its layer's `id`; `data` is null on a tile. */
export type Brush = {
    name: string;
    position: Vec2Like;
    pixelOffset: Vec2Like;
    rotation: number;
    scale: Vec2Like;
    layerId: number;
    data: DataBrushValue;
};

/** A layer, as far as the engine reads one: tile layers draw in list order, data layers (`isData`) hold data brushes and aren't drawn. */
export type LevelLayer = { id: number; name: string; isData: boolean };

/**
 * A saved level. The nesting is the editor's - `editorData` is its whole state and `levelData`
 * its level store's - of which the engine reads only what's typed here.
 */
export type LevelFile = {
    editorData: { layers: LevelLayer[] };
    levelData: { levelData: Brush[] };
};
