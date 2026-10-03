import GameComponent from "@logic-incubator/lib/game/GameComponent";
import EditorStore from "./stores/EditorStore";
import LevelDataStore from "./stores/LevelDataStore";

/** A piece of the editor: a `GameComponent` with the editor's shared stores to hand. Its setup goes in `OnInitialise`, like any other component's. */
export default abstract class EditorComponent extends GameComponent {
    private static _editorStore: EditorStore;
    private static _levelDataStore: LevelDataStore;

    /** Forgets the shared stores and what they hold: the next editor starts from a blank map and the default settings. Safe to call twice. */
    static DestroyStores(): void {
        EditorComponent._editorStore = undefined;
        EditorComponent._levelDataStore = undefined;
    }

    protected get editorStore(): EditorStore {
        if (!EditorComponent._editorStore) {
            EditorComponent._editorStore = new EditorStore();
        }
        return EditorComponent._editorStore;
    }
    protected get levelDataStore(): LevelDataStore {
        if (!EditorComponent._levelDataStore) {
            EditorComponent._levelDataStore = new LevelDataStore(20);
        }
        return EditorComponent._levelDataStore;
    }
}
