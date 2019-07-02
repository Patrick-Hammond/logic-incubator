import Game from "../../../_lib/game/Game";
import AssetFactory from "../../../_lib/loading/AssetFactory";
import {Rectangle, Vec2Like} from "../../../_lib/math/Geometry";
import {IEditorState} from "../../editor/stores/EditorStore";
import {Layer} from "../../editor/stores/LevelDataStore";
import {LEVEL_LOADED} from "../Events";

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
    public tileLayers: Layer[] = [];
    public collisionData: boolean[][] = [];
    public boundRect: Rectangle;
    public playerStartPosition: Vec2Like;
    public depthMax: number = 0;

    LoadEditorData(editorLevelData:{editorData:IEditorState, levelData:Brush[]}): void {

        this.tileLayers = [];
        this.collisionData = [];

        let idMap:{[id:number]:number} = {};
        let id = 0;
        editorLevelData.editorData.layers.forEach(layer => {
            if(!layer.isData) {
                this.tileLayers[id] = layer;
                idMap[layer.id] = id;
                id++;
            }
        });
        
        const levelData = editorLevelData.levelData['levelData'];

        // find map bounds
        const bounds = { x1: Number.MAX_VALUE, y1: Number.MAX_VALUE, x2: Number.MIN_VALUE, y2: Number.MIN_VALUE };
        levelData.forEach(brush => {
            bounds.x1 = Math.min(bounds.x1, brush.position.x);
            bounds.y1 = Math.min(bounds.y1, brush.position.y);
            bounds.x2 = Math.max(bounds.x2, brush.position.x);
            bounds.y2 = Math.max(bounds.y2, brush.position.y);
        });

        // normalise origin to zero
        this.boundRect = new Rectangle(0, 0, bounds.x2 - bounds.x1 + 2, bounds.y2 - bounds.y1 + 2);

        // get all layer ids and parse data layers
        levelData.forEach(brush => {
            if(!idMap[brush.layerId]) {
                const posX = brush.position.x - bounds.x1;
                const posY = brush.position.y - bounds.y1;
                if (brush.name === "data-1") {
                    this.playerStartPosition = { x: posX, y: posY };
                } else if (brush.name === "data-2") {
                    if (this.collisionData[posX] == null) {
                        this.collisionData[posX] = [];
                    }
                    this.collisionData[posX][posY] = true;
                }
            }
        });

        this.tileLayers.forEach(layer => this.levelData[idMap[layer.id]] = []);

        // parse tile data
        levelData.forEach(brush => {
            const index = idMap[brush.layerId];

            if(index != null) {
                const posX = brush.position.x - bounds.x1;
                const posY = brush.position.y - bounds.y1;

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
