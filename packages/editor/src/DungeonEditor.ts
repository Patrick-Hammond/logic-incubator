import { LEVEL_CREATED } from "@logic-incubator/engine/Events";
import { Scenes } from "@logic-incubator/engine/Constants";
import EditorComponent from "./EditorComponent";
import { IStyler } from "./maps/Styler";
import { LoadSavedLevel } from "./SavedLevel";
import { DataBrushIcons, EditorActions } from "./stores/EditorStore";
import { RemoveInjectedStyles } from "./ui/dom/Dom";
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

    protected OnInitialise(): void {
        // Keeps Enter's editor/game toggle (see Keyboard.ts) correct even when Scenes.GAME is
        // reached some other way (the game's own title/character-select flow, not Enter) - without
        // this, currentScene stays at its default (EDITOR) forever if the editor scene is never
        // shown first, so the first Enter press from gameplay would think it's toggling FROM the
        // editor and just stay on the game. LEVEL_CREATED fires whenever gameplay actually starts
        // (DungeonMain, every scene-show and restart), regardless of how it was reached. Listened
        // for the editor's whole life, not just while it's showing - under a title-screen-first boot
        // it may well not be showing when gameplay starts.
        this.Listen(this.game.dispatcher, LEVEL_CREATED, () => {
            if (this.editorStore.state.currentScene !== Scenes.GAME) {
                this.editorStore.Dispatch({ type: EditorActions.CHANGE_SCENE, data: { name: Scenes.GAME } });
            }
        });

        // views
        this.Attach(new Canvas());
        this.Attach(new BrushTool());
        this.Attach(new Tools());
        this.Attach(new Palette(this.options.dataBrushIcons));
        this.Attach(new Layers());
        this.Attach(new SelectedBrush(this.options.dataBrushIcons));
        this.Attach(new Toolbar());
        this.Attach(new Keyboard(this.options.titleScene, this.options.mapStyle));
        this.Attach(new Menu(this.options.titleScene));

        // The DOM panels (made visible by the first `EditorOverlay.inst`) go with the editor scene:
        // off until it's shown - see `OnShow`.
        EditorOverlay.inst.SetVisible(false);

        // load local saved map
        const saved = LoadSavedLevel();
        if (saved) {
            this.editorStore.Load(saved.editorData);
            this.levelDataStore.Load(saved.levelData);
        }
    }

    /** The views are gone by now, and have taken their own panels off the page; this lets go of what they shared. */
    protected OnDestroy(): void {
        EditorOverlay.Destroy();
        RemoveInjectedStyles();
        EditorComponent.DestroyStores();
    }

    /** The DOM panels are shown while the editor has the stage... */
    protected OnShow(): void {
        EditorOverlay.inst.SetVisible(true);
    }

    /** ...and hidden while the game, or any of the game's own scenes, has it. */
    protected OnHide(): void {
        EditorOverlay.inst.SetVisible(false);
    }
}
