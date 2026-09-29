import { describe, expect, it } from "vitest";
import { Scenes } from "@logic-incubator/engine/Constants";
import { TEST_MONSTERS } from "@logic-incubator/engine/level/__fixtures__/TestMonsters";
import MonsterRoster from "@logic-incubator/engine/level/entities/MonsterRoster";
import { DataBrushName } from "@logic-incubator/engine/level/LevelFormat";
import EditorStore, { DataBrushIcon, EditableLayerCount, EditorActions, EditorTool, IMPLICIT_LAYER_ID, MouseButtonState } from "./EditorStore";

MonsterRoster.inst.Load(TEST_MONSTERS);

function implicitLayers(store: EditorStore) {
    return store.state.layers.filter(layer => layer.id === IMPLICIT_LAYER_ID);
}

describe("EditorStore implicit layer", () => {
    it("is present from the start, a data layer, and not counted as editable", () => {
        const store = new EditorStore();
        expect(implicitLayers(store)).toHaveLength(1);
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

    it("can't be duplicated (there's only ever the one data layer), and starts out named \"attributes\"", () => {
        const store = new EditorStore();
        store.Dispatch({ type: EditorActions.SELECT_LAYER, data: { layer: implicitLayers(store)[0] } });
        const before = store.state.layers;
        store.Dispatch({ type: EditorActions.DUPLICATE_LAYER });
        expect(store.state.layers).toBe(before);
        expect(implicitLayers(store)[0].name).toBe("attributes");
    });

    it("can be renamed, like any other layer", () => {
        const store = new EditorStore();
        store.Dispatch({ type: EditorActions.SELECT_LAYER, data: { layer: implicitLayers(store)[0] } });
        store.Dispatch({ type: EditorActions.RENAME_LAYER, data: { name: "notes" } });
        expect(implicitLayers(store)[0].name).toBe("notes");
    });

    it("can be selected and painted on, like any other data layer - player-start/collision/z-index have nowhere else to go", () => {
        const store = new EditorStore();
        const implicit = implicitLayers(store)[0];
        store.Dispatch({ type: EditorActions.SELECT_LAYER, data: { layer: implicit } });
        store.Dispatch({ type: EditorActions.BRUSH_CHANGED, data: { name: DataBrushName.COLLISION } });
        expect(store.state.currentBrush.layerId).toBe(IMPLICIT_LAYER_ID);
    });

    it("brings a pre-rename save's fixed old name (\"implicit (read-only)\") up to \"attributes\" on load - safe because that name could never have been anything else (renaming wasn't allowed yet)", () => {
        const store = new EditorStore();
        const saved = {
            ...store.state,
            layers: [
                { id: IMPLICIT_LAYER_ID, name: "implicit (read-only)", selected: false, visible: true, isData: true },
                { id: 0, name: "layer 0", selected: true, visible: true, isData: false }
            ]
        };
        store.Load(saved);
        expect(implicitLayers(store)[0].name).toBe("attributes");

        // Already migrated (or freshly renamed to anything else) - re-loading the same state doesn't touch it again.
        const before = store.state.layers;
        store.Load(store.state);
        expect(store.state.layers).toBe(before);
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
    it("aren't the store's - an older save's are dropped, as the game picks them (see DataBrushIcons)", () => {
        const store = new EditorStore();
        const saved = {
            ...store.state,
            dataBrushes: store.state.dataBrushes.map(db => ({ ...db, icon: "old_sprite" }))
        };
        store.Load(saved);
        store.state.dataBrushes.forEach(db => expect(db, db.name).not.toHaveProperty("icon"));
    });

    it("are looked up by brush name, and a brush without one gets none", () => {
        const icons = { [DataBrushName.Z_INDEX]: "ruler" };
        expect(DataBrushIcon(icons, DataBrushName.Z_INDEX)).toBe("ruler");
        expect(DataBrushIcon(icons, DataBrushName.COLLISION)).toBeUndefined();
        expect(DataBrushIcon({}, "not-a-brush")).toBeUndefined();
    });
});

// Reconciling a saved spawner value, and +/- vs. the dialog on a SET_DATA_BRUSH_VALUE-carried object
// value, used to be tested here against the SPAWNER data brush - it isn't one any more (see
// LevelFormat.ts and DataBrushEditors.ts), so there's nothing left in `dataBrushes` an object value
// like a spawner's could ever reach. `ImplicitData.test.ts` covers a spawner's own value now
// (EffectiveSpawner/SanitiseSpawnerValue), and `Tools.EditableTargetAt`'s dialog-and-SET_DATA path.

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

describe("EditorStore tools", () => {
    it("starts on the brush, switches with SET_TOOL, and keeps the live tool when a map is loaded", () => {
        const store = new EditorStore();
        expect(store.state.tool).toBe(EditorTool.BRUSH);
        store.Dispatch({ type: EditorActions.SET_TOOL, data: { tool: EditorTool.FILL } });
        expect(store.state.tool).toBe(EditorTool.FILL);
        store.Load({ ...store.state, tool: EditorTool.MOVE });
        expect(store.state.tool).toBe(EditorTool.FILL);
    });

    it("PICK_BRUSH takes a placed brush's name, layer and transform, but not its position", () => {
        const store = new EditorStore();
        store.Dispatch({ type: EditorActions.ADD_LAYER });
        // "attributes", the one data layer, is always there - no need to add one.
        const dataLayer = store.state.layers.find(l => l.isData);
        const tileLayer = store.state.layers.find(l => !l.isData);
        store.Dispatch({ type: EditorActions.SELECT_LAYER, data: { layer: dataLayer } });
        store.Dispatch({ type: EditorActions.BRUSH_MOVED, data: { position: { x: 4, y: 4 } } });

        const placed = {
            name: "wall_mid",
            position: { x: 10, y: 11 },
            pixelOffset: { x: 1, y: 2 },
            rotation: Math.PI / 2,
            scale: { x: -1, y: 1 },
            layerId: tileLayer.id,
            data: null
        };
        store.Dispatch({ type: EditorActions.PICK_BRUSH, data: { brush: placed } });
        expect(store.state.currentBrush).toEqual({ ...placed, position: { x: 4, y: 4 } });
        expect(store.SelectedLayer.id).toBe(tileLayer.id);
    });

    it("PICK_BRUSH on a placed data brush picks up its value too", () => {
        const store = new EditorStore();
        const dataLayer = store.state.layers.find(l => l.isData);
        const placed = {
            name: DataBrushName.Z_INDEX,
            position: { x: 1, y: 1 },
            pixelOffset: { x: 0, y: 0 },
            rotation: 0,
            scale: { x: 1, y: 1 },
            layerId: dataLayer.id,
            data: 5
        };
        store.Dispatch({ type: EditorActions.PICK_BRUSH, data: { brush: placed } });
        expect(store.SelectedDataBrush.value).toBe(5);
        expect(store.SelectedLayer.id).toBe(dataLayer.id);
    });
});
