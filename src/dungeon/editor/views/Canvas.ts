import ObjectPool from "../../../_lib/utils/ObjectPool";
import {AnimationSpeed, GridBounds, InitalScale, KeyCodes, Scenes, TileSize} from "../Constants";
import EditorComponent from "../EditorComponent";
import {EditorActions, IState, MouseButtonState} from "../stores/EditorStore";
import {LevelDataActions, LevelDataState} from "../stores/LevelDataStore";

export default class Canvas extends EditorComponent {
    private grid: PIXI.Graphics = new PIXI.Graphics();
    private mask: PIXI.Graphics = new PIXI.Graphics();
    private levelContainer = new PIXI.Container();
    private layerContainers: ObjectPool<PIXI.Container>;
    private textPool: ObjectPool<PIXI.extras.BitmapText>;

    constructor() {
        super();

        this.layerContainers = new ObjectPool<PIXI.Container>(
            6,
            () => new PIXI.Container(),
            (item: PIXI.Container) => item.removeChildren()
        );

        this.textPool = new ObjectPool<PIXI.extras.BitmapText>(
            100,
            () => {
                const b = new PIXI.extras.BitmapText("", {font: {name: "small-font", size: 6}});
                b.position.set(8, 8);
                b.anchor = 0.5;
                return b;
            }
        );

        this.root.addChild(this.grid, this.levelContainer, this.mask);
        this.levelContainer.mask = this.mask;

        this.AddToScene(Scenes.EDITOR);

        this.levelDataStore.Subscribe(this.UpdateLevel, this);
        this.editorStore.Subscribe(this.UpdateLayout, this);

        this.RedrawGrid(InitalScale);

        this.RegisterGridEvents();
    }

    private UpdateLayout(prevState: IState, state: IState): void {
        if(prevState.viewScale !== state.viewScale) {
            this.RedrawGrid(state.viewScale);
        }
    }

    private UpdateLevel(prevState: LevelDataState, state: LevelDataState): void {
        if(prevState.levelData !== state.levelData) {
            this.levelContainer.removeChildren();

            this.layerContainers.Restore();
            const layerDict: {[id: number]: PIXI.Container} = {};
            this.editorStore.state.layers.forEach(layer => {
                const layerContainer = this.layerContainers.Get();
                layerDict[layer.id] = layerContainer;
                layerContainer.visible = layer.visible;
                this.levelContainer.addChild(layerContainer);
            })

            const scaledTileSize = TileSize * this.editorStore.state.viewScale;
            const viewOffset = this.editorStore.state.viewOffset;

            this.textPool.Restore();
            state.levelData.forEach(brush => {
                if(layerDict[brush.layerId].visible) {
                    let posX = (brush.position.x - viewOffset.x) * scaledTileSize + GridBounds.x;
                    let posY = (brush.position.y - viewOffset.y) * scaledTileSize + GridBounds.y;

                    if(GridBounds.contains(posX, posY)) {
                        const sprite = this.assetFactory.Create(brush.name);
                        const scaleX = brush.scale.x * this.editorStore.state.viewScale;
                        const scaleY = brush.scale.y * this.editorStore.state.viewScale;
                        const flipOffsetX = scaleX < 0 ? sprite.width * this.editorStore.state.viewScale : 0;
                        const flipOffsetY = scaleY < 0 ? sprite.height * this.editorStore.state.viewScale : 0;
                        posX += flipOffsetX;
                        posY += flipOffsetY;
                        sprite.position.set(posX, posY);
                        sprite.rotation = brush.rotation;
                        sprite.pivot.set(brush.pixelOffset.x, brush.pixelOffset.y);
                        sprite.scale.set(scaleX, scaleY);
                        if(sprite instanceof PIXI.extras.AnimatedSprite) {
                            sprite.play();
                            sprite.animationSpeed = AnimationSpeed;
                        }
                        if(brush.data !== null) {
                            const text = this.textPool.Get();
                            text.text = brush.data.toString();
                            sprite.addChild(text);
                        }
                        layerDict[brush.layerId].addChild(sprite);
                    }
                }
            });
        }
    }

    private RedrawGrid(scale: number): void {
        const margin = GridBounds.x;
        const scaledTileSize = TileSize * scale;

        this.grid.clear().beginFill(0x222222, 0.5).drawShape(GridBounds);
        this.mask.clear().beginFill(0xff).drawShape(GridBounds);

        for(let col = 0; col <= GridBounds.width; col += scaledTileSize) {
            this.grid.lineStyle(1, 0x999999, 0.1);
            this.grid.moveTo(col + margin, margin).lineTo(col + margin, GridBounds.height + margin);
        }

        for(let row = 0; row <= GridBounds.height; row += scaledTileSize) {
            this.grid.lineStyle(1, 0x999999, 0.1);
            this.grid.moveTo(margin, row + margin).lineTo(GridBounds.width + margin, row + margin);
        }
    }

