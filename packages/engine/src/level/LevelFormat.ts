/**
 * The level file: what the editor saves (its S export, and the localStorage copy Enter plays) and
 * the engine loads (`Level.LoadLevel`). The engine owns it - the editor is only its writer, and
 * saves more of its own state alongside, which the engine ignores. Types, one enum, a few small
 * helpers and the migration from the version before (`MigrateLevelFile`), so importing it pulls in
 * no other module at runtime.
 */

import type { Vec2Like } from "@logic-incubator/lib/math/Geometry";
import type { QuestDef } from "../story/Quests";
import type { DialogValue } from "../story/Talk";
import type { BossValue } from "./entities/Bosses";
import type { PickupValue } from "./entities/Pickups";
import type { SpawnerValue } from "./entities/Spawners";
import type { DoorLockValue } from "./Doors";
import type { LightValue } from "./Lighting";
import type { TeleportValue } from "./Portals";

/**
 * The data brushes: painted on data layers, and read by the engine rather than drawn.
 *
 * `LIGHT` puts a point light on its cell, with or without a tile there that gives one. A lit tile - a
 * torch - has a light of its own already (its asset's `AssetMetadata`, or an override in that tile's own
 * `Brush.data`, see `ImplicitData.EffectiveLight`); a `LIGHT` brush on its cell takes the place of that
 * light, so it retunes the torch rather than doubling it. It goes out with the tile it's on - the lit one,
 * or else the top one that isn't floor, a pickup taken or a spawner destroyed - and on bare floor it's a
 * light on its own (see `ImplicitData.FindLights`).
 *
 * `SPAWNER` puts a monster spawner on its cell: the same as painting a spawner tile (one whose asset
 * has a `spawner` in `AssetMetadata`, see `ImplicitData.EffectiveSpawner`), but with its settings in
 * the brush, where the editor shows them. Like `PICKUP`, it makes the tile on its cell the spawner -
 * the top one that isn't floor, drawn as itself and gone when it's destroyed - and on bare floor it's
 * drawn as the roster's `spawnerSprite`. Painted over a spawner tile, the brush's settings are that
 * spawner's (see `ImplicitData.FindSpawners`).
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
 *
 * `TELEPORT` makes its cell a portal, with a portal id: a hero who walks onto it comes out of another portal with the same id
 * (see `Portals`). Like `EXIT`, it isn't drawn - paint something there for the players to see.
 *
 * `PUSHABLE`, painted over an object - a crate, a statue - lets a hero push it: it makes the top tile on its cell that isn't
 * floor the thing pushed, as `SPAWNER` picks its tile, solid over its sprite's footprint wherever it is, and a hero walking into
 * it moves it on a cell if there's room (see `Pushables`, `ImplicitData.FindPushables`). It has no value of its own.
 */
export const enum DataBrushName {
    PLAYER_START = "player-start",
    COLLISION = "collision",
    Z_INDEX = "z-index",
    PICKUP = "pickup",
    EXIT = "exit",
    DIALOG = "dialog",
    BOSS = "boss",
    SPAWNER = "spawner",
    LIGHT = "light",
    TELEPORT = "teleport",
    PUSHABLE = "pushable"
}

/**
 * The level file's `version`. Version 2 put every height (`Z_INDEX`) on a layer of its own, the height layer (`HEIGHT_LAYER_ID`),
 * at most one a cell and none for 0, and lets any other data layer hold several data brushes on a cell - one of each name. A file
 * without a `version` is version 1, from before. Only the version just before this one is brought up to date as a file is opened
 * (see `MigrateLevelFile`): anything older, or newer than this code, is refused.
 */
export const LevelVersion = 2;

/**
 * Fixed id of the height layer (`isHeight`): the data layer the cells' heights are painted on, as `Z_INDEX` brushes - one a cell at
 * most, and none where it's 0, the height of anything unpainted. Its id and flag are the format's, so a level file says which layer it
 * is without knowing the editor; the engine reads a `Z_INDEX` from any data layer, as it always has.
 */
export const HEIGHT_LAYER_ID = -99997;

