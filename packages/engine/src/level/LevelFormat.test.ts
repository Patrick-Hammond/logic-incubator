import { describe, expect, it } from "vitest";
import { Brush, DataBrushName, HEIGHT_LAYER_ID, IsTileLayer, LevelFile, LevelLayer, LevelVersion, LevelVersionOf, MigrateLevelFile, TileLayerOrder } from "./LevelFormat";

const attributes: LevelLayer = { id: -99999, name: "attributes", isData: true };
const player: LevelLayer = { id: -99998, name: "player", isData: false, isPlayer: true };
const floor: LevelLayer = { id: 0, name: "floor", isData: false, kind: "floor" };
const walls: LevelLayer = { id: 1, name: "walls", isData: false, kind: "walls" };
const arches: LevelLayer = { id: 2, name: "arches", isData: false };

const names = (layers: LevelLayer[]) => layers.map(layer => layer.name);

describe("IsTileLayer", () => {
    it("is a layer with tiles on it - not the data layer, nor the player layer", () => {
        expect([attributes, player, floor, walls, arches].map(IsTileLayer)).toEqual([false, false, true, true, true]);
    });
});

describe("TileLayerOrder", () => {
    it("draws every tile layer under the figures in a level without a player layer", () => {
        const order = TileLayerOrder([attributes, floor, walls, arches]);
        expect(names(order.tileLayers)).toEqual(["floor", "walls", "arches"]);
        expect(order.playerLayer).toBe(3);
    });

    it("draws the tile layers before the player layer under the figures, and the rest over them", () => {
        const order = TileLayerOrder([attributes, floor, player, walls, arches]);
        expect(names(order.tileLayers)).toEqual(["floor", "walls", "arches"]);
        expect(order.playerLayer).toBe(1);
    });

    it("counts only tile layers, wherever the data layer is", () => {
        expect(TileLayerOrder([floor, attributes, walls, player, arches]).playerLayer).toBe(2);
        expect(TileLayerOrder([floor, walls, arches, player, attributes]).playerLayer).toBe(3);
    });

    it("can have every tile layer over the figures, or none at all", () => {
        expect(TileLayerOrder([player, floor, walls]).playerLayer).toBe(0);
        expect(TileLayerOrder([attributes, player])).toEqual({ tileLayers: [], playerLayer: 0 });
        expect(TileLayerOrder([])).toEqual({ tileLayers: [], playerLayer: 0 });
    });

    it("goes by the first player layer of a file that has more than one", () => {
        const second = { ...player, id: -1 };
        expect(TileLayerOrder([floor, player, walls, second, arches]).playerLayer).toBe(1);
    });
});

function brush(name: string, x: number, y: number, layerId: number, data: Brush["data"] = null): Brush {
    return { name, position: { x, y }, pixelOffset: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 }, layerId, data };
}

/** A version 1 level: no `version`, its heights painted on "attributes" alongside the other data brushes. */
function versionOne(levelData: Brush[], layers: LevelLayer[] = [attributes, floor, walls, player]): LevelFile {
    return { editorData: { layers }, levelData: { levelData, quests: [] } };
}

describe("MigrateLevelFile", () => {
    it("reads a file without a version as version 1, and leaves a current one as it is", () => {
        expect(LevelVersionOf(versionOne([]))).toBe(1);
        const current: LevelFile = { version: LevelVersion, editorData: { layers: [attributes] }, levelData: { levelData: [] } };
        expect(MigrateLevelFile(current)).toBe(current);
    });

    it("moves version 1's heights onto the height layer, added after attributes, and stamps the file version 2", () => {
        const file = versionOne([
            brush("floor_1", 1, 1, floor.id),
            brush(DataBrushName.Z_INDEX, 1, 1, attributes.id, 2),
            brush(DataBrushName.COLLISION, 2, 1, attributes.id),
            brush(DataBrushName.Z_INDEX, 2, 1, attributes.id, -1)
        ]);
        const migrated = MigrateLevelFile(file);
        expect(migrated.version).toBe(2);
        expect(migrated.editorData.layers.map(layer => layer.id)).toEqual([attributes.id, HEIGHT_LAYER_ID, floor.id, walls.id, player.id]);
        expect(migrated.editorData.layers[1]).toEqual({ id: HEIGHT_LAYER_ID, name: "height", isData: true, isHeight: true });
        const placed = migrated.levelData.levelData.map(b => `${b.name}@${b.position.x},${b.position.y}:${b.layerId}=${b.data}`);
        expect(placed).toEqual([
            `floor_1@1,1:${floor.id}=null`,
            `collision@2,1:${attributes.id}=null`,
            `z-index@1,1:${HEIGHT_LAYER_ID}=2`,
            `z-index@2,1:${HEIGHT_LAYER_ID}=-1`
        ]);
        // The file it came from is untouched.
        expect(file.version).toBeUndefined();
        expect(file.levelData.levelData).toHaveLength(4);
    });

    it("keeps the last height painted on a cell, as the engine read it, and drops heights of 0", () => {
        const migrated = MigrateLevelFile(
            versionOne([
                brush(DataBrushName.Z_INDEX, 0, 0, attributes.id, 1),
                brush(DataBrushName.Z_INDEX, 0, 0, attributes.id, 3),
                brush(DataBrushName.Z_INDEX, 1, 0, attributes.id, 0)
            ])
        );
        expect(migrated.levelData.levelData.map(b => b.data)).toEqual([3]);
    });

    it("takes heights from any layer that isn't a tile layer - an old extra data layer, or none listed at all", () => {
        const old: LevelLayer = { id: -1, name: "data layer -1", isData: true };
        const migrated = MigrateLevelFile(
            versionOne([brush(DataBrushName.Z_INDEX, 0, 0, old.id, 1), brush(DataBrushName.Z_INDEX, 1, 0, 999, 2)], [floor, old])
        );
        expect(migrated.editorData.layers.map(layer => layer.id)).toEqual([floor.id, old.id, HEIGHT_LAYER_ID]);
        expect(migrated.levelData.levelData.every(b => b.layerId === HEIGHT_LAYER_ID)).toBe(true);
    });

    it("puts the height layer first in a level without a data layer", () => {
        expect(MigrateLevelFile(versionOne([], [floor, player])).editorData.layers.map(layer => layer.id)).toEqual([HEIGHT_LAYER_ID, floor.id, player.id]);
    });

    it("refuses a version older than the one before, and one newer than it knows", () => {
        const older: LevelFile = { version: 0, editorData: { layers: [] }, levelData: { levelData: [] } };
        const newer: LevelFile = { version: LevelVersion + 1, editorData: { layers: [] }, levelData: { levelData: [] } };
        expect(() => MigrateLevelFile(older)).toThrow(/too old/);
        expect(() => MigrateLevelFile(newer)).toThrow(/newer/);
    });

    it("leaves the migrated file's tile layers drawing as they did", () => {
        const migrated = MigrateLevelFile(versionOne([]));
        expect(TileLayerOrder(migrated.editorData.layers)).toEqual(TileLayerOrder(versionOne([]).editorData.layers));
    });
});
