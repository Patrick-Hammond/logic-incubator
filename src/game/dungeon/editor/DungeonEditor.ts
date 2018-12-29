
import FileUtils from "../../../_lib/utils/FileUtils";
import {AssetPath, GridBounds, KeyCodes, TileSize} from "./Constants";
import EditorComponent from "./EditorComponent";
import {GenerateMap, IMap, MapType} from "./maps/Generators";
import {Style0x7} from "./maps/Style0x7";
import {ApplyMapStyle} from "./maps/Styler";
import {EditorActions} from "./stores/EditorStore";
import {LevelDataActions, LevelDataState} from "./stores/LevelDataStore";
import {ShowHelp} from "./ui/Help";
import {BrushTool} from "./views/Brush";
import {Canvas} from "./views/Canvas";
import {Palette} from "./views/Palette";

export class DungeonEditor extends EditorComponent {
    constructor() {
        super();

        this.loader.LoadSpriteSheet(AssetPath, /^.+(?=_f)/, () => this.Create());
    }

    private Create(): void {
        // views
        new Canvas();
        new BrushTool();
        new Palette();

        // help
        ShowHelp();

        // keyboard commands
        document.onkeydown = (e: KeyboardEvent) => {
            switch(e.keyCode) {
                case KeyCodes.UP:
                    this.editorStore.Dispatch({type: EditorActions.NUDGE, data: {nudge: {x: 0, y: 1}}});
                    break;
                case KeyCodes.DOWN:
                    this.editorStore.Dispatch({type: EditorActions.NUDGE, data: {nudge: {x: 0, y: -1}}});
                    break;
                case KeyCodes.LEFT:
                    this.editorStore.Dispatch({type: EditorActions.NUDGE, data: {nudge: {x: 1, y: 0}}});
                    break;
                case KeyCodes.RIGHT:
                    this.editorStore.Dispatch({type: EditorActions.NUDGE, data: {nudge: {x: -1, y: 0}}});
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
                case KeyCodes.PLUS:
                    this.editorStore.Dispatch({type: EditorActions.ZOOM_IN});
                    this.levelDataStore.Dispatch({type: LevelDataActions.REFRESH});
                    break;
                case KeyCodes.MINUS:
                    this.editorStore.Dispatch({type: EditorActions.ZOOM_OUT});
                    this.levelDataStore.Dispatch({type: LevelDataActions.REFRESH});
                    break;
                case KeyCodes.S:
                    FileUtils.SaveTextFile("dungeonLevel.txt", this.levelDataStore.SerializeJSON());
                    break;
                case KeyCodes.L:
                    FileUtils.ShowOpenFileDialog().then((fileList: FileList) => {
                        FileUtils.LoadTextFile(fileList[ 0 ]).then((text: string) => {
                            this.levelDataStore.LoadJSON(text);
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
                default:
                    this.editorStore.Dispatch({type: EditorActions.KEY_DOWN, data: {keyCode: e.keyCode}});
                    break;
            }
        }

        document.onkeyup = (e: KeyboardEvent) => {
            if(e.keyCode === KeyCodes.SPACE) {
                this.editorStore.Dispatch({type: EditorActions.KEY_UP});
            }
        }

        // disable context menu
        document.body.oncontextmenu = () => false;

        // render inital
        this.editorStore.Dispatch({type: EditorActions.REFRESH});
    }
}
