import AssetFactory from "../../_lib/loading/AssetFactory";
import {PointLike, Rectangle} from "../../_lib/math/Geometry";
import {TileSize} from "../Constants";

type Brush = {
    name: string;
    position: PointLike;
    pixelOffset: PointLike,
    rotation: number,
    scale: PointLike,
    layerId: number,
    data: number
};

type Tile = {
    x: number,
    y: number,
    sprites: PIXI.Sprite[],
    data: {[name: string]: number};
}

export default class Level {
    public levelData: Tile[][][];
    public boundRect: Rectangle;
    public layerIds: number[] = [];

    LoadEditorData(editorLevelData: Brush[]): void {
        const bounds = {x1: 0, y1: 0, x2: 0, y2: 0};
        editorLevelData.forEach(brush => {
            bounds.x1 = Math.min(bounds.x1, brush.position.x);
            bounds.y1 = Math.min(bounds.y1, brush.position.y);
            bounds.x2 = Math.max(bounds.x2, brush.position.x);
            bounds.y2 = Math.max(bounds.y2, brush.position.y);
            if(this.layerIds.indexOf(brush.layerId) === -1) {
                this.layerIds.push(brush.layerId);
            }
        });
        this.boundRect = new Rectangle(0, 0, bounds.x2 - bounds.x1 + 2, bounds.y2 - bounds.y1 + 2);

        const layerCount = this.layerIds.length;
        this.levelData = new Array<Array<Array<Tile>>>(layerCount);
        for(let j = 0; j < layerCount; j++) {
            this.levelData[j] = new Array<Array<Tile>>(this.boundRect.width);
            for(let i = 0; i < this.boundRect.width; i++) {
                this.levelData[j][i] = new Array<Tile>(this.boundRect.height);
            }
        }

        editorLevelData.forEach(brush => {
            const pos = {x: brush.position.x - bounds.x1 + 1, y: brush.position.y - bounds.y1 + 1};
            const layerIndex = this.layerIds.indexOf(brush.layerId);
            if(this.levelData[layerIndex][pos.x][pos.y] == null) {
                this.levelData[layerIndex][pos.x][pos.y] = {x: 0, y: 0, sprites: null, data: null};
            }
            const tile = this.levelData[layerIndex][pos.x][pos.y];
            if(brush.data != null) {
                if(tile.data == null) {
                    tile.data = {};
                }
                tile.data[brush.name] = brush.data;
            } else {
                const sprite = AssetFactory.inst.Create(brush.name);
                const flipOffsetX = brush.scale.x < 0 ? sprite.width : 0;
                const flipOffsetY = brush.scale.y < 0 ? sprite.height : 0;
                tile.x = pos.x;
                tile.y = pos.y;
                sprite.rotation = brush.rotation;
                sprite.pivot.set(brush.pixelOffset.x - flipOffsetX, brush.pixelOffset.y - flipOffsetY);
                sprite.scale.set(brush.scale.x, brush.scale.y);
                tile.sprites == null ? tile.sprites = [sprite] : tile.sprites.push(sprite);
            }
        });
    }
}
