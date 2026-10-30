import { describe, expect, it } from "vitest";
import { DataBrushName, HEIGHT_LAYER_ID, LevelVersion } from "@logic-incubator/engine/level/LevelFormat";
import { EditorSave, MakeEditorSave, OpenEditorSave } from "./SavedLevel";
import EditorStore from "./stores/EditorStore";
import LevelDataStore from "./stores/LevelDataStore";

const height = { name: DataBrushName.Z_INDEX, position: { x: 1, y: 1 }, pixelOffset: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 }, layerId: -99999, data: 2 };

describe("the editor's saves", () => {
    it("are stamped with the current version", () => {
        const save = MakeEditorSave(new EditorStore().state, new LevelDataStore(1).state);
        expect(save.version).toBe(LevelVersion);
        expect(OpenEditorSave(save).save).toBe(save);
    });

    it("open from the version before brought up to date, and load into the editor with the height layer where the file put it", () => {
        const store = new EditorStore();
        const old = { editorData: { ...store.state, layers: store.state.layers.filter(layer => layer.id !== HEIGHT_LAYER_ID) }, levelData: { levelData: [height], quests: [] } } as EditorSave;
        const opened = OpenEditorSave(old);
        expect(opened.error).toBeUndefined();
        expect(opened.save.levelData.levelData).toEqual([{ ...height, layerId: HEIGHT_LAYER_ID }]);
        store.Load(opened.save.editorData);
        expect(store.state.layers.filter(layer => layer.id === HEIGHT_LAYER_ID)).toEqual([
            { id: HEIGHT_LAYER_ID, name: "height", isData: true, isHeight: true, visible: false, selected: false }
        ]);
    });

    it("say why one that's older than that, or newer than the editor, can't be opened", () => {
        const store = new EditorStore();
        const older = { version: LevelVersion - 2, editorData: store.state, levelData: { levelData: [], quests: [] } } as EditorSave;
        const newer = { ...older, version: LevelVersion + 1 };
        expect(OpenEditorSave(older).error).toMatch(/too old/);
        expect(OpenEditorSave(newer).error).toMatch(/newer/);
        expect(OpenEditorSave(newer).save).toBeUndefined();
    });
});
