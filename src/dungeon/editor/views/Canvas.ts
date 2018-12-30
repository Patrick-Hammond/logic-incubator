import {AnimationSpeed, GridBounds, InitalScale, TileSize} from "../Constants";
import EditorComponent from "../EditorComponent";
import {IState} from "../stores/EditorStore";
import {LevelDataState} from "../stores/LevelDataStore";

export class Canvas extends EditorComponent {
    private grid: PIXI.Graphics = new PIXI.Graphics();
    private mask: PIXI.Graphics = new PIXI.Graphics();
    private levelContainer = new PIXI.Container();

    constructor() {
        super();

        this.root.addChild(this.grid, this.levelContainer, this.mask);
        this.levelContainer.mask = this.mask;

        this.AddToStage();

        this.levelDataStore.Subscribe(this.UpdateLevel, this);
        this.editorStore.Subscribe(this.UpdateLayout, this);

        this.RedrawGrid(InitalScale);
    }

    private UpdateLayout(prevState: IState, state: IState): void {
        if(prevState.viewScale !== state.viewScale) {
            this.RedrawGrid(state.viewScale);
        }
    }

    private UpdateLevel(prevState: LevelDataState, state: LevelDataState): void {
        if(prevState.levelData !== state.levelData) {
            this.levelContainer.removeChildren();

            const scaledTileSize = TileSize * this.editorStore.state.viewScale;
            const viewOffset = this.editorStore.state.viewOffset;

            state.levelData.forEach(brush => {
                const sprite = this.assetFactory.Create(brush.name);
                const scaleX = brush.scale.x * this.editorStore.state.viewScale;
                const scaleY = brush.scale.y * this.editorStore.state.viewScale;
                const flipOffsetX = scaleX < 0 ? sprite.width * this.editorStore.state.viewScale : 0;
                const flipOffsetY = scaleY < 0 ? sprite.height * this.editorStore.state.viewScale : 0;
                const posX = (brush.position.x - viewOffset.x) * scaledTileSize + GridBounds.x + flipOffsetX;
                const posY = (brush.position.y - viewOffset.y) * scaledTileSize + GridBounds.y + flipOffsetY;

                if(GridBounds.contains(posX, posY)) {
                    sprite.position.set(posX, posY);
                    sprite.rotation = brush.rotation;
                    sprite.pivot.set(brush.pixelOffset.x, brush.pixelOffset.y);
                    sprite.scale.set(scaleX, scaleY);
                    if(sprite instanceof PIXI.extras.AnimatedSprite) {
                        sprite.play();
                        sprite.animationSpeed = AnimationSpeed;
                    }
                    this.levelContainer.addChild(sprite);
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
}
