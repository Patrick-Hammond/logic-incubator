import { describe, expect, it } from "vitest";
import { IsTileLayer, LevelLayer, TileLayerOrder } from "./LevelFormat";

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
