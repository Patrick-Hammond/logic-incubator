
import EditorComponent from "./EditorComponent";
import { Palette } from "./views/Palette";
import { BrushTool } from "./views/Brush";
import { Canvas } from "./views/Canvas";
import { EditorActions } from "./stores/EditorStore";
import { LevelDataActions } from "./stores/LevelDataStore";

export interface Brush { name: string; position?: { x: number, y: number }; layer: number; };

export class DungeonEditor extends EditorComponent {
    constructor() {
        super();

        this.loader.LoadSpriteSheet("http://localhost:4000/dist-include/spritesheet.json", /^.+(?=_f)/, () => {
            this.Create();
        });
    }

    private Create(): void {

        new Canvas();
        new BrushTool();
        new Palette();

        //keyboard commands
        document.onkeydown = (e: KeyboardEvent) => {
            if (e.keyCode == 32) {
                this.editorStore.Dispatch({ type: EditorActions.NEXT_PALETTE });
            }
            if (e.keyCode == 90 && e.ctrlKey) {
                this.levelDataStore.Undo();
            }
            if (e.keyCode == 107) {
                this.editorStore.Dispatch({ type: EditorActions.ZOOM_IN });
                this.levelDataStore.Dispatch({ type: LevelDataActions.REFRESH });
            }
            if (e.keyCode == 109) {
                this.editorStore.Dispatch({ type: EditorActions.ZOOM_OUT });
                this.levelDataStore.Dispatch({ type: LevelDataActions.REFRESH });
            }
        }

        //disable context menu
        document.body.oncontextmenu = () => false;

        //render inital
        this.editorStore.Dispatch({ type: EditorActions.REFRESH });
    }
}