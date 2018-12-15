import GameComponent from "../../../_lib/GameComponent";
import EditorStore from "./stores/EditorStore";
import LevelDataStore from "./stores/LevelDataStore";

export default abstract class EditorComponent extends GameComponent {
    private static _editorStore: EditorStore;
    private static _levelDataStore: LevelDataStore;

    public get editorStore(): EditorStore {
        if(!EditorComponent._editorStore) {
            EditorComponent._editorStore = new EditorStore();
        }
        return EditorComponent._editorStore;
    }
    public get levelDataStore(): LevelDataStore {
        if(!EditorComponent._levelDataStore) {
            EditorComponent._levelDataStore = new LevelDataStore(20);
        }
        return EditorComponent._levelDataStore;
    }
}