import GameComponent from "../../_lib/game/GameComponent";
import EditorStore from "./stores/EditorStore";
import LevelDataStore from "./stores/LevelDataStore";

export default abstract class EditorComponent extends GameComponent {
    private static _editorStore: EditorStore;
    private static _levelDataStore: LevelDataStore;
    private created: boolean = false;

    constructor() {
        super();

        this.root.on("added", () => {
            if(!this.created) {
                this.created = true;
                this.Create();
            }
        });
    }

    protected get editorStore(): EditorStore {
        if(!EditorComponent._editorStore) {
            EditorComponent._editorStore = new EditorStore();
        }
        return EditorComponent._editorStore;
    }
    protected get levelDataStore(): LevelDataStore {
        if(!EditorComponent._levelDataStore) {
            EditorComponent._levelDataStore = new LevelDataStore(20);
        }
        return EditorComponent._levelDataStore;
    }

    protected abstract Create(): void;
}
