import Game from "../../../_lib/game/Game";
import AssetFactory from "../../../_lib/loading/AssetFactory";
import { Rectangle, Vec2Like } from "../../../_lib/math/Geometry";
import { LEVEL_LOADED } from "../Events";

type Brush = {
    name: string;
    position: Vec2Like;
    pixelOffset: Vec2Like;
    rotation: number;
    scale: Vec2Like;
    layerId: number;
    data: number;
};

export type Tile = Brush & {
    texture: PIXI.Texture;
};

export default class Level {
    public levelData: Tile[][][] = [];
    public collisionData: boolean[][] = [];
    public boundRect: Rectangle;
    public layerIds: number[] = [];
    public playerStartPosition: Vec2Like;
    public playerLayerId: number;
    public depthMax: number = 0;

    LoadEditorData(editorLevelData: Brush[]): void {
        // find map bounds
        const bounds = { x1: Number.MAX_VALUE, y1: Number.MAX_VALUE, x2: Number.MIN_VALUE, y2: Number.MIN_VALUE };
        editorLevelData.forEach(brush => {
            bounds.x1 = Math.min(bounds.x1, brush.position.x);
            bounds.y1 = Math.min(bounds.y1, brush.position.y);
            bounds.x2 = Math.max(bounds.x2, brush.position.x);
            bounds.y2 = Math.max(bounds.y2, brush.position.y);
        });

        // normalise origin to zero
        this.boundRect = new Rectangle(0, 0, bounds.x2 - bounds.x1 + 2, bounds.y2 - bounds.y1 + 2);

        // get all layer ids and parse data layers
        editorLevelData.forEach(brush => {
            if (brush.layerId < 1000) {
                if (this.layerIds.indexOf(brush.layerId) === -1) {
                    this.layerIds.push(brush.layerId);
                }
            } else {
                const posX = brush.position.x - bounds.x1;
                const posY = brush.position.y - bounds.y1;
                if (brush.name === "data-1") {
                    this.playerStartPosition = { x: posX, y: posY };
                    this.playerLayerId = this.layerIds[this.layerIds.length - 1];
                } else if (brush.name === "data-2") {
                    if (this.collisionData[posX] == null) {
                        this.collisionData[posX] = [];
                    }
                    this.collisionData[posX][posY] = true;
                }
            }
        });

        // parse tile data
        editorLevelData.forEach(brush => {
            const index = this.layerIds.indexOf(brush.layerId);
            if (index > -1) {
                const posX = brush.position.x - bounds.x1;
                const posY = brush.position.y - bounds.y1;
                if (this.levelData[index] == null) {
                    this.levelData[index] = [];
                }
                if (this.levelData[index][posX] == null) {
                    this.levelData[index][posX] = [];
                }
                let tile = { texture: AssetFactory.inst.CreateTexture(brush.name), ...brush };
                this.levelData[index][posX][posY] = tile;
            }
        });

        Game.inst.dispatcher.emit(LEVEL_LOADED);
    }
}
