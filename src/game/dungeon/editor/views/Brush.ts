import {AnimationSpeed, GridBounds, KeyCodes, TileSize} from "../Constants";
import EditorComponent from "../EditorComponent";
import {EditorActions, IState, MouseButtonState} from "../stores/EditorStore";
import {LevelDataActions} from "../stores/LevelDataStore";

export class BrushTool extends EditorComponent {

    private brush: PIXI.Sprite | PIXI.extras.AnimatedSprite;

    constructor() {

        super();

        this.AddToStage();

        this.editorStore.Subscribe(this.Render, this);

        this.game.interactionManager.on("mousemove", (e: PIXI.interaction.InteractionEvent) => {
            const currentBrush = this.editorStore.state.currentBrush;
            if(currentBrush) {
                const pos = e.data.global.clone();
                const scaledTileSize = TileSize * this.editorStore.state.viewScale;
                // snap
                pos.x = ((pos.x - GridBounds.x) / scaledTileSize) | 0;
                pos.y = ((pos.y - GridBounds.y) / scaledTileSize) | 0;

                if(currentBrush.position.x !== pos.x || currentBrush.position.y !== pos.y) {

                    this.editorStore.Dispatch({type: EditorActions.BRUSH_MOVED, data: {position: pos}});

                    const spaceDragging = this.editorStore.state.keyCode === KeyCodes.SPACE &&
                                          this.editorStore.state.mouseButtonState === MouseButtonState.LEFT_DOWN;
                    const middleButtonDragging = this.editorStore.state.mouseButtonState === MouseButtonState.MIDDLE_DOWN;
                    if(spaceDragging || middleButtonDragging) {
                        this.editorStore.Dispatch({type: EditorActions.VIEW_DRAG, data: {position: currentBrush.position}});
                        this.levelDataStore.Dispatch({type: LevelDataActions.REFRESH});
                    }
                }
            }
        });

        this.game.interactionManager.on("mousedown", (e: PIXI.interaction.InteractionEvent) => {
            if(e.data.button === 0) {
                this.editorStore.Dispatch({type: EditorActions.MOUSE_BUTTON, data: {mouseButtonState: MouseButtonState.LEFT_DOWN}});
            } else if(e.data.button === 1) {
                this.editorStore.Dispatch({type: EditorActions.MOUSE_BUTTON, data: {mouseButtonState: MouseButtonState.MIDDLE_DOWN}});
            }
        });

        this.game.interactionManager.on("mouseup", (e: PIXI.interaction.InteractionEvent) => {
            this.editorStore.Dispatch({type: EditorActions.MOUSE_BUTTON, data: {mouseButtonState: MouseButtonState.UP}});
        });
        this.game.interactionManager.on("mouseupoutside", (e: PIXI.interaction.InteractionEvent) => {
            this.editorStore.Dispatch({type: EditorActions.MOUSE_BUTTON, data: {mouseButtonState: MouseButtonState.UP}});
        });
        this.game.interactionManager.on("rightdown", (e: PIXI.interaction.InteractionEvent) => {
            this.editorStore.Dispatch({type: EditorActions.MOUSE_BUTTON, data: {mouseButtonState: MouseButtonState.RIGHT_DOWN}});
        });
        this.game.interactionManager.on("rightup", (e: PIXI.interaction.InteractionEvent) => {
            this.editorStore.Dispatch({type: EditorActions.MOUSE_BUTTON, data: {mouseButtonState: MouseButtonState.UP}});
        });
        this.game.interactionManager.on("rightupoutside", (e: PIXI.interaction.InteractionEvent) => {
            this.editorStore.Dispatch({type: EditorActions.MOUSE_BUTTON, data: {mouseButtonState: MouseButtonState.UP}});
        });
    }

    private Render(prevState: IState, state: IState): void {

        // update brush
        if(prevState.currentBrush.name !== state.currentBrush.name) {
            if(this.brush) {
                this.brush.parent.removeChild(this.brush);
                this.brush = null;
            }
            if(state.currentBrush.name !== "") {
                this.brush = this.assetFactory.Create(state.currentBrush.name);
                this.brush.scale.set(state.viewScale);
                if(this.brush instanceof PIXI.extras.AnimatedSprite) {
                    this.brush.play();
                    this.brush.animationSpeed = AnimationSpeed;
                }
                this.game.stage.addChild(this.brush);
            }
        }

        // update scale
        const scaleChanged = state.viewScale !== prevState.viewScale || prevState.currentBrush.scale !== state.currentBrush.scale;
        if(this.brush && scaleChanged) {
            const scale = {x: state.currentBrush.scale.x * state.viewScale, y: state.currentBrush.scale.y * state.viewScale};
            this.brush.scale.set(scale.x, scale.y);
        }

        // update position
        const pos = state.currentBrush.position;
        if(this.brush && (prevState.currentBrush.position.x !== pos.x || prevState.currentBrush.position.y !== pos.y || scaleChanged)) {
            const scaledTileSize = TileSize * this.editorStore.state.viewScale;
            const flipOffset = {x: this.brush.scale.x < 0 ? this.brush.width : 0, y: this.brush.scale.y < 0 ? this.brush.height : 0};
            this.brush.position.set(
                pos.x * scaledTileSize + GridBounds.x + flipOffset.x,
                pos.y * scaledTileSize + GridBounds.y + flipOffset.y
                );

            // check still on grid
            if(GridBounds.contains(this.brush.position.x, this.brush.position.y)) {
                // drag to paint
                if(state.mouseButtonState === MouseButtonState.LEFT_DOWN && state.keyCode !== KeyCodes.SPACE) {
                    this.levelDataStore.Dispatch(
                        {type: LevelDataActions.PAINT, data: {brush: state.currentBrush, viewOffset: state.viewOffset}, canUndo: true}
                        );
                }
                // delete with right button
                if(state.mouseButtonState === MouseButtonState.RIGHT_DOWN) {
                    this.levelDataStore.Dispatch(
                        {type: LevelDataActions.ERASE, data: {brush: state.currentBrush, viewOffset: state.viewOffset}, canUndo: true}
                        );
                }
            }
        }

        // update rotation
        if(this.brush && prevState.currentBrush.rotation !== state.currentBrush.rotation) {
            this.brush.rotation = state.currentBrush.rotation;
        }

        // update offset
        if(this.brush && prevState.currentBrush.pixelOffset !== state.currentBrush.pixelOffset) {
            this.brush.pivot.set(state.currentBrush.pixelOffset.x, state.currentBrush.pixelOffset.y);
        }
    }
}
