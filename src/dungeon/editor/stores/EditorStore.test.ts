import { describe, expect, it } from "vitest";
import { Scenes } from "../../Constants";
import { DEFAULT_SPAWNER_VALUE } from "../../game/level/entities/Spawners";
import EditorStore, { DataBrushName, EditableLayerCount, EditorActions, IMPLICIT_LAYER_ID, MouseButtonState } from "./EditorStore";

function implicitLayers(store: EditorStore) {
    return store.state.layers.filter(layer => layer.id === IMPLICIT_LAYER_ID);
}

describe("EditorStore implicit layer", () => {
    it("is present from the start, read-only, and not counted as editable", () => {
        const store = new EditorStore();
        expect(implicitLayers(store)).toHaveLength(1);
        expect(implicitLayers(store)[0].readOnly).toBe(true);
        expect(implicitLayers(store)[0].isData).toBe(true);
        expect(EditableLayerCount(store.state.layers)).toBe(0);
    });

    it("is added to a loaded map that was saved without it, exactly once", () => {
        const store = new EditorStore();
        const saved = { ...store.state, layers: [{ id: 0, name: "layer 0", selected: true, visible: true, isData: false }] };
        store.Load(saved);
        expect(implicitLayers(store)).toHaveLength(1);
        expect(store.state.layers).toHaveLength(2);

        // Re-loading state that already has it doesn't add a second.
        store.Load(store.state);
        expect(implicitLayers(store)).toHaveLength(1);
    });

    it("keeps the same layers array on unrelated actions (no spurious layer re-renders)", () => {
        const store = new EditorStore();
        const before = store.state.layers;
        store.Dispatch({ type: EditorActions.ZOOM_IN });
        expect(store.state.layers).toBe(before);
    });

    it("comes back after being removed, and after a reset", () => {
        const store = new EditorStore();
        store.Dispatch({ type: EditorActions.SELECT_LAYER, data: { layer: implicitLayers(store)[0] } });
        store.Dispatch({ type: EditorActions.REMOVE_LAYER });
        expect(implicitLayers(store)).toHaveLength(1);
        store.Dispatch({ type: EditorActions.RESET, data: {} });
        expect(implicitLayers(store)).toHaveLength(1);
    });

    it("can't be duplicated or renamed", () => {
        const store = new EditorStore();
        store.Dispatch({ type: EditorActions.SELECT_LAYER, data: { layer: implicitLayers(store)[0] } });
        const before = store.state.layers;
        store.Dispatch({ type: EditorActions.DUPLICATE_LAYER });
        store.Dispatch({ type: EditorActions.RENAME_LAYER });
        expect(store.state.layers).toBe(before);
    });

    it("doesn't affect the id the next data layer gets", () => {
        const store = new EditorStore();
        store.Dispatch({ type: EditorActions.ADD_DATA_LAYER });
        expect(store.state.layers.find(layer => layer.isData && !layer.readOnly).id).toBe(-1);
    });
});

describe("EditorStore layer rename", () => {
    it("renames the selected layer to the name it's given", () => {
        const store = new EditorStore();
        store.Dispatch({ type: EditorActions.ADD_LAYER });
        store.Dispatch({ type: EditorActions.RENAME_LAYER, data: { name: "floor" } });
        expect(store.SelectedLayer.name).toBe("floor");
    });

    it("leaves the layers untouched without a name (a cancelled dialog)", () => {
        const store = new EditorStore();
        store.Dispatch({ type: EditorActions.ADD_LAYER });
        const before = store.state.layers;
        store.Dispatch({ type: EditorActions.RENAME_LAYER });
        store.Dispatch({ type: EditorActions.RENAME_LAYER, data: { name: "" } });
        expect(store.state.layers).toBe(before);
    });
});

describe("EditorStore data brush icons", () => {
    it("come from the code, not the save, so older saves get them too", () => {
        const store = new EditorStore();
        const saved = {
            ...store.state,
            dataBrushes: store.state.dataBrushes.map(({ name, colour, value }) => ({ name, colour, value }))
        };
        store.Load(saved);
        const icons: { [name: string]: string | undefined } = {};
        store.state.dataBrushes.forEach(db => (icons[db.name] = db.icon));
        expect(icons).toEqual({
            [DataBrushName.PLAYER_START]: "knight_m_idle_anim",
            [DataBrushName.COLLISION]: "wall_mid",
            [DataBrushName.Z_INDEX]: undefined,
            [DataBrushName.LIGHT]: "torch_1_anim",
            [DataBrushName.SPAWNER]: "skull"
        });
    });
});

