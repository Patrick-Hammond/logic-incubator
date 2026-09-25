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

describe("LevelDataStore rects", () => {
    beforeAll(() => AssetMetadataStore.inst.Load({ wall: { collidable: true }, floor: {} }));

    // The same 2x2 rect, dragged from each of its corners.
    const DRAGS = [
        { from: { x: 1, y: 1 }, to: { x: 2, y: 2 }, direction: "down-right" },
        { from: { x: 2, y: 2 }, to: { x: 1, y: 1 }, direction: "up-left" },
        { from: { x: 1, y: 2 }, to: { x: 2, y: 1 }, direction: "up-right" },
        { from: { x: 2, y: 1 }, to: { x: 1, y: 2 }, direction: "down-left" }
    ];

    it.each(DRAGS)("paints the same cells dragged $direction", ({ from, to }) => {
        const store = storeWith([]);
        store.Dispatch({
            type: LevelDataActions.PAINT_RECT,
            data: { brush: brush("floor", 0, 0), rectTopLeft: from, rectBottomRight: to, viewOffset: NO_OFFSET },
            canUndo: true
        });
        expect(names(store)).toEqual(["floor@1,1", "floor@1,2", "floor@2,1", "floor@2,2"]);
    });

    it.each(DRAGS)("erases the same cells, and the collision they leave behind, dragged $direction", ({ from, to }) => {
        // A 3x3 block of walls, each with its collision; the rect takes out the bottom-right 2x2 of it.
        const brushes: Brush[] = [];
        const kept: string[] = [];
        for (let x = 0; x <= 2; x++) {
            for (let y = 0; y <= 2; y++) {
                brushes.push(brush("wall", x, y), brush(DataBrushName.COLLISION, x, y, DATA_LAYER.id));
                if (x === 0 || y === 0) {
                    kept.push(`wall@${x},${y}`, `collision@${x},${y}`);
                }
            }
        }
        const store = storeWith(brushes);
        store.Dispatch({
            type: LevelDataActions.ERASE_RECT,
            data: { brush: brush("wall", 0, 0), rectTopLeft: from, rectBottomRight: to, viewOffset: NO_OFFSET, layers: LAYERS },
            canUndo: true
        });
        expect(names(store)).toEqual(kept.sort());
    });

    it("offsets the rect by the view, like a single brush", () => {
        const store = storeWith([]);
        store.Dispatch({
            type: LevelDataActions.PAINT_RECT,
            data: { brush: brush("floor", 0, 0), rectTopLeft: { x: 1, y: 0 }, rectBottomRight: { x: 0, y: 0 }, viewOffset: { x: 10, y: 5 } }
        });
        expect(names(store)).toEqual(["floor@10,5", "floor@11,5"]);
    });
});
