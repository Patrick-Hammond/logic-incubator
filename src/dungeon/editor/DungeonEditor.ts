import {AssetPath} from "./Constants";
import EditorComponent from "./EditorComponent";
import {EditorActions} from "./stores/EditorStore";
import BrushTool from "./views/Brush";
import Canvas from "./views/Canvas";
import Keyboard from "./views/Keyboard";
import Layers from "./views/layers/Layers";
import Menu from "./views/Menu";
import Palette from "./views/Palette";
import SelectedBrush from "./views/SelectedBrush";

export class DungeonEditor extends EditorComponent {
    constructor() {
        super();

        this.loader.LoadSpriteSheet(AssetPath + "spritesheet.json", /^.+(?=_f)/, () => {
            this.game.loader.add([
                {name: "icon-eye", url: AssetPath + "icons/eye.png"},
                {name: "icon-eye-slash", url: AssetPath + "icons/eye-slash.png"},
                {name: "icon-arrow-down", url: AssetPath + "icons/arrow-down.png"},
                {name: "icon-arrow-up", url: AssetPath + "icons/arrow-up.png"},
                {name: "icon-edit", url: AssetPath + "icons/edit.png"},
                {name: "icon-plus", url: AssetPath + "icons/plus.png"},
                {name: "icon-minus", url: AssetPath + "icons/minus.png"},
                {name: "icon-data", url: AssetPath + "icons/data.png"},
                {name: "data-square", url: AssetPath + "icons/square.png"},
                {name: "small-font", url: AssetPath + "fonts/small-font-export.fnt"}
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
        new Keyboard();
        new Menu();

        // render inital
        this.editorStore.Dispatch({type: EditorActions.REFRESH});
    }
}
