import { beforeAll, describe, expect, it } from "vitest";
import AssetMetadataStore from "../../game/level/AssetMetadata";
import { DataBrushName } from "./EditorStore";
import LevelDataStore, { Brush, Layer, LevelDataActions } from "./LevelDataStore";

const TILE_LAYER: Layer = { id: 0, name: "layer 0", selected: true, visible: true, isData: false };
const DATA_LAYER: Layer = { id: -1, name: "data layer -1", selected: false, visible: true, isData: true };
const LAYERS = [TILE_LAYER, DATA_LAYER];
const NO_OFFSET = { x: 0, y: 0 };

function brush(name: string, x: number, y: number, layerId = TILE_LAYER.id): Brush {
    return { name, position: { x, y }, pixelOffset: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 }, layerId, data: null };
}

function storeWith(brushes: Brush[]): LevelDataStore {
    const store = new LevelDataStore(20);
    store.Load({ levelData: brushes });
    return store;
}

const names = (store: LevelDataStore) => store.state.levelData.map(b => `${b.name}@${b.position.x},${b.position.y}`).sort();

describe("LevelDataStore erasing", () => {
    beforeAll(() => AssetMetadataStore.inst.Load({ wall: { collidable: true }, floor: {} }));

    it("erasing a collidable tile also erases the collision painted under it", () => {
        const store = storeWith([brush("wall", 1, 1), brush(DataBrushName.COLLISION, 1, 1, DATA_LAYER.id), brush(DataBrushName.COLLISION, 2, 1, DATA_LAYER.id)]);
        store.Dispatch({ type: LevelDataActions.ERASE, data: { brush: brush("wall", 1, 1), viewOffset: NO_OFFSET, layers: LAYERS }, canUndo: true });
        expect(names(store)).toEqual(["collision@2,1"]);
    });

    it("does the same across a rect erase", () => {
        const store = storeWith([
            brush("wall", 0, 0),
            brush("floor", 1, 0),
            brush(DataBrushName.COLLISION, 0, 0, DATA_LAYER.id),
            brush(DataBrushName.COLLISION, 1, 0, DATA_LAYER.id)
        ]);
        store.Dispatch({
            type: LevelDataActions.ERASE_RECT,
            data: { brush: brush("wall", 0, 0), rectTopLeft: { x: 0, y: 0 }, rectBottomRight: { x: 1, y: 0 }, viewOffset: NO_OFFSET, layers: LAYERS },
            canUndo: true
        });
        // The floor's cell keeps its hand-painted collision - it was never the floor's.
        expect(names(store)).toEqual(["collision@1,0"]);
    });

    it("brings the tile and its data back in one undo", () => {
        const before = [brush("wall", 1, 1), brush(DataBrushName.COLLISION, 1, 1, DATA_LAYER.id)];
        const store = storeWith(before);
        store.Dispatch({ type: LevelDataActions.ERASE, data: { brush: brush("wall", 1, 1), viewOffset: NO_OFFSET, layers: LAYERS }, canUndo: true });
        store.Undo();
        expect(store.state.levelData).toEqual(before);
    });

    it("erasing on a data layer removes only the brush it hits", () => {
        const store = storeWith([brush("wall", 1, 1), brush(DataBrushName.COLLISION, 1, 1, DATA_LAYER.id)]);
        store.Dispatch({ type: LevelDataActions.ERASE, data: { brush: brush(DataBrushName.COLLISION, 1, 1, DATA_LAYER.id), viewOffset: NO_OFFSET, layers: LAYERS } });
        expect(names(store)).toEqual(["wall@1,1"]);
    });
});

describe("LevelDataStore stamp/fill and placed data", () => {
    it("PAINT_CELLS paints every cell as one undo step, replacing what's there on that layer only", () => {
        const store = storeWith([brush("wall", 0, 0), brush("floor", 5, 5), brush(DataBrushName.COLLISION, 0, 0, DATA_LAYER.id)]);
        store.Dispatch({
            type: LevelDataActions.PAINT_CELLS,
            data: { brush: brush("floor", 99, 99), cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }] },
            canUndo: true
        });
        expect(names(store)).toEqual(["collision@0,0", "floor@0,0", "floor@1,0", "floor@5,5"]);
        store.Undo();
        expect(names(store)).toEqual(["collision@0,0", "floor@5,5", "wall@0,0"]);
    });

    it("SET_DATA changes just the one placed brush's value", () => {
        const light = { ...brush(DataBrushName.LIGHT, 2, 2, DATA_LAYER.id), data: { brightness: 0.5, tint: 0xffffff, range: 5 } };
        const other = { ...light, position: { x: 3, y: 3 } };
        const store = storeWith([light, other]);
        const value = { brightness: 1, tint: 0xff0000, range: 9 };
        store.Dispatch({ type: LevelDataActions.SET_DATA, data: { target: light, value }, canUndo: true });
        expect(store.state.levelData.map(b => b.data)).toEqual([value, other.data]);

        // A brush that's no longer placed (e.g. erased meanwhile) is a no-op.
        const before = store.state.levelData;
        store.Dispatch({ type: LevelDataActions.SET_DATA, data: { target: light, value } });
        expect(store.state.levelData).toBe(before);
    });
});
