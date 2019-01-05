import {AnimationSpeed, GridBounds, KeyCodes, Scenes, TileSize} from "../Constants";
import EditorComponent from "../EditorComponent";
import {IState, MouseButtonState} from "../stores/EditorStore";
import {LevelDataActions} from "../stores/LevelDataStore";

export default class BrushTool extends EditorComponent {

    private brush: PIXI.Sprite | PIXI.extras.AnimatedSprite;

    constructor() {

        super();

        this.AddToScene(Scenes.EDITOR);

        this.editorStore.Subscribe(this.Render, this);
    }

    private Render(prevState: IState, state: IState): void {

        // scale
        const scaleChanged = state.viewScale !== prevState.viewScale || prevState.currentBrush.scale !== state.currentBrush.scale;
        if(this.brush && scaleChanged) {
            const scale = {x: state.currentBrush.scale.x * state.viewScale, y: state.currentBrush.scale.y * state.viewScale};
            this.brush.scale.set(scale.x, scale.y);
        }

        // position
        const pos = state.currentBrush.position;
        const positionChanged = prevState.currentBrush.position.x !== pos.x || prevState.currentBrush.position.y !== pos.y;
        if(this.brush && (positionChanged || scaleChanged)) {
            const scaledTileSize = TileSize * this.editorStore.state.viewScale;
            const flipOffset = {x: this.brush.scale.x < 0 ? this.brush.width : 0, y: this.brush.scale.y < 0 ? this.brush.height : 0};
            this.brush.position.set(
                pos.x * scaledTileSize + GridBounds.x + flipOffset.x,
                pos.y * scaledTileSize + GridBounds.y + flipOffset.y
            );
        }

        // rotation
        if(this.brush && prevState.currentBrush.rotation !== state.currentBrush.rotation) {
            this.brush.rotation = state.currentBrush.rotation;
        }

        // offset
        if(this.brush && prevState.currentBrush.pixelOffset !== state.currentBrush.pixelOffset) {
            this.brush.pivot.set(state.currentBrush.pixelOffset.x, state.currentBrush.pixelOffset.y);
        }

        // brush
        if(prevState.currentBrush.name !== state.currentBrush.name) {

            if(this.brush) {
                this.brush.parent.removeChild(this.brush);
                this.brush = null;
            }

            if(state.currentBrush.name !== "") {
                const scaledTileSize = TileSize * this.editorStore.state.viewScale;
                this.brush = this.assetFactory.Create(state.currentBrush.name);
                this.brush.scale.set(state.viewScale);
                this.brush.position.set(
                    prevState.currentBrush.position.x * scaledTileSize,
                    prevState.currentBrush.position.y * scaledTileSize
                );
                if(this.brush instanceof PIXI.extras.AnimatedSprite) {
                    this.brush.play();
                    this.brush.animationSpeed = AnimationSpeed;
                }
                this.root.addChild(this.brush);
            }
        }

        // visible
        if(this.brush) {
            this.brush.visible = state.brushVisible;
        }

        // paint/erase
        const mouseButtonChanged = prevState.mouseButtonState !== state.mouseButtonState;
        if(this.brush && (positionChanged || mouseButtonChanged)) {
            if(GridBounds.contains(this.brush.position.x, this.brush.position.y)) {
                const modifierKeyPressed = state.keyCode === KeyCodes.SPACE || state.keyCode === KeyCodes.CTRL;
                if(state.mouseButtonState === MouseButtonState.LEFT_DOWN && !modifierKeyPressed) {
                    this.levelDataStore.Dispatch({
                        type: LevelDataActions.PAINT,
                        data: {brush: state.currentBrush, viewOffset: state.viewOffset},
                        canUndo: true
                    });
                }
                if(state.mouseButtonState === MouseButtonState.RIGHT_DOWN && !modifierKeyPressed) {
                    this.levelDataStore.Dispatch({
                        type: LevelDataActions.ERASE,
                        data: {brush: state.currentBrush, viewOffset: state.viewOffset},
                        canUndo: true
                    });
                }
            }
        }
    }
}
