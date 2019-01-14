import AssetFactory from "../../_lib/loading/AssetFactory";
import {PointLike, Rectangle} from "../../_lib/math/Geometry";
import {DepthBrushName} from "../Constants";

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
    sprites: TileSprite[],
    depth: number,
    data: MetaData;
}

type TileSprite = {
    sprite: PIXI.Sprite,
    layerId: number,
    offset: PointLike
}

type MetaData = {
    [name: string]: number
}

export default class Level {
    public levelData: Tile[][];
    public boundRect: Rectangle;
    public layerIds: number[] = [];
    public depthMax: number = 0;

    LoadEditorData(editorLevelData: Brush[]): void {

        // find map bounds
        const bounds = {x1: 0, y1: 0, x2: 0, y2: 0};
        editorLevelData.forEach(brush => {
            bounds.x1 = Math.min(bounds.x1, brush.position.x);
            bounds.y1 = Math.min(bounds.y1, brush.position.y);
            bounds.x2 = Math.max(bounds.x2, brush.position.x);
            bounds.y2 = Math.max(bounds.y2, brush.position.y);
        });

        // normalise origin to zero
        this.boundRect = new Rectangle(0, 0, bounds.x2 - bounds.x1 + 2, bounds.y2 - bounds.y1 + 2);

        // get all layer ids
        editorLevelData.forEach(brush => {
            if(brush.layerId < 1000 && this.layerIds.indexOf(brush.layerId) === -1) {
                this.layerIds.push(brush.layerId);
            }
        });

        // get depth
        editorLevelData.forEach(brush => {
            if(brush.name === DepthBrushName) {
                this.depthMax = Math.max(this.depthMax, brush.data);
            }
        });

        // level data array
        this.levelData = new Array<Array<Tile>>(this.boundRect.width);
        for(let j = 0; j < this.boundRect.width; j++) {
            this.levelData[j] = new Array<Tile>(this.boundRect.height);
        }

        // parse tile data
        editorLevelData.forEach(brush => {
            const posX = brush.position.x - bounds.x1 + 1;
            const posY = brush.position.y - bounds.y1 + 1;
            if(this.levelData[posX][posY] == null) {
                this.levelData[posX][posY] = {
                    sprites: [], depth: 0, data: {}
                };
            }
            const tile = this.levelData[posX][posY];
            if(brush.data === null) {
                const s = {
                    sprite: AssetFactory.inst.Create(brush.name),
                    layerId: brush.layerId,
                    offset: {x: brush.pixelOffset.x, y: brush.pixelOffset.y}
                };

                s.sprite.rotation = brush.rotation;
                s.offset.x -= (brush.scale.x < 0 ? s.sprite.width : 0);
                s.offset.y -= (brush.scale.y < 0 ? s.sprite.height : 0);

                tile.sprites.push(s);
            } else {
                if(brush.name === DepthBrushName) {
                    tile.depth = brush.data;
                }
                tile.data[brush.name] = brush.data;
            }
        });
    }
}
