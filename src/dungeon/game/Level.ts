import Game from "../../_lib/game/Game";
import {PointLike, Rectangle, Point, Vec3Like} from "../../_lib/math/Geometry";
import {DepthBrushName} from "../Constants";
import {LEVEL_LOADED} from "./Events";
import AssetFactory from "../../_lib/loading/AssetFactory";

type Brush = {
    name: string;
    position: PointLike;
    pixelOffset: PointLike,
    rotation: number,
    scale: PointLike,
    layerId: number,
    data: number
};

export type Tile = Brush & {
    texture:PIXI.Texture;
}

export default class Level {
    public levelData: Tile[][][] = [];
    public boundRect: Rectangle;
    public layerIds: number[] = [];
    public playerStartPosition: Vec3Like;
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
            if(brush.layerId < 1000) {
                if(this.layerIds.indexOf(brush.layerId) === -1) {
                    this.layerIds.push(brush.layerId);
                }
            } else {
                if(brush.name === "data-1") {
                    this.playerStartPosition = {...brush.position, z:brush.layerId - 1000};
                }
            }
        });
        
        /*
        // get depth
        editorLevelData.forEach(brush => {
            if(brush.name === DepthBrushName) {
                this.depthMax = Math.max(this.depthMax, brush.data);
            }
        });
        */
        
        // parse tile data
        editorLevelData.forEach(brush => {
            const index = this.layerIds.indexOf(brush.layerId);
            if(index > -1){
                const posX = brush.position.x - bounds.x1 + 1;
                const posY = brush.position.y - bounds.y1 + 1;
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
}
