import {AssetPath} from "./Constants";
import EditorComponent from "./EditorComponent";
import {RegisterKeyboardEvents} from "./interaction/Keyboard";
import {EditorActions} from "./stores/EditorStore";
import {ShowHelp} from "./ui/Help";
import {BrushTool} from "./views/Brush";
import {Canvas} from "./views/Canvas";
import {Layers} from "./views/Layers";
import {Palette} from "./views/Palette";
import {SelectedBrush} from "./views/SelectedBrush";

export class DungeonEditor extends EditorComponent {
    constructor() {
        super();

        this.loader.LoadSpriteSheet(AssetPath, /^.+(?=_f)/, () => this.Create());
    }

    private Create(): void {

        // views
        new Canvas();
        new BrushTool();
        new Palette();
        new Layers();
        new SelectedBrush();

        // render inital
        this.editorStore.Dispatch({type: EditorActions.REFRESH});

        // interaction
        RegisterKeyboardEvents(this.editorStore, this.levelDataStore);

         // help
        ShowHelp();
    }
}
