import { LoadFromLocalStorage } from "../../_lib/io/Storage";
import EditorComponent from "./EditorComponent";
import { IStyler } from "./maps/Styler";
import { DataBrushIcons } from "./stores/EditorStore";
import EditorOverlay from "./ui/dom/EditorOverlay";
import BrushTool from "./views/Brush";
import Canvas from "./views/Canvas";
import Keyboard from "./views/Keyboard";
import Layers from "./views/layers/Layers";
import Menu from "./views/Menu";
import Palette from "./views/Palette";
import SelectedBrush from "./views/SelectedBrush";
import Toolbar from "./views/Toolbar";
import Tools from "./views/Tools";

/**
 * Loader entries the editor draws with, for the game to add to its loader (baseUrl `AssetPath`) alongside
 * its own. The files are in editor/assets, which the game's build copies into its assets folder.
 */
export const EditorResources: ReadonlyArray<{ name: string; url: string }> = [
    { name: "data-square", url: "icons/square.png" },
    { name: "small-font", url: "fonts/small-font-export.fnt" }
];

/** What the editor needs from the game: its scenes and its art. */
export interface IDungeonEditorOptions {
    /** The game's title scene, if it has one: T jumps there from the editor to preview the game's own front end. */
    titleScene?: string;
    /** The sprite over each data brush's colour in the palette and on the map. A brush without one is just its colour. */
    dataBrushIcons?: DataBrushIcons;
    /** The game's tiles for the maps keys 1-8 generate (see `IStyler`). Without one, those keys do nothing. */
    mapStyle?: IStyler;
}

export class DungeonEditor extends EditorComponent {
    constructor(private readonly options: IDungeonEditorOptions = {}) {
        super();
    }

    protected Create(): void {
        // views
        new Canvas();
        new BrushTool();
        new Tools();
        new Palette(this.options.dataBrushIcons);
        new Layers();
        new SelectedBrush(this.options.dataBrushIcons);
        new Toolbar();
        new Keyboard(this.options.titleScene, this.options.mapStyle);
        new Menu(this.options.titleScene);

        // The DOM panels go with the editor scene: shown now (this runs as it's first shown), and
        // hidden while SceneManager has it off the stage for the game or any of the game's own scenes.
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
