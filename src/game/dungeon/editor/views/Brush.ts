import EditorComponent from "../EditorComponent";
import {TileSize, AnimationSpeed, GridBounds} from "../Constants";
import {IState, EditorActions, MouseButtonState} from "../stores/EditorStore";
import {LevelDataActions} from "../stores/LevelDataStore";

export class BrushTool extends EditorComponent {
    private brush: PIXI.Sprite | PIXI.extras.AnimatedSprite;

    constructor() {
        super();

        this.AddToStage();

        this.editorStore.Subscribe(this.Render, this);

        this.game.interactionManager.on("mousemove", (e: PIXI.interaction.InteractionEvent) => {
            let currentBrush = this.editorStore.state.currentBrush;
            if(currentBrush) {
                let pos = e.data.global.clone();
                let scaledTileSize = TileSize * this.editorStore.state.scale;
                //snap
                pos.x = ((pos.x - GridBounds.x) / scaledTileSize) | 0;
                pos.y = ((pos.y - GridBounds.y) / scaledTileSize) | 0;

                if(currentBrush.position.x != pos.x || currentBrush.position.y != pos.y) {

                    this.editorStore.Dispatch({type: EditorActions.BRUSH_MOVED, data: {position: pos}});

                    let spaceDragging = this.editorStore.state.spaceKeyDown && this.editorStore.state.mouseButtonState == MouseButtonState.LEFT_DOWN;
                    if(spaceDragging) {
                        this.editorStore.Dispatch({type: EditorActions.SPACE_DRAG, data: {move: currentBrush.position}});
                        this.levelDataStore.Dispatch({type: LevelDataActions.REFRESH});
                    }
                }
            }
        });

        this.game.interactionManager.on("mousedown", (e: PIXI.interaction.InteractionEvent) => {
            this.editorStore.Dispatch({type: EditorActions.BRUSH_MOUSE_DOWN, data: {mouseButtonState: MouseButtonState.LEFT_DOWN}});
        });

        this.game.interactionManager.on("mouseup", (e: PIXI.interaction.InteractionEvent) => {
            this.editorStore.Dispatch({type: EditorActions.BRUSH_MOUSE_DOWN, data: {mouseButtonState: MouseButtonState.UP}});
        });
        this.game.interactionManager.on("mouseupoutside", (e: PIXI.interaction.InteractionEvent) => {
            this.editorStore.Dispatch({type: EditorActions.BRUSH_MOUSE_DOWN, data: {mouseButtonState: MouseButtonState.UP}});
        });

        this.game.interactionManager.on("rightdown", (e: PIXI.interaction.InteractionEvent) => {
            this.editorStore.Dispatch({type: EditorActions.BRUSH_MOUSE_DOWN, data: {mouseButtonState: MouseButtonState.RIGHT_DOWN}});
        });

        this.game.interactionManager.on("rightup", (e: PIXI.interaction.InteractionEvent) => {
            this.editorStore.Dispatch({type: EditorActions.BRUSH_MOUSE_DOWN, data: {mouseButtonState: MouseButtonState.UP}});
        });
        this.game.interactionManager.on("rightupoutside", (e: PIXI.interaction.InteractionEvent) => {
            this.editorStore.Dispatch({type: EditorActions.BRUSH_MOUSE_DOWN, data: {mouseButtonState: MouseButtonState.UP}});
        });
    }

    private Render(prevState: IState, state: IState): void {
        //update brush
        if(prevState.currentBrush.name != state.currentBrush.name) {
            if(this.brush) {
                this.brush.parent.removeChild(this.brush);
                this.brush = null;
            }
            if(state.currentBrush.name != "") {
                this.brush = this.assetFactory.Create(state.currentBrush.name);
                this.brush.scale.set(state.scale);
                if(this.brush instanceof PIXI.extras.AnimatedSprite) {
                    this.brush.play();
                    this.brush.animationSpeed = AnimationSpeed;
                }
                this.game.stage.addChild(this.brush);
            }
        }

        //update position
        let pos = state.currentBrush.position;
        if(this.brush && (prevState.currentBrush.position.x != pos.x || prevState.currentBrush.position.y != pos.y)) {

            let scaledTileSize = TileSize * this.editorStore.state.scale;

            this.brush.position.set(pos.x * scaledTileSize + GridBounds.x, pos.y * scaledTileSize + GridBounds.y);

            //check still on grid
            if(GridBounds.contains(this.brush.position.x, this.brush.position.y)) {
                //drag to paint
                if(state.mouseButtonState == MouseButtonState.LEFT_DOWN && !state.spaceKeyDown) {
                    this.levelDataStore.Dispatch({type: LevelDataActions.PAINT, data: {brush: state.currentBrush, viewOffset: state.viewOffset}, canUndo: true});
                }
                //delete with right button
                if(state.mouseButtonState == MouseButtonState.RIGHT_DOWN) {
                    this.levelDataStore.Dispatch({type: LevelDataActions.ERASE, data: {brush: state.currentBrush, viewOffset: state.viewOffset}, canUndo: true});
                }
            }
        }

        //update rotation
        if(this.brush && prevState.currentBrush.rotation != state.currentBrush.rotation) {
            this.brush.rotation = state.currentBrush.rotation;
        }

        //update offset
        if(this.brush && prevState.currentBrush.pixelOffset != state.currentBrush.pixelOffset) {
            this.brush.pivot.set(state.currentBrush.pixelOffset.x, state.currentBrush.pixelOffset.y);
        }

        //update scale
        if(this.brush && state.scale != prevState.scale) {
            this.brush.scale.set(state.scale);
        }
    }
}