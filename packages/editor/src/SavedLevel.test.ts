import { afterEach, describe, expect, it, vi } from "vitest";
import { DataBrushName, HEIGHT_LAYER_ID, LevelVersion } from "@logic-incubator/engine/level/LevelFormat";
import { EditorSave, LevelContent, LoadSavedLevel, MakeEditorSave, NeedsSaveOnLeave, OpenEditorSave, SaveLevel, SaveOnLeave } from "./SavedLevel";
import EditorStore from "./stores/EditorStore";
import LevelDataStore, { Layer } from "./stores/LevelDataStore";

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

describe("saving as the page goes", () => {
    const floor = { ...height, name: "floor_1", layerId: 1, data: null };
    const blank = () => MakeEditorSave(new EditorStore().state, new LevelDataStore(1).state);
    const painted = () => {
        const save = blank();
        return { ...save, levelData: { ...save.levelData, levelData: [floor] } };
    };
    const lookedAround = (save: EditorSave): EditorSave => ({
        ...save,
        editorData: {
            ...save.editorData,
            viewScale: 3,
            viewOffset: { x: 40, y: -20 },
            layers: (save.editorData.layers as Layer[]).map(layer => ({ ...layer, selected: !layer.selected, visible: !layer.visible }))
        }
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("compares the level itself: its brushes, quests and layers, not the view, or which layers are selected or hidden", () => {
        const save = painted();
        expect(LevelContent(lookedAround(save))).toBe(LevelContent(save));
        expect(LevelContent(blank())).not.toBe(LevelContent(save));
        const quests = [{ id: "q", name: "Quest", goal: { kind: "kill", count: 1 } }] as unknown as EditorSave["levelData"]["quests"];
        expect(LevelContent({ ...save, levelData: { ...save.levelData, quests } })).not.toBe(LevelContent(save));
        const renamed = { ...save, editorData: { ...save.editorData, layers: (save.editorData.layers as Layer[]).map(layer => ({ ...layer, name: layer.name + "!" })) } };
        expect(LevelContent(renamed)).not.toBe(LevelContent(save));
    });

    it("saves a level that isn't the one stored, such as one changed since the last play, or undone after it", () => {
        expect(NeedsSaveOnLeave(painted(), blank(), LevelContent(blank()))).toBe(true);
        expect(NeedsSaveOnLeave(blank(), painted(), LevelContent(blank()))).toBe(true);
        expect(NeedsSaveOnLeave(lookedAround(painted()), painted(), LevelContent(blank()))).toBe(false);
    });

    it("with nothing stored, or nothing it can open, saves only a level changed since the editor started", () => {
        const newer = { ...painted(), version: LevelVersion + 1 };
        expect(NeedsSaveOnLeave(lookedAround(blank()), undefined, LevelContent(blank()))).toBe(false);
        expect(NeedsSaveOnLeave(lookedAround(blank()), newer, LevelContent(blank()))).toBe(false);
        expect(NeedsSaveOnLeave(painted(), undefined, LevelContent(blank()))).toBe(true);
        expect(NeedsSaveOnLeave(painted(), newer, LevelContent(blank()))).toBe(true);
    });

    it("stores the level in the browser when it's needed, and counts a stored save that can't be read as none", () => {
        const kept = new Map<string, string>();
        vi.stubGlobal("Storage", class {});
        vi.stubGlobal("window", { localStorage: { getItem: (key: string) => (kept.has(key) ? kept.get(key) : null), setItem: (key: string, value: string) => kept.set(key, value) } });

        expect(SaveOnLeave(lookedAround(blank()), LevelContent(blank()))).toBe(false);
        expect(LoadSavedLevel()).toBeUndefined();
        expect(SaveOnLeave(painted(), LevelContent(blank()))).toBe(true);
        expect(LevelContent(LoadSavedLevel())).toBe(LevelContent(painted()));
        expect(SaveOnLeave(painted(), LevelContent(blank()))).toBe(false);

        kept.set("dungeonLevel", "{ not json");
        expect(SaveOnLeave(blank(), LevelContent(blank()))).toBe(false);
        expect(SaveOnLeave(painted(), LevelContent(blank()))).toBe(true);
        SaveLevel(blank());
        expect(SaveOnLeave(blank(), LevelContent(painted()))).toBe(false);
    });
});