describe("EditorStore spawner data brush", () => {
    it("reconciles a saved spawner value, filling fields it was saved without", () => {
        const store = new EditorStore();
        const saved = {
            ...store.state,
            dataBrushes: [{ name: DataBrushName.SPAWNER, colour: 0, value: { monsters: ["imp"], interval: 1 } as never }]
        };
        store.Load(saved);
        const spawner = store.state.dataBrushes.find(db => db.name === DataBrushName.SPAWNER);
        expect(spawner.value).toEqual({ ...DEFAULT_SPAWNER_VALUE, monsters: ["imp"], interval: 1 });
    });

    it("ignores +/- on a spawner, and takes a value set from the dialog", () => {
        const store = new EditorStore();
        store.Dispatch({ type: EditorActions.ADD_DATA_LAYER });
        store.Dispatch({ type: EditorActions.SELECT_LAYER, data: { layer: store.state.layers[store.state.layers.length - 1] } });
        store.Dispatch({ type: EditorActions.BRUSH_CHANGED, data: { name: DataBrushName.SPAWNER } });
        store.Dispatch({ type: EditorActions.DATA_BRUSH_INC });
        expect(store.SelectedDataBrush.value).toEqual(DEFAULT_SPAWNER_VALUE);

        const value = { ...DEFAULT_SPAWNER_VALUE, monsters: ["ogre" as const] };
        store.Dispatch({ type: EditorActions.SET_DATA_BRUSH_VALUE, data: { value } });
        expect(store.SelectedDataBrush.value).toEqual(value);
        expect(store.state.currentBrush.data).toEqual(value);
    });
});

describe("EditorStore currentScene", () => {
    it("starts on the editor, the scene shown at boot, so its shortcuts work straight away", () => {
        expect(new EditorStore().state.currentScene).toBe(Scenes.EDITOR);
    });

    it("isn't changed by loading a map, whatever scene the save carries", () => {
        const store = new EditorStore();
        store.Load({ ...store.state, currentScene: null });
        expect(store.state.currentScene).toBe(Scenes.EDITOR);
        store.Load({ ...store.state, currentScene: Scenes.GAME });
        expect(store.state.currentScene).toBe(Scenes.EDITOR);
    });

    it("still follows CHANGE_SCENE", () => {
        const store = new EditorStore();
        store.Dispatch({ type: EditorActions.CHANGE_SCENE, data: { name: Scenes.GAME } });
        expect(store.state.currentScene).toBe(Scenes.GAME);
    });
});

describe("EditorStore mouseDownPosition", () => {
    function pressAt(store: EditorStore, x: number, y: number, mouseButtonState: MouseButtonState) {
        store.Dispatch({ type: EditorActions.BRUSH_MOVED, data: { position: { x, y } } });
        store.Dispatch({ type: EditorActions.MOUSE_BUTTON, data: { mouseButtonState } });
    }

    it("is recorded on a left press, where a rect paint starts", () => {
        const store = new EditorStore();
        pressAt(store, 2, 3, MouseButtonState.LEFT_DOWN);
        expect(store.state.mouseDownPosition).toEqual({ x: 2, y: 3 });
    });

    it("is recorded on a right press too, where a rect erase starts - not left over from the last left press", () => {
        const store = new EditorStore();
        pressAt(store, 2, 3, MouseButtonState.LEFT_DOWN);
        store.Dispatch({ type: EditorActions.MOUSE_BUTTON, data: { mouseButtonState: MouseButtonState.UP } });
        pressAt(store, 7, 5, MouseButtonState.RIGHT_DOWN);
        expect(store.state.mouseDownPosition).toEqual({ x: 7, y: 5 });
    });

    it("isn't touched by a middle press or a release", () => {
        const store = new EditorStore();
        pressAt(store, 2, 3, MouseButtonState.RIGHT_DOWN);
        pressAt(store, 4, 4, MouseButtonState.MIDDLE_DOWN);
        pressAt(store, 5, 5, MouseButtonState.UP);
        expect(store.state.mouseDownPosition).toEqual({ x: 2, y: 3 });
    });

    it("is in level cells, so it stays on the same cell when the view moves mid-drag", () => {
        const store = new EditorStore();
        store.Dispatch({ type: EditorActions.VIEW_MOVE, data: { move: { x: 10, y: 20 } } });
        pressAt(store, 2, 3, MouseButtonState.RIGHT_DOWN);
        expect(store.state.mouseDownPosition).toEqual({ x: 12, y: 23 });
        store.Dispatch({ type: EditorActions.VIEW_MOVE, data: { move: { x: -4, y: 1 } } });
        expect(store.state.mouseDownPosition).toEqual({ x: 12, y: 23 });
    });
});
