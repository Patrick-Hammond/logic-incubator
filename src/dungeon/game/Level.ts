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
    private level: Tile[][];

    LoadEditorData(levelData: Brush[]): void {
        const bounds = {x1: 0, y1: 0, x2: 0, y2: 0};
        levelData.forEach(brush => {
            bounds.x1 = Math.min(bounds.x1, brush.position.x);
            bounds.y1 = Math.min(bounds.y1, brush.position.y);
            bounds.x2 = Math.max(bounds.x2, brush.position.x);
            bounds.y2 = Math.max(bounds.y2, brush.position.y);
        });
        const boundRect = new Rectangle(0, 0, bounds.x2 - bounds.x1, bounds.y2 - bounds.y1);

        this.level = new Array<Array<Tile>>(boundRect.width);
        for(let x = 0; x <= boundRect.width; x++) {
            this.level[x] = new Array<Tile>(boundRect.height);
        }

        levelData.forEach(brush => {
            const pos = {x: brush.position.x - bounds.x1, y: brush.position.y - bounds.y1};
            if(this.level[pos.x][pos.y] == null) {
                this.level[pos.x][pos.y] = {sprites: [], data: {}};
            }
            const tile = this.level[pos.x][pos.y];
            if(brush.data) {
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
