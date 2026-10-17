/**
 * The level file: what the editor saves (its S export, and the localStorage copy Enter plays) and
 * the engine loads (`Level.LoadLevel`). The engine owns it - the editor is only its writer, and
 * saves more of its own state alongside, which the engine ignores. Types, one enum and two small
 * helpers, so importing it pulls in no other module at runtime.
 */

import type { Vec2Like } from "@logic-incubator/lib/math/Geometry";
import type { QuestDef } from "../story/Quests";
import type { DialogValue } from "../story/Talk";
import type { BossValue } from "./entities/Bosses";
import type { PickupValue } from "./entities/Pickups";
import type { SpawnerValue } from "./entities/Spawners";
import type { DoorLockValue } from "./Doors";
import type { LightValue } from "./Lighting";

/**
 * The data brushes: painted on data layers, and read by the engine rather than drawn. A light or a
 * spawner is no longer among them - both are placed as an ordinary tile brush instead, carrying
 * their value via `AssetMetadata` (a default per asset name) or, per placement, an override in that
 * tile's own `Brush.data` (see `ImplicitData.EffectiveLight`/`EffectiveSpawner`). "light"/"spawner"
 * still identify their kind of value wherever one's edited (see `DataBrushEditors`) - just not as a
 * paintable brush name any more.
 *
 * `PICKUP` turns whatever tile is at its cell into a pickup, for items that aren't one by default
 * (their asset has no `pickup` in `AssetMetadata`); a tile that is one can be edited, via the same
 * popup, in its own `Brush.data` instead (see `ImplicitData.EffectivePickup`). Door locks work the
 * same way, but only as a tile's own value - there's no door data brush.
 *
 * `EXIT` marks a way out: the level is over the moment any hero stands on one (see `World`). It isn't
 * drawn - paint stairs or a ladder there too.
 *
 * `DIALOG`, painted over an NPC's tile, makes that cell solid and gives it a dialog script (see `Talk`,
 * `DialogScript`): a hero walking into it starts the talk, in a game of one hero on one machine.
 *
 * `BOSS` puts one of the roster's monsters there, sleeping until a hero comes near - tougher, if it's given
 * more hit points, and marked for a quest that asks for it to be killed (see `Bosses`).
 */
export const enum DataBrushName {
    PLAYER_START = "player-start",
    COLLISION = "collision",
    Z_INDEX = "z-index",
    PICKUP = "pickup",
    EXIT = "exit",
    DIALOG = "dialog",
    BOSS = "boss"
}

/** A data brush's value - a number (`Z_INDEX`'s height), or a light's, spawner's, pickup's, door lock's, dialog's or boss's settings. */
export type DataBrushValue = number | LightValue | SpawnerValue | PickupValue | DoorLockValue | DialogValue | BossValue;

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

/**
 * What a tile layer is for, in the editor: a `floor` layer takes only `floor` category tiles and a `walls`
 * layer only `walls` ones (see `AssetCategories`); a layer without a kind takes any other tile.
 * The engine draws them all the same.
 */
export type TileLayerKind = "floor" | "walls";

/**
 * A layer, as far as the engine reads one: tile layers draw in list order, data layers (`isData`) hold data brushes and
 * aren't drawn, and the player layer (`isPlayer`) holds nothing - it marks where the heroes, monsters and shots are drawn
 * among the tile layers: those before it under them, those after it over them (see `TileLayerOrder`). `kind` is the
 * editor's (see `TileLayerKind`).
 */
export type LevelLayer = { id: number; name: string; isData: boolean; kind?: TileLayerKind; isPlayer?: boolean };

/** Whether `layer` is a tile layer - one with tiles painted on it, drawn - rather than a data layer or the player layer. */
export function IsTileLayer(layer: LevelLayer): boolean {
    return !layer.isData && !layer.isPlayer;
}

/**
 * A level's tile layers in drawing order, and where the player layer sits among them: the first `playerLayer` are drawn
 * under the heroes, monsters and shots, the rest over them. In a level without a player layer - every level saved before
 * there was one - that's all of them, as it always was. Should a hand-edited file have more than one, the first counts.
 */
export function TileLayerOrder(layers: ReadonlyArray<LevelLayer>): { tileLayers: LevelLayer[]; playerLayer: number } {
    const tileLayers: LevelLayer[] = [];
    let playerLayer = -1;
    layers.forEach(layer => {
        if (layer.isPlayer) {
            if (playerLayer < 0) {
                playerLayer = tileLayers.length;
            }
        } else if (IsTileLayer(layer)) {
            tileLayers.push(layer);
        }
    });
    return { tileLayers, playerLayer: playerLayer < 0 ? tileLayers.length : playerLayer };
}

/**
 * A saved level. The nesting is the editor's - `editorData` is its whole state and `levelData`
 * its level store's - of which the engine reads only what's typed here. `quests` are the level's
 * quests (see `Quests`) - none in a level saved before there were any.
 */
export type LevelFile = {
    editorData: { layers: LevelLayer[] };
    levelData: { levelData: Brush[]; quests?: QuestDef[] };
};
