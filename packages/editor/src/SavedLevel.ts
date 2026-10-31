import { LoadFromLocalStorage, SaveToLocalStorage } from "@logic-incubator/lib/io/Storage";
import { LevelFile, LevelVersion, MigrateLevelFile } from "@logic-incubator/engine/level/LevelFormat";
import { IEditorState } from "./stores/EditorStore";
import { LevelDataState } from "./stores/LevelDataStore";

/**
 * The level the editor keeps in localStorage: saved when Enter hands it to the game to play (a dev
 * build's game reads it back with `LoadSavedLevel`) and as the page goes, if it's changed (see
 * `SaveOnLeave`), and restored when the editor starts, so a page reload carries on where you left off.
 */
const KEY = "dungeonLevel";

/** What the editor saves - a `LevelFile` (so the engine can load it), with the editor's whole state riding along in `editorData`. */
export type EditorSave = LevelFile & { editorData: IEditorState; levelData: LevelDataState };

/** What gets saved from the editor's two stores - the same for Enter (play), S (to a file) and the sprite editor's reload - as the current version of the format. */
export function MakeEditorSave(editorData: IEditorState, levelData: LevelDataState): EditorSave {
    return { version: LevelVersion, editorData, levelData };
}

/**
 * A level opened in the editor - its own save, or a file loaded with L - brought up to date if it's from the version before
 * (see `MigrateLevelFile`), or why it can't be opened: it's older than that, or newer than this editor.
 */
export function OpenEditorSave(file: EditorSave): { save: EditorSave; error?: undefined } | { save?: undefined; error: string } {
    try {
        return { save: MigrateLevelFile(file) };
    } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
    }
}

export function SaveLevel(save: EditorSave): void {
    SaveToLocalStorage(KEY, JSON.stringify(save));
}

/** The editor's last save, or undefined if there isn't one. */
export function LoadSavedLevel(): EditorSave | undefined {
    const data = LoadFromLocalStorage(KEY);
    return data ? JSON.parse(data) : undefined;
}

/** A layer's fields that are only how the editor shows it, which `LevelContent` leaves out. */
const LAYER_VIEW_FIELDS = ["selected", "visible"];

/**
 * The level itself in a save - its brushes, quests and layers - as a string to tell two apart by: not where the view is, the
 * tool or the brush in hand, or which layer is selected or hidden.
 */
export function LevelContent(save: Pick<EditorSave, "editorData" | "levelData">): string {
    const layers = JSON.stringify(save.editorData.layers, (key, value) => (LAYER_VIEW_FIELDS.indexOf(key) >= 0 ? undefined : value));
    return JSON.stringify(save.levelData) + layers;
}

/**
 * Whether `now`, the editor's level, should be saved as the page goes (see `SaveOnLeave`): when it isn't the level `stored`. But
 * when nothing this editor can open is stored, only once it's changed from `opened`, the `LevelContent` it started with - so a
 * visit that changed nothing leaves no blank map behind, for the game to play in place of its own level, or over a save from
 * a newer version.
 */
export function NeedsSaveOnLeave(now: EditorSave, stored: EditorSave | undefined, opened: string): boolean {
    const kept = stored && OpenEditorSave(stored).save;
    return LevelContent(now) !== (kept ? LevelContent(kept) : opened);
}

/**
 * Saves `now` as `SaveLevel` does, if `NeedsSaveOnLeave` says so: for the editor to call as the page goes (a closed tab or
 * browser, a reload), so painting that was never played isn't lost. A stored save that can't be read counts as none. Returns
 * whether it saved.
 */
export function SaveOnLeave(now: EditorSave, opened: string): boolean {
    let needed: boolean;
    try {
        needed = NeedsSaveOnLeave(now, LoadSavedLevel(), opened);
    } catch {
        needed = NeedsSaveOnLeave(now, undefined, opened);
    }
    if (needed) {
        SaveLevel(now);
    }
    return needed;
}
