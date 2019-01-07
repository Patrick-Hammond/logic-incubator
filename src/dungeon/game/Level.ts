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
    sprites: PIXI.Sprite[],
    data: {[name: string]: number};
}

export default class Level {
    public levelData: Tile[][][];
    public boundRect: Rectangle;

    LoadEditorData(editorLevelData: Brush[]): void {
        const bounds = {x1: 0, y1: 0, x2: 0, y2: 0};
        editorLevelData.forEach(brush => {
            bounds.x1 = Math.min(bounds.x1, brush.position.x);
            bounds.y1 = Math.min(bounds.y1, brush.position.y);
            bounds.x2 = Math.max(bounds.x2, brush.position.x);
            bounds.y2 = Math.max(bounds.y2, brush.position.y);
        });
        this.boundRect = new Rectangle(0, 0, bounds.x2 - bounds.x1 + 2, bounds.y2 - bounds.y1 + 2);

        let layerCount = 4;

        this.levelData = new Array<Array<Array<Tile>>>(layerCount);
        this.levelData.forEach(layer => {
            layer = new Array<Array<Tile>>(this.boundRect.width);
            layer.forEach(col => {
                col = new Array<Tile>(this.boundRect.height);
            });
        });
        
        console.log(this.levelData);

        editorLevelData.forEach(brush => {
            const pos = {x: brush.position.x - bounds.x1 + 1, y: brush.position.y - bounds.y1 + 1};
            const layerId = brush.layerId;
            if(this.levelData[layerId][pos.x][pos.y] == null) {
                this.levelData[layerId][pos.x][pos.y] = {sprites: [], data: {}};
            }
            const tile = this.levelData[layerId][pos.x][pos.y];
            if(brush.data != null) {
                tile.data[brush.name] = brush.data;
            } else {
                const sprite = AssetFactory.inst.Create(brush.name);
                const flipOffsetX = brush.scale.x < 0 ? sprite.width : 0;
                const flipOffsetY = brush.scale.y < 0 ? sprite.height : 0;
                sprite.position.set((pos.x + flipOffsetX) * TileSize, (pos.y + flipOffsetY) * TileSize);
                sprite.rotation = brush.rotation;
                sprite.pivot.set(brush.pixelOffset.x, brush.pixelOffset.y);
                sprite.scale.set(brush.scale.x, brush.scale.y);
                tile.sprites.push(sprite);
            }
        });
    }
}
