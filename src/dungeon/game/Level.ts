import AssetFactory from "../../_lib/loading/AssetFactory";
import {PointLike, Rectangle} from "../../_lib/math/Geometry";

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
    sprites: {sprite: PIXI.Sprite, offset: PointLike}[],
    data: MetaData;
}

type MetaData = {
    [name: string]: number
}

export default class Level {
    public levelData: Tile[][][];
    public metaData: MetaData[][];
    public boundRect: Rectangle;
    public layerIds: number[] = [];

    LoadEditorData(editorLevelData: Brush[]): void {

        // find map bounds
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
        // normalise origin to zero
        this.boundRect = new Rectangle(0, 0, bounds.x2 - bounds.x1 + 2, bounds.y2 - bounds.y1 + 2);

        // for the meta data create array of MetaData[x][y]
        this.metaData = new Array<Array<MetaData>>(this.boundRect.width);
        for(let i = 0; i < this.boundRect.width; i++) {
            this.metaData[i] = new Array<MetaData>(this.boundRect.height);
        }

        // parse meta data
        editorLevelData.forEach(brush => {
            if(brush.data != null) {
                const posX = brush.position.x - bounds.x1 + 1;
                const posY = brush.position.y - bounds.y1 + 1;
                if(this.metaData[posX][posY] == null) {
                    this.metaData[posX][posY] = {};
                }
                this.metaData[posX][posY][brush.name] = brush.data;
            }
        });

        // for the level data create array of Tiles[layer][x][y]
        const layerCount = this.layerIds.length;
        this.levelData = new Array<Array<Array<Tile>>>(layerCount);
        for(let j = 0; j < layerCount; j++) {
            this.levelData[j] = new Array<Array<Tile>>(this.boundRect.width);
            for(let i = 0; i < this.boundRect.width; i++) {
                this.levelData[j][i] = new Array<Tile>(this.boundRect.height);
            }
        }

        // parse tile data
        editorLevelData.forEach(brush => {
            if(brush.data == null) {
                const layerIndex = this.layerIds.indexOf(brush.layerId);
                const posX = brush.position.x - bounds.x1 + 1;
                const posY = brush.position.y - bounds.y1 + 1;
                if(this.levelData[layerIndex][posX][posY] == null) {
                    this.levelData[layerIndex][posX][posY] = {
                        sprites: [], data: this.metaData[posX][posX]
                    };
                }
                const tile = this.levelData[layerIndex][posX][posY];
                const s = {
                    sprite: AssetFactory.inst.Create(brush.name),
                    offset: {x: brush.pixelOffset.x, y: brush.pixelOffset.y}
                };

                s.sprite.rotation = brush.rotation;
                s.offset.x -= (brush.scale.x < 0 ? s.sprite.width : 0);
                s.offset.y -= (brush.scale.y < 0 ? s.sprite.height : 0);

                tile.sprites.push(s);
            }
        });
    }
}
