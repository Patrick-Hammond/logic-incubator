import FileUtils from "../../../_lib/utils/FileUtils";
import {GridBounds, KeyCodes, Scenes, TileSize} from "../Constants";
import EditorComponent from "../EditorComponent";
import {GenerateMap, IMap, MapType} from "../maps/Generators";
import {Style0x7} from "../maps/Style0x7";
import {ApplyMapStyle} from "../maps/Styler";
import {EditorActions, IState} from "../stores/EditorStore";
import {LevelDataActions, LevelDataState} from "../stores/LevelDataStore";

export default class Keyboard extends EditorComponent {

    constructor() {

        super();

        this.editorStore.Subscribe(this.Render, this);

        // keyboard commands
        document.onkeydown = (e: KeyboardEvent) => {

            if(e.keyCode === KeyCodes.ENTER) {
                const scene = this.editorStore.state.currentScene === Scenes.GAME ? Scenes.EDITOR : Scenes.GAME;
                this.editorStore.Dispatch({type: EditorActions.CHANGE_SCENE, data: {name: scene}});
            }

            if(this.editorStore.state.currentScene === Scenes.EDITOR) {
                switch(e.keyCode) {
                    case KeyCodes.UP:
                        this.editorStore.Dispatch({type: EditorActions.BRUSH_NUDGE, data: {nudge: {x: 0, y: 1}}});
                        break;
                    case KeyCodes.DOWN:
                        this.editorStore.Dispatch({type: EditorActions.BRUSH_NUDGE, data: {nudge: {x: 0, y: -1}}});
                        break;
                    case KeyCodes.LEFT:
                        this.editorStore.Dispatch({type: EditorActions.BRUSH_NUDGE, data: {nudge: {x: 1, y: 0}}});
                        break;
                    case KeyCodes.RIGHT:
                        this.editorStore.Dispatch({type: EditorActions.BRUSH_NUDGE, data: {nudge: {x: -1, y: 0}}});
                        break;
                    case KeyCodes.H:
                        this.editorStore.Dispatch({type: EditorActions.FLIP_BRUSH_H});
                        break;
                    case KeyCodes.V:
                        this.editorStore.Dispatch({type: EditorActions.FLIP_BRUSH_V});
                        break;
                    case KeyCodes.R:
                        this.editorStore.Dispatch({type: EditorActions.ROTATE_BRUSH});
                        break;
                    case KeyCodes.Z:
                        if(e.ctrlKey) {
                            this.levelDataStore.Undo();
                        }
                        break;
                    case KeyCodes.D:
                        if(e.shiftKey) {
                            this.editorStore.Dispatch({type: EditorActions.DUPLICATE_LAYER});
                            this.levelDataStore.Dispatch({
                                type: LevelDataActions.COPY,
                                data: {
                                    sourceLayer: this.editorStore.SelectedLayer,
                                    destLayer: this.editorStore.state.layers[this.editorStore.state.layers.length - 1]
                                }
                            });
                        }
                        break;
                    case KeyCodes.PLUS:
                        this.editorStore.Dispatch({type: EditorActions.DATA_BRUSH_INC});
                        break;
                    case KeyCodes.MINUS:
                        this.editorStore.Dispatch({type: EditorActions.DATA_BRUSH_DEC});
                        break;
                    case KeyCodes.S:
                        FileUtils.SaveTextFile("dungeonLevel.txt", JSON.stringify({
                            editorData: this.editorStore.state,
                            levelData: this.levelDataStore.state
                        }));
                        break;
                    case KeyCodes.L:
                        FileUtils.ShowOpenFileDialog().then((fileList: FileList) => {
                            FileUtils.LoadTextFile(fileList[0]).then((text: string) => {
                                const data = JSON.parse(text);
                                this.editorStore.Load(data.editorData);
                                this.levelDataStore.Load(data.levelData);
                            });
                        });
                        break;
                    case KeyCodes.Q:
                        if(e.ctrlKey) {
                            const ok = confirm("This will delete the current map. Are you sure?");
                            if(ok) {
                                this.editorStore.Dispatch({type: EditorActions.RESET, data: {persistZoom: false}});
                                this.levelDataStore.Dispatch({type: LevelDataActions.RESET});
                            }
                        }
                        break;
                    case KeyCodes.ONE:      // digger
                    case KeyCodes.TWO:      // rogue
                    case KeyCodes.THREE:    // uniform
                    case KeyCodes.FOUR:     // divided maze
                    case KeyCodes.FIVE:     // eller maze
                    case KeyCodes.SIX:      // icey maze
                    case KeyCodes.SEVEN: {
                        const ok = confirm("This will delete the current map. Are you sure?");
                        if(ok) {
                            this.editorStore.Dispatch({type: EditorActions.RESET, data: {persistZoom: true}});
                            this.levelDataStore.Dispatch({type: LevelDataActions.RESET});

                            const scaledTileSize = TileSize * this.editorStore.state.viewScale;
                            const w = GridBounds.width / scaledTileSize;
                            const h = GridBounds.height / scaledTileSize;

                            const mapType: MapType = e.keyCode - KeyCodes.ONE;
                            let map: IMap = GenerateMap(mapType, w, h);
                            map = ApplyMapStyle(map, new Style0x7());
                            this.levelDataStore.Load({levelData: map.levelData} as LevelDataState);
                        }
                        break;
                    }
                    default: {
                        this.editorStore.Dispatch({type: EditorActions.KEY_DOWN, data: {keyCode: e.keyCode}});
                        break;
                    }
                }
            }
        }

        document.onkeyup = (e: KeyboardEvent) => {
            if(this.editorStore.state.currentScene === Scenes.EDITOR) {
                this.editorStore.Dispatch({type: EditorActions.KEY_UP, data: {keyCode: e.keyCode}});
            }
        }

        // disable context menu
        document.body.oncontextmenu = () => false;
    }

    private Render(prevState: IState, state: IState): void {
        if(prevState.currentScene !== state.currentScene) {
            this.game.ShowScene(state.currentScene);
        }
    }
}
