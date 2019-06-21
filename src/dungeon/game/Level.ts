import Game from "../../_lib/game/Game";
import {Vec2Like, Rectangle, Vec3Like, Vec2} from "../../_lib/math/Geometry";
import {LEVEL_LOADED} from "./Events";
import AssetFactory from "../../_lib/loading/AssetFactory";
import {TileSize} from "../Constants";
import {CeilN} from "../../_lib/math/Utils";

type Brush = {
    name: string;
    position: Vec2Like;
    pixelOffset: Vec2Like,
    rotation: number,
    scale: Vec2Like,
    layerId: number,
    data: number
};

export type Tile = Brush & {
    texture:PIXI.Texture;
}

export enum CollisionType {
    NONE, X, Y, XY
}

export default class Level {
    private direction = new Vec2();

    public levelData: Tile[][][] = [];
    public collisionData:boolean[][] = [];
    public boundRect: Rectangle;
    public layerIds: number[] = [];
    public playerStartPosition: {x:number, y:number, layerId:number};
    public depthMax: number = 0;
 
    LoadEditorData(editorLevelData: Brush[]): void {

        // find map bounds
        const bounds = {x1: Number.MAX_VALUE, y1: Number.MAX_VALUE, x2: Number.MIN_VALUE, y2: Number.MIN_VALUE};
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
            if(brush.layerId < 1000) {
                if(this.layerIds.indexOf(brush.layerId) === -1) {
                    this.layerIds.push(brush.layerId);
                }
            } else {
                const posX = brush.position.x - bounds.x1;
                const posY = brush.position.y - bounds.y1;
                if(brush.name === "data-1") {
                    this.playerStartPosition = {x:posX, y:posY, layerId:this.layerIds[this.layerIds.length - 1]};
                }
                else if(brush.name === "data-2") {
                    if(this.collisionData[posX] == null) {
                        this.collisionData[posX] = []
                    }
                    this.collisionData[posX][posY] = true;
                }
            }
        });
        
        // parse tile data
        editorLevelData.forEach(brush => {
            const index = this.layerIds.indexOf(brush.layerId);
            if(index > -1){
                const posX = brush.position.x - bounds.x1;
                const posY = brush.position.y - bounds.y1;
                if(this.levelData[index] == null) {
                    this.levelData[index] = [];
                }
                if(this.levelData[index][posX] == null) {
                    this.levelData[index][posX] = [];
                }
                let tile = {texture:AssetFactory.inst.CreateTexture(brush.name), ...brush};
                this.levelData[index][posX][posY] = tile;
            }
        });

        Game.inst.dispatcher.emit(LEVEL_LOADED);
    }

    CheckCollision(from:Vec2Like, to:Vec2Like):{type:CollisionType, distance:number} {
        let type = CollisionType.NONE;

        //pixel to grid space
        let fromX = from.x / TileSize;
        let toX = to.x / TileSize;
        const movingRight = toX > fromX;
        if(movingRight) {
            fromX++;
            toX++;
        }

        let fromY = from.y / TileSize;
        let toY = to.y / TileSize;
        const movingDown = toY > fromY;
        if(movingDown) {
            fromY++;
            toY++;
        }

        this.direction.Set(toX - fromX, toY - fromY);
        let len = Math.ceil(this.direction.length);
        let incX = CeilN(this.direction.x / len);
        let incY = CeilN(this.direction.y / len);
        let x = fromX|0;
        let y = fromY|0;
        let distance = 0;

        for (let i = 0; i < len; i++) {
            if(this.collisionData[x+incX] && this.collisionData[x+incX][y]) {
                type += CollisionType.X;
            }
            if(this.collisionData[x] && this.collisionData[x][y+incY]) {
                type += CollisionType.Y;
            }
            if(type > CollisionType.NONE) {
                distance = i;
                break;
            }
            x += incX;
            y += incY;
        }

        return {type, distance};
    }
}