import EditorComponent from "../EditorComponent";
import { AnimationSpeed, TileSize, BrushSnap } from "../Constants";
import { ILevelDataState, LevelDataActions } from "../stores/LevelDataStore";
import { IState } from "../stores/EditorStore";

export class Canvas extends EditorComponent {
    private grid: PIXI.Graphics = new PIXI.Graphics();
    private levelContainer = new PIXI.Container();

    constructor() {
        super();

        this.root.addChild(this.grid, this.levelContainer);

        this.AddToStage();

        this.levelDataStore.Subscribe(this.UpdateLevel, this);
        this.editorStore.Subscribe(this.UpdateLayout, this);

        let paint = (type: LevelDataActions) => {
            let currentBrush = this.editorStore.state.currentBrush;
            if (currentBrush.name != "") {
                this.levelDataStore.Dispatch({ type: type, data: currentBrush, canUndo: true });
            }
        }

        this.grid.interactive = true;
        this.grid.on("mousedown", (e: PIXI.interaction.InteractionEvent) => paint(LevelDataActions.PAINT));
        this.grid.on("rightdown", (e: PIXI.interaction.InteractionEvent) => paint(LevelDataActions.ERASE));
    }

    private UpdateLayout(prevState: IState, state: IState): void {
        if (prevState.gridBounds != state.gridBounds) {
            //redraw grid
            const margin = state.gridBounds.x;

            this.grid.clear().beginFill(0x222222, 0.5).drawShape(state.gridBounds);

            for (let col = 0; col <= state.gridBounds.width; col += state.scaledTileSize / 2) {
                this.grid.lineStyle(1, 0x999999, col % state.scaledTileSize == 0 ? 0.25 : 0.1);
                this.grid.moveTo(col + margin, margin).lineTo(col + margin, state.gridBounds.height + margin);
            }
            for (let row = 0; row <= state.gridBounds.height; row += state.scaledTileSize / 2) {
                this.grid.lineStyle(1, 0x999999, row % state.scaledTileSize == 0 ? 0.25 : 0.1);
                this.grid.moveTo(margin, row + margin).lineTo(state.gridBounds.width + margin, row + margin);
            }
        }
    }

    private UpdateLevel(prevState: ILevelDataState, state: ILevelDataState): void {
        if (prevState.levelData != state.levelData) {
            this.levelContainer.removeChildren();

            let layout = this.editorStore.state;
            let tileSize = (TileSize * layout.scale) / BrushSnap;

            state.levelData.forEach(brush => {
                let sprite = this.assetFactory.Create(brush.name);
                let posX = brush.position.x * tileSize + layout.gridBounds.x;
                let posY = brush.position.y * tileSize + layout.gridBounds.y;
                if (layout.gridBounds.contains(posX, posY)) {
                    sprite.position.set(posX, posY);
                    sprite.scale.set(layout.scale);
                    if (sprite instanceof PIXI.extras.AnimatedSprite) {
                        sprite.play();
                        sprite.animationSpeed = AnimationSpeed;
                    }
                    this.levelContainer.addChild(sprite);
                }
            });
        }
    }
}