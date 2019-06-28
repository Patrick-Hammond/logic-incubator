import { Key } from "../../../_lib/io/Keyboard";
import { LoadTextFile, SaveTextFile, SaveToLocalStorage, ShowOpenFileDialog } from "../../../_lib/io/Storage";
import { GridBounds, Scenes, TileSize } from "../../Constants";
import EditorComponent from "../EditorComponent";
import { GenerateMap, IMap, MapType } from "../maps/Generators";
import { Style0x7 } from "../maps/Style0x7";
import { ApplyMapStyle } from "../maps/Styler";
import { EditorActions, IState } from "../stores/EditorStore";
import { LevelDataActions, LevelDataState } from "../stores/LevelDataStore";

export default class Keyboard extends EditorComponent {
    constructor() {
        super();

        this.Create();
    }

    protected Create(): void {
        this.editorStore.Subscribe(this.Render, this);

        // keyboard commands
        this.game.keyboard.on("keydown", (e: KeyboardEvent) => {
            const shift = this.game.keyboard.KeyPressed(Key.Shift);
            const ctrl = this.game.keyboard.KeyPressed(Key.Ctrl);

            if (e.keyCode === Key.Enter) {
                const isEditor = this.editorStore.state.currentScene === Scenes.EDITOR;
                if (isEditor) {
                    SaveToLocalStorage(
                        "dungeonLevel",
                        JSON.stringify({
                            editorData: this.editorStore.state,
                            levelData: this.levelDataStore.state
                        })
                    );
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
                        if (shift) {
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
                        this.editorStore.Dispatch({ type: EditorActions.DATA_BRUSH_INC });
                        break;
                    case Key.Subtract:
                        this.editorStore.Dispatch({ type: EditorActions.DATA_BRUSH_DEC });
                        break;
                    case Key.S:
                        SaveTextFile(
                            "dungeonLevel.txt",
                            JSON.stringify({
                                editorData: this.editorStore.state,
                                levelData: this.levelDataStore.state
                            })
                        );
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
                    case Key.One: // digger
                    case Key.Two: // rogue
                    case Key.Three: // uniform
                    case Key.Four: // divided maze
                    case Key.Five: // eller maze
                    case Key.Six: // icey maze
                    case Key.Seven: {
                        const ok = confirm("This will delete the current map. Are you sure?");
                        if (ok) {
                            this.editorStore.Dispatch({ type: EditorActions.RESET, data: { persistZoom: true } });
                            this.levelDataStore.Dispatch({ type: LevelDataActions.RESET });

                            const scaledTileSize = TileSize * this.editorStore.state.viewScale;
                            const w = GridBounds.width / scaledTileSize;
                            const h = GridBounds.height / scaledTileSize;

                            const mapType: MapType = e.keyCode - Key.One;
                            let map: IMap = GenerateMap(mapType, w, h);
                            map = ApplyMapStyle(map, new Style0x7());
                            this.levelDataStore.Load({ levelData: map.levelData } as LevelDataState);
                        }
                        break;
                    }
                }
            }
        });

        // disable context menu
        document.body.oncontextmenu = () => false;
    }

    private Render(prevState: IState, state: IState): void {
        if (prevState.currentScene !== state.currentScene) {
            this.game.sceneManager.ShowScene(state.currentScene);
        }
    }
}
