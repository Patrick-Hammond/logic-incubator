import {AssetPath} from "./Constants";
import EditorComponent from "./EditorComponent";
import {RegisterKeyboardEvents} from "./interaction/Keyboard";
import {EditorActions} from "./stores/EditorStore";
import {ShowHelp} from "./ui/Help";
import BrushTool from "./views/Brush";
import Canvas from "./views/Canvas";
import Layers from "./views/Layers";
import Palette from "./views/Palette";
import SelectedBrush from "./views/SelectedBrush";

export class DungeonEditor extends EditorComponent {
    constructor() {
        super();

        this.loader.LoadSpriteSheet(AssetPath + "spritesheet.json", /^.+(?=_f)/, () => {
            this.game.loader.add([
                {name: "icon_eye", url: AssetPath + "icons/eye.svg"},
                {name: "icon_eye_slash", url: AssetPath + "icons/eye-slash.svg"}
            ]);
            this.game.loader.load(() => this.Create());
        });
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
