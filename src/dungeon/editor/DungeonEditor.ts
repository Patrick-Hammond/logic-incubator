import {AssetPath} from "./Constants";
import EditorComponent from "./EditorComponent";
import {RegisterKeyboardEvents} from "./interaction/Keyboard";
import {RegisterMouseEvents} from "./interaction/Mouse";
import {EditorActions} from "./stores/EditorStore";
import {ShowHelp} from "./ui/Help";
import {BrushTool} from "./views/Brush";
import {Canvas} from "./views/Canvas";
import {Palette} from "./views/Palette";

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

        // render inital
        this.editorStore.Dispatch({type: EditorActions.REFRESH});

        // interaction
        RegisterKeyboardEvents(this.editorStore, this.levelDataStore);
        RegisterMouseEvents(this.editorStore, this.levelDataStore, this.game);

         // help
        ShowHelp();
    }
}
