import { LoadFromLocalStorage } from "../../_lib/io/Storage";
import EditorComponent from "./EditorComponent";
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

        // load local saved map
        const localData = LoadFromLocalStorage("dungeonLevel");
        if (localData) {
            const data = JSON.parse(localData);
            this.editorStore.Load(data.editorData);
            this.levelDataStore.Load(data.levelData);
        }
    }
}
