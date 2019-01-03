import FileUtils from "../../../_lib/utils/FileUtils";
import {GridBounds, KeyCodes, TileSize} from "../Constants";
import {GenerateMap, IMap, MapType} from "../maps/Generators";
import {Style0x7} from "../maps/Style0x7";
import {ApplyMapStyle} from "../maps/Styler";
import EditorStore, {EditorActions} from "../stores/EditorStore";
import LevelDataStore, {LevelDataActions, LevelDataState} from "../stores/LevelDataStore";

export function RegisterKeyboardEvents(editorStore: EditorStore, levelDataStore: LevelDataStore) {

    // keyboard commands
    document.onkeydown = (e: KeyboardEvent) => {
        switch(e.keyCode) {
            case KeyCodes.UP:
                editorStore.Dispatch({type: EditorActions.BRUSH_NUDGE, data: {nudge: {x: 0, y: 1}}});
                break;
            case KeyCodes.DOWN:
                editorStore.Dispatch({type: EditorActions.BRUSH_NUDGE, data: {nudge: {x: 0, y: -1}}});
                break;
            case KeyCodes.LEFT:
                editorStore.Dispatch({type: EditorActions.BRUSH_NUDGE, data: {nudge: {x: 1, y: 0}}});
                break;
            case KeyCodes.RIGHT:
                editorStore.Dispatch({type: EditorActions.BRUSH_NUDGE, data: {nudge: {x: -1, y: 0}}});
                break;
            case KeyCodes.H:
                editorStore.Dispatch({type: EditorActions.FLIP_BRUSH_H});
                break;
            case KeyCodes.V:
                editorStore.Dispatch({type: EditorActions.FLIP_BRUSH_V});
                break;
            case KeyCodes.R:
                editorStore.Dispatch({type: EditorActions.ROTATE_BRUSH});
                break;
            case KeyCodes.Z:
                if(e.ctrlKey) {
                    levelDataStore.Undo();
                }
                break;
            case KeyCodes.PLUS:
                editorStore.Dispatch({type: EditorActions.DATA_BRUSH_INC});
                break;
            case KeyCodes.MINUS:
                editorStore.Dispatch({type: EditorActions.DATA_BRUSH_DEC});
                break;
            case KeyCodes.S:
                FileUtils.SaveTextFile("dungeonLevel.txt", levelDataStore.SerializeJSON());
                break;
            case KeyCodes.L:
                FileUtils.ShowOpenFileDialog().then((fileList: FileList) => {
                    FileUtils.LoadTextFile(fileList[0]).then((text: string) => {
                        levelDataStore.LoadJSON(text);
                    });
                });
                break;
            case KeyCodes.Q:
                if(e.ctrlKey) {
                    const ok = confirm("This will delete the current map. Are you sure?");
                    if(ok) {
                        editorStore.Dispatch({type: EditorActions.RESET, data: {persistZoom: false}});
                        levelDataStore.Dispatch({type: LevelDataActions.RESET});
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
                    editorStore.Dispatch({type: EditorActions.RESET, data: {persistZoom: true}});
                    levelDataStore.Dispatch({type: LevelDataActions.RESET});

                    const scaledTileSize = TileSize * editorStore.state.viewScale;
                    const w = GridBounds.width / scaledTileSize;
                    const h = GridBounds.height / scaledTileSize;

                    const mapType: MapType = e.keyCode - KeyCodes.ONE;
                    let map: IMap = GenerateMap(mapType, w, h);
                    map = ApplyMapStyle(map, new Style0x7());
                    levelDataStore.Load({levelData: map.levelData} as LevelDataState);
                }
                break;
            }
            default:
                editorStore.Dispatch({type: EditorActions.KEY_DOWN, data: {keyCode: e.keyCode}});
                break;
        }
    }

    document.onkeyup = (e: KeyboardEvent) => {
        if(e.keyCode === KeyCodes.SPACE) {
            editorStore.Dispatch({type: EditorActions.KEY_UP});
        }
    }

    // disable context menu
    document.body.oncontextmenu = () => false;
}
