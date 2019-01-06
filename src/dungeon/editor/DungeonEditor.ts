import {Scenes} from "./Constants";
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

    protected Create(): void {

        // views
        new Canvas();
        new BrushTool();
        new Palette();
        new Layers();
        new SelectedBrush();
        new Keyboard();
        new Menu();

        // render inital
        this.editorStore.Dispatch({type: EditorActions.CHANGE_SCENE, data: {name: Scenes.EDITOR}});
        this.editorStore.Dispatch({type: EditorActions.REFRESH});
    }
}
