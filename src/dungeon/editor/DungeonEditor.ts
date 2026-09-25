import { LoadFromLocalStorage } from "../../_lib/io/Storage";
import EditorComponent from "./EditorComponent";
import EditorOverlay from "./ui/dom/EditorOverlay";
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

        // The DOM panels go with the editor scene: shown now (this runs as it's first shown), and
        // hidden while SceneManager has it off the stage for the game, title or character select.
        const overlay = EditorOverlay.inst;
        overlay.SetVisible(true);
        this.root.on("added", () => overlay.SetVisible(true));
        this.root.on("removed", () => overlay.SetVisible(false));

        // load local saved map
        const localData = LoadFromLocalStorage("dungeonLevel");
        if (localData) {
            const data = JSON.parse(localData);
            this.editorStore.Load(data.editorData);
            this.levelDataStore.Load(data.levelData);
        }
    }
}
