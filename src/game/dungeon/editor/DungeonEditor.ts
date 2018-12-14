
import EditorComponent from "./EditorComponent";
import {Palette} from "./views/Palette";
import {BrushTool} from "./views/Brush";
import {Canvas} from "./views/Canvas";
import {EditorActions} from "./stores/EditorStore";
import {LevelDataActions} from "./stores/LevelDataStore";
import {AssetPath, KeyCodes} from "./Constants";
import FileUtils from "../../../_lib/utils/FileUtils";
import Game from "../../../_lib/Game";

export class DungeonEditor extends EditorComponent
{
    constructor()
    {
        super();

        this.loader.LoadSpriteSheet(AssetPath, /^.+(?=_f)/, () => this.Create());
    }

    private Create(): void
    {
        //views
        new Canvas();
        new BrushTool();
        new Palette();

        //keyboard commands
        document.onkeydown = (e: KeyboardEvent) =>
        {
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
                    FileUtils.SaveTextFile("_dungeonLevel.txt", this.levelDataStore.Serialize());
                    break;
                case KeyCodes.L:
                    FileUtils.ShowOpenFileDialog().then((fileList: FileList) =>
                    {
                        FileUtils.LoadTextFile(fileList[ 0 ]).then((text: string) =>
                        {
                            this.levelDataStore.Load(text);
                        });
                    });
                    break;
                case KeyCodes.Q:
                    if(e.ctrlKey) {
                        let ok = confirm("This will delete the current map. Are you sure?");
                        if(ok) {
                            this.levelDataStore.Dispatch({type: LevelDataActions.RESET});
                        }
                    }
                    break;
            }
        }

        //mouse wheel zooming
        this.game.view.onwheel = (e: WheelEvent) =>
        {
            if(this.editorStore.state.gridBounds.contains(e.offsetX, e.offsetY)) {
                if(e.deltaY < 0) {
                    this.editorStore.Dispatch({type: EditorActions.ZOOM_IN});
                }
                else if(e.deltaY > 0) {
                    this.editorStore.Dispatch({type: EditorActions.ZOOM_OUT});
                }
                this.levelDataStore.Dispatch({type: LevelDataActions.REFRESH});
            }
        }

        //disable context menu
        document.body.oncontextmenu = () => false;

        //render inital
        this.editorStore.Dispatch({type: EditorActions.REFRESH});
    }
}