    private RegisterGridEvents(): void {
        this.grid.interactive = true;
        this.grid.on("pointerover", () => {
            this.editorStore.Dispatch({type: EditorActions.BRUSH_VISIBLE, data: {visible: true}});
        });
        this.grid.on("pointerout", () => {
            this.editorStore.Dispatch({type: EditorActions.BRUSH_VISIBLE, data: {visible: false}});
        });

        this.grid.on("pointermove", (e: PIXI.interaction.InteractionEvent) => {
            const currentBrush = this.editorStore.state.currentBrush;
            if(currentBrush) {
                const pos = e.data.global.clone();
                if(GridBounds.contains(pos.x, pos.y)) {
                    const scaledTileSize = TileSize * this.editorStore.state.viewScale;

                    // snap to grid
                    pos.x = ((pos.x - GridBounds.x) / scaledTileSize) | 0;
                    pos.y = ((pos.y - GridBounds.y) / scaledTileSize) | 0;

                    if(currentBrush.position.x !== pos.x || currentBrush.position.y !== pos.y) {

                        this.editorStore.Dispatch({type: EditorActions.BRUSH_MOVED, data: {position: pos}});

                        // check drag move
                        const spaceDragging = (
                            this.editorStore.state.keyCode === KeyCodes.SPACE &&
                            this.editorStore.state.mouseButtonState === MouseButtonState.LEFT_DOWN
                        );
                        const middleButtonDragging = this.editorStore.state.mouseButtonState === MouseButtonState.MIDDLE_DOWN;
                        if(spaceDragging || middleButtonDragging) {
                            this.editorStore.Dispatch({type: EditorActions.VIEW_DRAG, data: {position: currentBrush.position}});
                            this.levelDataStore.Dispatch({type: LevelDataActions.REFRESH});
                        }

                        // check rect paint/erase
                        const rectPainting = (
                            this.editorStore.state.keyCode === KeyCodes.CTRL &&
                            this.editorStore.state.mouseButtonState === MouseButtonState.LEFT_DOWN
                        )
                        const rectErasing = (
                            this.editorStore.state.keyCode === KeyCodes.CTRL &&
                            this.editorStore.state.mouseButtonState === MouseButtonState.RIGHT_DOWN
                        )
                        if(rectPainting || rectErasing) {
                            this.levelDataStore.Dispatch({
                                type: rectPainting ? LevelDataActions.PAINT_RECT : LevelDataActions.ERASE_RECT,
                                data: {
                                    brush: currentBrush,
                                    rectTopLeft: this.editorStore.state.mouseDownPosition,
                                    rectBottomRight: currentBrush.position,
                                    viewOffset: this.editorStore.state.viewOffset
                                },
                                canUndo: true
                            })
                        }
                    }
                }
            }
        });

        this.grid.on("pointerdown", (e: PIXI.interaction.InteractionEvent) => {
            if(e.data.button === 0) {
                this.editorStore.Dispatch({type: EditorActions.MOUSE_BUTTON, data: {mouseButtonState: MouseButtonState.LEFT_DOWN}});
            } else if(e.data.button === 1) {
                this.editorStore.Dispatch({type: EditorActions.MOUSE_BUTTON, data: {mouseButtonState: MouseButtonState.MIDDLE_DOWN}});
            } else if(e.data.button === 2) {
                this.editorStore.Dispatch({type: EditorActions.MOUSE_BUTTON, data: {mouseButtonState: MouseButtonState.RIGHT_DOWN}});
            }
        });

        this.grid.on("pointerup", (e: PIXI.interaction.InteractionEvent) => {
            this.editorStore.Dispatch({type: EditorActions.MOUSE_BUTTON, data: {mouseButtonState: MouseButtonState.UP}});
        });
        this.grid.on("pointerupoutside", (e: PIXI.interaction.InteractionEvent) => {
            this.editorStore.Dispatch({type: EditorActions.MOUSE_BUTTON, data: {mouseButtonState: MouseButtonState.UP}});
        });
        this.grid.on("pointerup", (e: PIXI.interaction.InteractionEvent) => {
            this.editorStore.Dispatch({type: EditorActions.MOUSE_BUTTON, data: {mouseButtonState: MouseButtonState.UP}});
        });
        this.grid.on("pointerupoutside", (e: PIXI.interaction.InteractionEvent) => {
            this.editorStore.Dispatch({type: EditorActions.MOUSE_BUTTON, data: {mouseButtonState: MouseButtonState.UP}});
        });

        // mouse wheel zooming
        this.game.view.onwheel = (e: WheelEvent) => {
            if(GridBounds.contains(e.offsetX, e.offsetY)) {

                const oldScale = this.editorStore.state.viewScale;

                if(e.deltaY < 0) {
                    this.editorStore.Dispatch({type: EditorActions.ZOOM_IN});
                } else if(e.deltaY > 0) {
                    this.editorStore.Dispatch({type: EditorActions.ZOOM_OUT});
                }

                // adjust offset to zoom in and out of the cursor position
                const pos = this.game.interactionManager.mouse.global;
                const percentPos = {x: (pos.x - GridBounds.x) / GridBounds.width, y: (pos.y - GridBounds.y) / GridBounds.height};

                const oldScaledTileSize = TileSize * oldScale;
                const newScaledTileSize = TileSize * this.editorStore.state.viewScale;

                const widthDelta = (GridBounds.width / oldScaledTileSize) * newScaledTileSize - GridBounds.width;
                const heightDelta = (GridBounds.height / oldScaledTileSize) * newScaledTileSize - GridBounds.height;

                const moveDistance = {
                    x: Math.round((widthDelta / oldScaledTileSize) * percentPos.x),
                    y: Math.round((heightDelta / oldScaledTileSize) * percentPos.y)
                };

                this.editorStore.Dispatch({type: EditorActions.VIEW_MOVE, data: {move: moveDistance}});
                this.levelDataStore.Dispatch({type: LevelDataActions.REFRESH});
            }
        };
    }
}
