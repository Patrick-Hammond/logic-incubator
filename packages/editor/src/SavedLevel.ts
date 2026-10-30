import { LoadFromLocalStorage, SaveToLocalStorage } from "@logic-incubator/lib/io/Storage";
import { LevelFile, LevelVersion, MigrateLevelFile } from "@logic-incubator/engine/level/LevelFormat";
import { IEditorState } from "./stores/EditorStore";
import { LevelDataState } from "./stores/LevelDataStore";

/**
 * The level the editor keeps in localStorage: saved when Enter hands it to the game to play (a dev
 * build's game reads it back with `LoadSavedLevel`), and restored when the editor starts, so a page
 * reload carries on where you left off.
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
