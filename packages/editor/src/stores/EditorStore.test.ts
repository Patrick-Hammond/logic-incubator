import { describe, expect, it } from "vitest";
import { Scenes } from "@logic-incubator/engine/Constants";
import { TEST_MONSTERS } from "@logic-incubator/engine/level/__fixtures__/TestMonsters";
import MonsterRoster from "@logic-incubator/engine/level/entities/MonsterRoster";
import { DataBrushName } from "@logic-incubator/engine/level/LevelFormat";
import EditorStore, { DataBrushIcon, EditableLayerCount, EditorActions, EditorTool, IMPLICIT_LAYER_ID, IsRemovableLayer, MouseButtonState, PaintsWithBrush, PLAYER_LAYER_ID, PlayerLayerMoved, ToolFitsLayer } from "./EditorStore";

MonsterRoster.inst.Load(TEST_MONSTERS);

function implicitLayers(store: EditorStore) {
    return store.state.layers.filter(layer => layer.id === IMPLICIT_LAYER_ID);
}

describe("EditorStore implicit layer", () => {
    it("is present from the start, a data layer, and not counted as editable", () => {
        const store = new EditorStore();
        expect(implicitLayers(store)).toHaveLength(1);
        expect(implicitLayers(store)[0].isData).toBe(true);
        // Just the default floor and walls layers.
        expect(EditableLayerCount(store.state.layers)).toBe(2);
    });

    it("is added to a loaded map that was saved without it, exactly once", () => {
        const store = new EditorStore();
        const saved = { ...store.state, layers: [{ id: 0, name: "layer 0", selected: true, visible: true, isData: false }] };
        store.Load(saved);
        expect(implicitLayers(store)).toHaveLength(1);
        // ...and the default floor and walls layers, and the player layer.
        expect(store.state.layers).toHaveLength(5);

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

describe("EditorStore default floor and walls layers", () => {
    const kinds = (store: EditorStore) => store.state.layers.map(layer => (layer.id === IMPLICIT_LAYER_ID ? "attributes" : layer.isPlayer ? "player" : layer.kind || "generic"));

    it("are what a new level starts with, after \"attributes\" and under the player layer, with the floor selected", () => {
        const store = new EditorStore();
        expect(kinds(store)).toEqual(["attributes", "floor", "walls", "player"]);
        expect(store.state.layers.map(layer => layer.name)).toEqual(["attributes", "floor", "walls", "player"]);
        expect(store.SelectedLayer.kind).toBe("floor");
    });

    it("come back after a reset", () => {
        const store = new EditorStore();
        store.Dispatch({ type: EditorActions.ADD_LAYER });
        store.Dispatch({ type: EditorActions.RESET, data: {} });
        expect(kinds(store)).toEqual(["attributes", "floor", "walls", "player"]);
    });

    it("are added to a level saved before layers had kinds, under its own layers, with fresh ids", () => {
        const store = new EditorStore();
        store.Load({ ...store.state, layers: [{ id: 3, name: "layer 3", selected: true, visible: true, isData: false }] });
        expect(kinds(store)).toEqual(["attributes", "floor", "walls", "generic", "player"]);
        expect(store.state.layers.map(layer => layer.id)).toEqual([IMPLICIT_LAYER_ID, 4, 5, 3, PLAYER_LAYER_ID]);
        expect(store.SelectedLayer.id).toBe(3);

        // Loading it again adds nothing more.
        const before = store.state.layers;
        store.Load(store.state);
        expect(store.state.layers).toBe(before);
    });

    it("only adds the kind that's missing, walls over floor", () => {
        const store = new EditorStore();
        store.Load({
            ...store.state,
            layers: [
                { id: 0, name: "ground", selected: false, visible: true, isData: false, kind: "floor" },
                { id: 1, name: "props", selected: true, visible: true, isData: false }
            ]
        });
        expect(kinds(store)).toEqual(["attributes", "floor", "walls", "generic", "player"]);
        expect(store.state.layers[1].name).toBe("ground");
    });

    it("can't be removed while each is the last of its kind, nor can \"attributes\"", () => {
        const store = new EditorStore();
        const layers = store.state.layers;
        layers.forEach(layer => expect(IsRemovableLayer(layers, layer), layer.name).toBe(false));

        store.Dispatch({ type: EditorActions.ADD_LAYER, data: { kind: "walls" } });
        const more = store.state.layers;
        more.filter(layer => layer.kind === "walls").forEach(layer => expect(IsRemovableLayer(more, layer), layer.name).toBe(true));
        expect(IsRemovableLayer(more, more.find(layer => layer.kind === "floor"))).toBe(false);
    });

    it("would come back if removed anyway", () => {
        const store = new EditorStore();
        store.Dispatch({ type: EditorActions.REMOVE_LAYER });
        expect(kinds(store)).toEqual(["attributes", "floor", "walls", "player"]);
    });
});

describe("EditorStore player layer", () => {
    const names = (store: EditorStore) => store.state.layers.map(layer => layer.name);
    const player = (store: EditorStore) => store.state.layers.find(layer => layer.isPlayer);
    /** A level with its figures between its floor and its walls, and a generic layer over the walls. */
    function Store(): EditorStore {
        const store = new EditorStore();
        store.Load({
            ...store.state,
            layers: [
                { id: IMPLICIT_LAYER_ID, name: "attributes", selected: false, visible: true, isData: true },
                { id: 0, name: "floor", selected: true, visible: true, isData: false, kind: "floor" },
                { id: PLAYER_LAYER_ID, name: "player", selected: false, visible: true, isData: false, isPlayer: true },
                { id: 1, name: "walls", selected: false, visible: true, isData: false, kind: "walls" },
                { id: 2, name: "arches", selected: false, visible: true, isData: false }
            ]
        });
        return store;
    }

    it("is a divider that isn't a tile layer or a data layer, and doesn't count as editable", () => {
        const store = new EditorStore();
        expect(player(store)).toMatchObject({ id: PLAYER_LAYER_ID, name: "player", isData: false, isPlayer: true });
        expect(EditableLayerCount(store.state.layers)).toBe(2);
    });

    it("is kept where a loaded level has it, exactly once", () => {
        const store = Store();
        expect(names(store)).toEqual(["attributes", "floor", "player", "walls", "arches"]);
        const before = store.state.layers;
        store.Load(store.state);
        expect(store.state.layers).toBe(before);
    });

    it("can't be selected, so nothing is ever painted on it", () => {
        const store = Store();
        const before = store.state;
        store.Dispatch({ type: EditorActions.SELECT_LAYER, data: { layer: player(store) } });
        expect(store.state).toBe(before);
        expect(store.SelectedLayer.name).toBe("floor");
    });

    it("can't be removed or duplicated, and comes back after a reset", () => {
        const store = Store();
        expect(IsRemovableLayer(store.state.layers, player(store))).toBe(false);
        store.Dispatch({ type: EditorActions.SELECT_LAYER, data: { layer: store.state.layers[4] } });
        store.Dispatch({ type: EditorActions.DUPLICATE_LAYER });
        expect(store.state.layers.filter(layer => layer.isPlayer)).toHaveLength(1);
        store.Dispatch({ type: EditorActions.RESET, data: {} });
        expect(store.state.layers.filter(layer => layer.isPlayer)).toHaveLength(1);
    });

    it("moves past the next tile layer up or down, stepping over \"attributes\"", () => {
        const store = Store();
        store.Dispatch({ type: EditorActions.MOVE_PLAYER_LAYER_DOWN });
        expect(names(store)).toEqual(["attributes", "floor", "walls", "player", "arches"]);
        store.Dispatch({ type: EditorActions.MOVE_PLAYER_LAYER_DOWN });
        expect(names(store)).toEqual(["attributes", "floor", "walls", "arches", "player"]);
        store.Dispatch({ type: EditorActions.MOVE_PLAYER_LAYER_UP });
        store.Dispatch({ type: EditorActions.MOVE_PLAYER_LAYER_UP });
        store.Dispatch({ type: EditorActions.MOVE_PLAYER_LAYER_UP });
        expect(names(store)).toEqual(["attributes", "player", "floor", "walls", "arches"]);

        // "attributes" moved in among the tile layers: one step goes past it and the floor both, as just past it the game would draw the same.
        store.Dispatch({ type: EditorActions.MOVE_PLAYER_LAYER_DOWN });
        expect(store.SelectedLayer.name).toBe("floor");
        store.Dispatch({ type: EditorActions.MOVE_LAYER_UP });
        expect(names(store)).toEqual(["floor", "attributes", "player", "walls", "arches"]);
        store.Dispatch({ type: EditorActions.MOVE_PLAYER_LAYER_UP });
        expect(names(store)).toEqual(["player", "floor", "attributes", "walls", "arches"]);
    });

    it("stays put at either end, as the same layers (so its buttons can tell they've nowhere to go)", () => {
        const store = Store();
        store.Dispatch({ type: EditorActions.MOVE_PLAYER_LAYER_UP });
        const top = store.state.layers;
        expect(PlayerLayerMoved(top, true)).toBe(top);
        store.Dispatch({ type: EditorActions.MOVE_PLAYER_LAYER_UP });
        expect(store.state.layers).toBe(top);

        const fresh = new EditorStore();
        expect(PlayerLayerMoved(fresh.state.layers, false)).toBe(fresh.state.layers);
        expect(PlayerLayerMoved(fresh.state.layers, true)).not.toBe(fresh.state.layers);
    });

    it("is moved past when the selected layer is moved, like any other", () => {
        const store = Store();
        store.Dispatch({ type: EditorActions.SELECT_LAYER, data: { layer: store.state.layers[3] } });
        store.Dispatch({ type: EditorActions.MOVE_LAYER_UP });
        expect(names(store)).toEqual(["attributes", "floor", "walls", "player", "arches"]);
    });

    it("stays on top when a layer is added or duplicated while it's last, so the new one is drawn under the figures", () => {
        const store = new EditorStore();
        store.Dispatch({ type: EditorActions.ADD_LAYER });
        expect(names(store)).toEqual(["attributes", "floor", "walls", "layer 2", "player"]);
        store.Dispatch({ type: EditorActions.DUPLICATE_LAYER });
        expect(names(store)).toEqual(["attributes", "floor", "walls", "layer 2", "layer 2", "player"]);
    });

    it("leaves a layer added while it's elsewhere to go last, over the figures", () => {
        const store = Store();
        store.Dispatch({ type: EditorActions.ADD_LAYER });
        expect(names(store)).toEqual(["attributes", "floor", "player", "walls", "arches", "layer 3"]);
    });
});

describe("EditorStore adding layers", () => {
    it("adds a generic layer by default, selected, and a floor or walls one when asked", () => {
        const store = new EditorStore();
        store.Dispatch({ type: EditorActions.ADD_LAYER });
        expect(store.SelectedLayer).toMatchObject({ id: 2, name: "layer 2", isData: false });
        expect(store.SelectedLayer.kind).toBeUndefined();

        store.Dispatch({ type: EditorActions.ADD_LAYER, data: { kind: "walls" } });
        expect(store.SelectedLayer).toMatchObject({ id: 3, name: "walls 3", kind: "walls" });
        expect(store.state.layers.filter(layer => layer.selected)).toHaveLength(1);
    });

    it("duplicates a layer with its kind", () => {
        const store = new EditorStore();
        store.Dispatch({ type: EditorActions.DUPLICATE_LAYER });
        const floors = store.state.layers.filter(layer => layer.kind === "floor");
        expect(floors.map(layer => layer.id)).toEqual([0, 2]);
    });
});

describe("EditorStore per-layer tool and brush", () => {
    const layerOf = (store: EditorStore, kind: string) => store.state.layers.find(layer => layer.kind === kind);
    const select = (store: EditorStore, kind: string) => store.Dispatch({ type: EditorActions.SELECT_LAYER, data: { layer: layerOf(store, kind) } });
    const pick = (store: EditorStore, name: string) => store.Dispatch({ type: EditorActions.BRUSH_CHANGED, data: { name } });
    const setTool = (store: EditorStore, tool: EditorTool) => store.Dispatch({ type: EditorActions.SET_TOOL, data: { tool } });

    it("gives a layer back the tile and tool it had when it's selected again", () => {
        const store = new EditorStore();
        pick(store, "floor_1");
        setTool(store, EditorTool.FILL);
        store.Dispatch({ type: EditorActions.ROTATE_BRUSH });

        select(store, "walls");
        expect(store.state.currentBrush.name).toBe("");
        pick(store, "wall_mid");
        setTool(store, EditorTool.STAMP);

        select(store, "floor");
        expect(store.state.currentBrush).toMatchObject({ name: "floor_1", layerId: layerOf(store, "floor").id, rotation: Math.PI / 2 });
        expect(store.state.tool).toBe(EditorTool.FILL);

        select(store, "walls");
        expect(store.state.currentBrush).toMatchObject({ name: "wall_mid", layerId: layerOf(store, "walls").id });
        expect(store.state.tool).toBe(EditorTool.STAMP);
    });

    it("keeps the cursor where it is", () => {
        const store = new EditorStore();
        pick(store, "floor_1");
        select(store, "walls");
        store.Dispatch({ type: EditorActions.BRUSH_MOVED, data: { position: { x: 7, y: 3 } } });
        select(store, "floor");
        expect(store.state.currentBrush.position).toEqual({ x: 7, y: 3 });
    });

    it("starts a new layer with no brush", () => {
        const store = new EditorStore();
        pick(store, "floor_1");
        store.Dispatch({ type: EditorActions.ADD_LAYER });
        expect(store.state.currentBrush.name).toBe("");
        expect(store.state.currentBrush.layerId).toBe(store.SelectedLayer.id);
    });

    it("keeps the dropper's pick rather than the layer's remembered brush", () => {
        const store = new EditorStore();
        select(store, "walls");
        pick(store, "wall_mid");
        select(store, "floor");
        const picked = { ...store.state.currentBrush, name: "wall_left", layerId: layerOf(store, "walls").id };
        store.Dispatch({ type: EditorActions.PICK_BRUSH, data: { brush: picked } });
        expect(store.SelectedLayer.kind).toBe("walls");
        expect(store.state.currentBrush.name).toBe("wall_left");
    });

    it("forgets a removed layer, and everything on a reset", () => {
        const store = new EditorStore();
        store.Dispatch({ type: EditorActions.ADD_LAYER });
        const added = store.SelectedLayer;
        pick(store, "torch");
        select(store, "floor");
        expect(store.state.layerMemory[added.id]).toBeDefined();

        store.Dispatch({ type: EditorActions.SELECT_LAYER, data: { layer: added } });
        store.Dispatch({ type: EditorActions.REMOVE_LAYER });
        expect(store.state.layerMemory[added.id]).toBeUndefined();

        select(store, "walls");
        expect(Object.keys(store.state.layerMemory)).not.toHaveLength(0);
        store.Dispatch({ type: EditorActions.RESET, data: {} });
        expect(store.state.layerMemory).toEqual({});
    });

    it("is kept by a save, and a save from before it starts with none", () => {
        const store = new EditorStore();
        pick(store, "floor_1");
        select(store, "walls");
        const saved = JSON.parse(JSON.stringify(store.state));

        const loaded = new EditorStore();
        loaded.Load(saved);
        loaded.Dispatch({ type: EditorActions.SELECT_LAYER, data: { layer: layerOf(loaded, "floor") } });
        expect(loaded.state.currentBrush.name).toBe("floor_1");

        const old = { ...saved };
        delete old.layerMemory;
        loaded.Load(old);
        expect(loaded.state.layerMemory).toEqual({});
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

describe("the data-select tool needs a data layer", () => {
    const selectAttributes = (store: EditorStore) => store.Dispatch({ type: EditorActions.SELECT_LAYER, data: { layer: implicitLayers(store)[0] } });
    const setTool = (store: EditorStore, tool: EditorTool) => store.Dispatch({ type: EditorActions.SET_TOOL, data: { tool } });

    it("says which tools suit which layer: data-select only a data layer, everything else any", () => {
        const data = { id: 1, name: "a", selected: true, visible: true, isData: true };
        const tiles = { ...data, isData: false };
        expect(ToolFitsLayer(EditorTool.DATA_SELECT, data)).toBe(true);
        expect(ToolFitsLayer(EditorTool.DATA_SELECT, tiles)).toBe(false);
        expect(ToolFitsLayer(EditorTool.DATA_SELECT, undefined)).toBe(false);
        [EditorTool.BRUSH, EditorTool.ERASE, EditorTool.STAMP, EditorTool.DROPPER, EditorTool.FILL, EditorTool.MOVE].forEach(tool => {
            expect(ToolFitsLayer(tool, data), tool).toBe(true);
            expect(ToolFitsLayer(tool, tiles), tool).toBe(true);
            expect(ToolFitsLayer(tool, undefined), tool).toBe(true);
        });
    });

    it("can be picked while the attributes layer is selected", () => {
        const store = new EditorStore();
        selectAttributes(store);
        setTool(store, EditorTool.DATA_SELECT);
        expect(store.state.tool).toBe(EditorTool.DATA_SELECT);
    });

    it("can't be picked with a tile layer selected, or with no layer selected at all - the brush stays", () => {
        const store = new EditorStore();
        setTool(store, EditorTool.DATA_SELECT);
        expect(store.state.tool).toBe(EditorTool.BRUSH);

        store.Dispatch({ type: EditorActions.ADD_LAYER });
        setTool(store, EditorTool.DATA_SELECT);
        expect(store.state.tool).toBe(EditorTool.BRUSH);
    });

    it("gives way to the brush when a tile layer is selected, whichever way that happens", () => {
        const store = new EditorStore();
        store.Dispatch({ type: EditorActions.ADD_LAYER });
        const tileLayer = store.state.layers.find(layer => !layer.isData);

        // Clicking its row...
        selectAttributes(store);
        setTool(store, EditorTool.DATA_SELECT);
        store.Dispatch({ type: EditorActions.SELECT_LAYER, data: { layer: tileLayer } });
        expect(store.state.tool).toBe(EditorTool.BRUSH);

        // ...adding another...
        selectAttributes(store);
        setTool(store, EditorTool.DATA_SELECT);
        store.Dispatch({ type: EditorActions.ADD_LAYER });
        expect(store.state.tool).toBe(EditorTool.BRUSH);

        // ...or the dropper picking a tile, which selects the layer it was on.
        selectAttributes(store);
        setTool(store, EditorTool.DATA_SELECT);
        const picked = { ...store.state.currentBrush, name: "wall", layerId: tileLayer.id };
        store.Dispatch({ type: EditorActions.PICK_BRUSH, data: { brush: picked } });
        expect(store.SelectedLayer.id).toBe(tileLayer.id);
        expect(store.state.tool).toBe(EditorTool.BRUSH);
    });

    it("comes back with the attributes layer", () => {
        const store = new EditorStore();
        selectAttributes(store);
        setTool(store, EditorTool.DATA_SELECT);
        store.Dispatch({ type: EditorActions.SELECT_LAYER, data: { layer: store.state.layers.find(layer => !layer.isData) } });
        expect(store.state.tool).toBe(EditorTool.BRUSH);
        selectAttributes(store);
        expect(store.state.tool).toBe(EditorTool.DATA_SELECT);
    });

    it("is picked whenever the attributes layer is selected, from any tool, first time or not - keeping the brush it was left with", () => {
        [EditorTool.BRUSH, EditorTool.ERASE, EditorTool.STAMP, EditorTool.DROPPER, EditorTool.FILL, EditorTool.MOVE].forEach(tool => {
            const store = new EditorStore();
            setTool(store, tool);
            selectAttributes(store);
            expect(store.state.tool, tool).toBe(EditorTool.DATA_SELECT);

            // Left painting collision with the brush...
            store.Dispatch({ type: EditorActions.BRUSH_CHANGED, data: { name: DataBrushName.COLLISION } });
            expect(store.state.tool, tool).toBe(EditorTool.BRUSH);
            store.Dispatch({ type: EditorActions.SELECT_LAYER, data: { layer: store.state.layers.find(layer => layer.kind === "floor") } });
            setTool(store, tool);
            // ...it comes back on the data arrow all the same, with collision still the brush for B.
            selectAttributes(store);
            expect(store.state.tool, tool).toBe(EditorTool.DATA_SELECT);
            expect(store.state.currentBrush.name, tool).toBe(DataBrushName.COLLISION);
        });
    });

    it("isn't picked when the dropper takes a data brush off the attributes layer - the dropper stays", () => {
        const store = new EditorStore();
        setTool(store, EditorTool.DROPPER);
        const picked = { ...store.state.currentBrush, name: DataBrushName.COLLISION, layerId: IMPLICIT_LAYER_ID };
        store.Dispatch({ type: EditorActions.PICK_BRUSH, data: { brush: picked } });
        expect(store.SelectedLayer.id).toBe(IMPLICIT_LAYER_ID);
        expect(store.state.tool).toBe(EditorTool.DROPPER);
    });

    it("leaves every other tool alone when the layer changes to a tile layer with nothing remembered", () => {
        [EditorTool.ERASE, EditorTool.STAMP, EditorTool.DROPPER, EditorTool.FILL, EditorTool.MOVE].forEach(tool => {
            const store = new EditorStore();
            setTool(store, tool);
            store.Dispatch({ type: EditorActions.SELECT_LAYER, data: { layer: store.state.layers.find(layer => layer.kind === "walls") } });
            expect(store.state.tool, tool).toBe(tool);
        });
    });

    it("is checked on load too: kept where the loaded map has a data layer selected, dropped where it has a tile layer", () => {
        const store = new EditorStore();
        selectAttributes(store);
        setTool(store, EditorTool.DATA_SELECT);
        const attributes = implicitLayers(store)[0];

        store.Load({ ...store.state, layers: [{ ...attributes, selected: true }] });
        expect(store.state.tool).toBe(EditorTool.DATA_SELECT);

        const tileLayer = { id: 0, name: "layer 0", selected: true, visible: true, isData: false };
        store.Load({ ...store.state, layers: [{ ...attributes, selected: false }, tileLayer] });
        expect(store.state.tool).toBe(EditorTool.BRUSH);
    });
});

describe("picking a brush in the palette", () => {
    const setTool = (store: EditorStore, tool: EditorTool) => store.Dispatch({ type: EditorActions.SET_TOOL, data: { tool } });
    const pick = (store: EditorStore, name: string) => store.Dispatch({ type: EditorActions.BRUSH_CHANGED, data: { name } });

    it("switches a tool that doesn't paint (erase, the dropper, move) to the brush", () => {
        [EditorTool.ERASE, EditorTool.DROPPER, EditorTool.MOVE].forEach(tool => {
            const store = new EditorStore();
            setTool(store, tool);
            pick(store, "floor_1");
            expect(store.state.tool, tool).toBe(EditorTool.BRUSH);
            expect(store.state.currentBrush.name, tool).toBe("floor_1");
        });
    });

    it("keeps the tools that paint with it: the brush, stamp and fill", () => {
        [EditorTool.BRUSH, EditorTool.STAMP, EditorTool.FILL].forEach(tool => {
            const store = new EditorStore();
            setTool(store, tool);
            pick(store, "floor_1");
            expect(store.state.tool, tool).toBe(tool);
        });
    });

    it("switches the data arrow to the brush when a data brush is picked on the attributes layer", () => {
        const store = new EditorStore();
        store.Dispatch({ type: EditorActions.SELECT_LAYER, data: { layer: implicitLayers(store)[0] } });
        expect(store.state.tool).toBe(EditorTool.DATA_SELECT);
        pick(store, DataBrushName.PICKUP);
        expect(store.state.tool).toBe(EditorTool.BRUSH);
    });

    it("says which tools paint with the picked brush", () => {
        expect([EditorTool.BRUSH, EditorTool.ERASE, EditorTool.DATA_SELECT, EditorTool.STAMP, EditorTool.DROPPER, EditorTool.FILL, EditorTool.MOVE].filter(PaintsWithBrush)).toEqual([
            EditorTool.BRUSH,
            EditorTool.STAMP,
            EditorTool.FILL
        ]);
    });
});

describe("the pickup data brush", () => {
    it("is one of the palette's data brushes, starting as one gold piece", () => {
        const brush = new EditorStore().state.dataBrushes.find(db => db.name === DataBrushName.PICKUP);
        expect(brush).toBeDefined();
        expect(brush.value).toEqual({ kind: "gold", amount: 1 });
    });

    it("has its own colour, none of the other data brushes' - the map and palette tell them apart by it", () => {
        const colours = new EditorStore().state.dataBrushes.map(db => db.colour);
        expect(new Set(colours).size).toBe(colours.length);
    });

    it("is added to a map saved before it existed, and keeps the value of one saved with it", () => {
        const store = new EditorStore();
        const old = { ...store.state, dataBrushes: store.state.dataBrushes.filter(db => db.name !== DataBrushName.PICKUP) };
        store.Load(old);
        expect(store.state.dataBrushes.find(db => db.name === DataBrushName.PICKUP).value).toEqual({ kind: "gold", amount: 1 });

        const key = { kind: "key", id: 4 } as const;
        store.Load({ ...store.state, dataBrushes: store.state.dataBrushes.map(db => (db.name === DataBrushName.PICKUP ? { ...db, value: key } : db)) });
        expect(store.state.dataBrushes.find(db => db.name === DataBrushName.PICKUP).value).toEqual(key);
    });

    it("takes the value its popup sets, carried onto the brush that's painted", () => {
        const store = new EditorStore();
        // Picking a brush puts it on the selected layer, so there has to be one.
        store.Dispatch({ type: EditorActions.SELECT_LAYER, data: { layer: implicitLayers(store)[0] } });
        store.Dispatch({ type: EditorActions.BRUSH_CHANGED, data: { name: DataBrushName.PICKUP } });
        expect(store.state.currentBrush.data).toEqual({ kind: "gold", amount: 1 });
        store.Dispatch({ type: EditorActions.SET_DATA_BRUSH_VALUE, data: { value: { kind: "health", amount: 4 } } });
        expect(store.SelectedDataBrush.value).toEqual({ kind: "health", amount: 4 });
        expect(store.state.currentBrush.data).toEqual({ kind: "health", amount: 4 });
    });

    it("isn't stepped by + and - the way a height is - its value isn't a number", () => {
        const store = new EditorStore();
        store.Dispatch({ type: EditorActions.SELECT_LAYER, data: { layer: implicitLayers(store)[0] } });
        store.Dispatch({ type: EditorActions.BRUSH_CHANGED, data: { name: DataBrushName.PICKUP } });
        const before = store.SelectedDataBrush.value;
        store.Dispatch({ type: EditorActions.DATA_BRUSH_INC });
        store.Dispatch({ type: EditorActions.DATA_BRUSH_DEC });
        expect(store.SelectedDataBrush.value).toEqual(before);
    });
});

describe("the spawner data brush", () => {
    it("is one of the palette's data brushes, starting as a new spawner of the roster's default pool", () => {
        const brush = new EditorStore().state.dataBrushes.find(db => db.name === DataBrushName.SPAWNER);
        expect(brush).toBeDefined();
        expect(brush.value).toEqual({ monsters: ["goblin"], interval: 3, maxAlive: 4, total: 0, activationRange: 10, hitPoints: 10 });
    });

    it("is added to a map saved before it existed", () => {
        const store = new EditorStore();
        store.Load({ ...store.state, dataBrushes: store.state.dataBrushes.filter(db => db.name !== DataBrushName.SPAWNER) });
        expect(store.state.dataBrushes.find(db => db.name === DataBrushName.SPAWNER)).toBeDefined();
    });

    it("takes the value its popup sets, carried onto the brush that's painted, and isn't stepped by + and -", () => {
        const store = new EditorStore();
        store.Dispatch({ type: EditorActions.SELECT_LAYER, data: { layer: implicitLayers(store)[0] } });
        store.Dispatch({ type: EditorActions.BRUSH_CHANGED, data: { name: DataBrushName.SPAWNER } });
        const value = { monsters: ["imp", "ogre"], interval: 1, maxAlive: 2, total: 5, activationRange: 0, hitPoints: 0 };
        store.Dispatch({ type: EditorActions.SET_DATA_BRUSH_VALUE, data: { value } });
        store.Dispatch({ type: EditorActions.DATA_BRUSH_INC });
        expect(store.SelectedDataBrush.value).toEqual(value);
        expect(store.state.currentBrush.data).toEqual(value);
    });
});
