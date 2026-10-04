import {Key} from "@logic-incubator/lib/io/Keyboard";
import {LoadTextFile, SaveTextFile, ShowOpenFileDialog} from "@logic-incubator/lib/io/Storage";
import { Scenes, TileSize } from "@logic-incubator/engine/Constants";
import { GridBounds } from "../Layout";
import EditorComponent from "../EditorComponent";
import {GenerateMap, IMap, MapType} from "../maps/Generators";
import {ApplyMapStyle, IStyler} from "../maps/Styler";
import {GenerateZTest} from "../maps/ZTest";
import {EditorSave, SaveLevel} from "../SavedLevel";
import {EditorActions, IEditorState, IMPLICIT_LAYER_ID} from "../stores/EditorStore";
import {LevelDataActions, LevelDataState} from "../stores/LevelDataStore";

export default class Keyboard extends EditorComponent {
    /** `mapStyle`: the game's tiles for the maps keys 1-8 generate - see `IDungeonEditorOptions`. */
    constructor(private readonly titleScene?: string, private readonly mapStyle?: IStyler) {
        super();
    }

    protected OnInitialise(): void {
        this.Own(this.editorStore.Subscribe(this.Render, this));

        // keyboard commands - for the editor's life, not just while it's showing: Enter is also the way back in from the game.
        this.Listen(this.game.keyboard, "keydown", (e: KeyboardEvent) => {
            const shift = this.game.keyboard.KeyPressed(Key.Shift);
            const ctrl = this.game.keyboard.KeyPressed(Key.Ctrl);

            if (e.keyCode === Key.Enter) {
                const isEditor = this.editorStore.state.currentScene === Scenes.EDITOR;
                if (isEditor) {
                    SaveLevel(this.LevelFile());
                }

                const scene = isEditor ? Scenes.GAME : Scenes.EDITOR;
                this.editorStore.Dispatch({ type: EditorActions.CHANGE_SCENE, data: { name: scene } });
            }

            if (this.editorStore.state.currentScene === Scenes.EDITOR) {
                switch (e.keyCode) {
                    case Key.UpArrow:
                        this.editorStore.Dispatch({ type: EditorActions.BRUSH_NUDGE, data: { nudge: { x: 0, y: 1 } } });
                        break;
                    case Key.DownArrow:
                        this.editorStore.Dispatch({ type: EditorActions.BRUSH_NUDGE, data: { nudge: { x: 0, y: -1 } } });
                        break;
                    case Key.LeftArrow:
                        this.editorStore.Dispatch({ type: EditorActions.BRUSH_NUDGE, data: { nudge: { x: 1, y: 0 } } });
                        break;
                    case Key.RightArrow:
                        this.editorStore.Dispatch({ type: EditorActions.BRUSH_NUDGE, data: { nudge: { x: -1, y: 0 } } });
                        break;
                    case Key.H:
                        this.editorStore.Dispatch({ type: EditorActions.FLIP_BRUSH_H });
                        break;
                    case Key.V:
                        this.editorStore.Dispatch({ type: EditorActions.FLIP_BRUSH_V });
                        break;
                    case Key.R:
                        this.editorStore.Dispatch({ type: EditorActions.ROTATE_BRUSH });
                        break;
                    case Key.Z:
                        if (ctrl) {
                            this.levelDataStore.Undo();
                        }
                        break;
                    case Key.D:
                        // There's only ever the one "attributes" layer - and COPY below would otherwise
                        // copy into whatever layer happens to be last.
                        if (shift && this.editorStore.SelectedLayer && this.editorStore.SelectedLayer.id !== IMPLICIT_LAYER_ID) {
                            this.editorStore.Dispatch({ type: EditorActions.DUPLICATE_LAYER });
                            this.levelDataStore.Dispatch({
                                type: LevelDataActions.COPY,
                                data: {
                                    sourceLayer: this.editorStore.SelectedLayer,
                                    destLayer: this.editorStore.state.layers[this.editorStore.state.layers.length - 1]
                                }
                            });
                        }
                        break;
                    case Key.Add:
                    case Key.Period:
                        this.editorStore.Dispatch({ type: EditorActions.DATA_BRUSH_INC });
                        break;
                    case Key.Subtract:
                    case Key.Comma:
                        this.editorStore.Dispatch({ type: EditorActions.DATA_BRUSH_DEC });
                        break;
                    case Key.S:
                        SaveTextFile("dungeonLevel.txt", JSON.stringify(this.LevelFile()));
                        break;
                    case Key.L:
                        ShowOpenFileDialog().then((fileList: FileList) => {
                            LoadTextFile(fileList[0]).then((text: string) => {
                                const data = JSON.parse(text);
                                this.editorStore.Load(data.editorData);
                                this.levelDataStore.Load(data.levelData);
                            });
                        });
                        break;
                    case Key.Q:
                        if (ctrl) {
                            const ok = confirm("This will delete the current map. Are you sure?");
                            if (ok) {
                                this.editorStore.Dispatch({ type: EditorActions.RESET, data: { persistZoom: false } });
                                this.levelDataStore.Dispatch({ type: LevelDataActions.RESET });
                            }
                        }
                        break;
                    case Key.T:
                        // Preview the game's own front end (e.g. title -> character select -> game), if
                        // it gave the editor a title scene. Separate from the Enter key (which still
                        // toggles editor <-> game directly) so the fast editor/game dev loop is untouched.
                        // Dispatched the same way as the Enter key's own scene change, so
                        // editorStore.currentScene stays consistent.
                        if (this.titleScene) {
                            this.editorStore.Dispatch({ type: EditorActions.CHANGE_SCENE, data: { name: this.titleScene } });
                        }
                        break;
                    case Key.One: // digger
                    case Key.Two: // rogue
                    case Key.Three: // uniform
                    case Key.Four: // divided maze
                    case Key.Five: // eller maze
                    case Key.Six: // icey maze
                    case Key.Seven: {
                        // Generated maps are laid out in the game's tiles - nothing to do without its style.
                        if (!this.mapStyle) {
                            break;
                        }
                        const ok = confirm("This will delete the current map. Are you sure?");
                        if (ok) {
                            this.editorStore.Dispatch({ type: EditorActions.RESET, data: { persistZoom: true } });
                            this.levelDataStore.Dispatch({ type: LevelDataActions.RESET });

                            const scaledTileSize = TileSize * this.editorStore.state.viewScale;
                            const w = GridBounds.width / scaledTileSize;
                            const h = GridBounds.height / scaledTileSize;

                            const mapType: MapType = e.keyCode - Key.One;
                            let map: IMap = GenerateMap(mapType, w, h, this.mapStyle);
                            map = ApplyMapStyle(map, this.mapStyle);
                            this.levelDataStore.Load({ levelData: map.levelData } as LevelDataState);
                        }
                        break;
                    }
                    case Key.Eight: {
                        // per-tile z / scaling test map
                        if (!this.mapStyle) {
                            break;
                        }
                        const ok = confirm("This will delete the current map. Are you sure?");
                        if (ok) {
                            this.editorStore.Dispatch({ type: EditorActions.RESET, data: { persistZoom: true } });
                            this.levelDataStore.Dispatch({ type: LevelDataActions.RESET });
                            this.levelDataStore.Load({ levelData: GenerateZTest(this.mapStyle) } as LevelDataState);
                        }
                        break;
                    }
                }
            }
        });

        // disable context menu
        const contextMenu = document.body.oncontextmenu;
        document.body.oncontextmenu = () => false;
        this.Own(() => (document.body.oncontextmenu = contextMenu));
    }

    /** What Enter and S save: the engine's level format, with the rest of the editor's state riding along in `editorData`. */
    private LevelFile(): EditorSave {
        return { editorData: this.editorStore.state, levelData: this.levelDataStore.state };
    }

    private Render(prevState: IEditorState, state: IEditorState): void {
        if (prevState.currentScene !== state.currentScene) {
            this.game.sceneManager.ShowScene(state.currentScene);
        }
    }
}