/** A data brush's value - a number (`Z_INDEX`'s height), or a light's, spawner's, pickup's, door lock's, dialog's, boss's or portal's settings. */
export type DataBrushValue = number | LightValue | SpawnerValue | PickupValue | DoorLockValue | DialogValue | BossValue | TeleportValue;

/**
 * One placed tile or data brush. `position` is in map cells; `layerId` is its layer's `id`; `data` is null on a tile. A tile layer has
 * one tile a cell; a data layer one of each data brush name a cell, so a cell can be both solid and an NPC's, say.
 */
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
 * among the tile layers: those before it under them, those after it over them (see `TileLayerOrder`). The height layer
 * (`isHeight`, always a data layer too) holds the heights (see `HEIGHT_LAYER_ID`). `kind` is the editor's (see `TileLayerKind`).
 */
export type LevelLayer = { id: number; name: string; isData: boolean; kind?: TileLayerKind; isPlayer?: boolean; isHeight?: boolean };

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
 * quests (see `Quests`) - none in a level saved before there were any. `version` is `LevelVersion`
 * as it was when the file was saved - left out, 1.
 */
export type LevelFile = {
    version?: number;
    editorData: { layers: LevelLayer[] };
    levelData: { levelData: Brush[]; quests?: QuestDef[] };
};

/** The version a level file was saved as: its `version`, or 1 for a file from before there was one. */
export function LevelVersionOf(file: LevelFile): number {
    return file.version == null ? 1 : file.version;
}

/**
 * `file` as this version of the format has it: the same file if it's already `LevelVersion`, or a copy brought up from the
 * version just before (see `LevelVersion`). Throws, saying why, for a file older than that or newer than this code knows -
 * only the one step is kept, so each version's migration can be dropped with the next.
 */
export function MigrateLevelFile<T extends LevelFile>(file: T): T {
    const version = LevelVersionOf(file);
    if (version === LevelVersion) {
        return file;
    }
    if (version === LevelVersion - 1) {
        return MigrateFrom1(file);
    }
    throw new Error(
        version > LevelVersion
            ? `This level was saved as version ${version}, which is newer than this game reads (version ${LevelVersion}).`
            : `This level was saved as version ${version}, which is too old to open: only version ${LevelVersion - 1} levels are brought up to date (to version ${LevelVersion}).`
    );
}

/**
 * Version 1 to 2: every height moves to the height layer, which is added to the layers (after the first data layer - "attributes",
 * in any level the editor saved - or first). Where a cell had more than one, the last is kept, as the engine read it; a height of 0,
 * the same as none, is dropped. Every other brush is left as it was.
 */
function MigrateFrom1<T extends LevelFile>(file: T): T {
    const layers = file.editorData.layers;
    const tileLayerIds = layers.filter(IsTileLayer).map(layer => layer.id);
    const heights: { [cell: string]: Brush } = {};
    const cells: string[] = [];
    const rest = file.levelData.levelData.filter(brush => {
        if (brush.name !== DataBrushName.Z_INDEX || tileLayerIds.indexOf(brush.layerId) > -1) {
            return true;
        }
        const cell = brush.position.x + "," + brush.position.y;
        if (!(cell in heights)) {
            cells.push(cell);
        }
        heights[cell] = brush;
        return false;
    });
    const moved = cells
        .map(cell => heights[cell])
        .filter(brush => typeof brush.data === "number" && brush.data !== 0)
        .map(brush => ({ ...brush, layerId: HEIGHT_LAYER_ID }));

    let withHeight = layers.filter(layer => layer.id !== HEIGHT_LAYER_ID);
    const heightLayer: LevelLayer = { id: HEIGHT_LAYER_ID, name: "height", isData: true, isHeight: true };
    const firstData = withHeight.findIndex(layer => layer.isData);
    withHeight = withHeight.slice(0, firstData + 1).concat(heightLayer, withHeight.slice(firstData + 1));

    return {
        ...file,
        version: 2,
        editorData: { ...file.editorData, layers: withHeight },
        levelData: { ...file.levelData, levelData: rest.concat(moved) }
    };
}
