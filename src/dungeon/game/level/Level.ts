import {AnimatedSprite, Texture} from "pixi.js";
import Game from "../../../_lib/game/Game";
import AssetFactory from "../../../_lib/loading/AssetFactory";
import {Rectangle, Vec2Like} from "../../../_lib/math/Geometry";
import {AnimationSpeed} from "../../Constants";
import {DataBrushName, IEditorState} from "../../editor/stores/EditorStore";
import {Layer} from "../../editor/stores/LevelDataStore";
import {LEVEL_LOADED} from "../Events";
import {HeightAt} from "./Depth";

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
    texture: Texture;
    /** Set for tiles painted with an animated brush; `TileMapView` reads its live `.texture` each render instead of `texture`. */
    anim?: AnimatedSprite;
};

function CreateTile(brush: Brush): Tile {
    if (AssetFactory.inst.AnimationNames.indexOf(brush.name) > -1) {
        const anim = AssetFactory.inst.CreateAnimatedSprite(brush.name);
        anim.animationSpeed = AnimationSpeed;
        // Random start frame so identical brushes (e.g. several torches) don't all pulse in lockstep.
        anim.gotoAndPlay((Math.random() * anim.totalFrames) | 0);
        return {...brush, texture: anim.texture, anim};
    }
    return {...brush, texture: AssetFactory.inst.CreateTexture(brush.name)};
}

export default class Level {
    /** [layer][x][y] -> every tile painted at that cell, in paint order (later = drawn on top). */
    public levelData: Tile[][][][] = [];
    public tileLayers: Layer[] = [];
    public collisionData: boolean[][] = [];
    /** Per-cell height painted with the `Z_INDEX` (DepthBrushName) data brush. */
    public heightData: number[][] = [];
    public boundRect: Rectangle;
    public playerStartPosition: Vec2Like;
    /** Highest/lowest painted `Z_INDEX` height, inclusive of the unpainted default (0). */
    public depthMax: number = 0;
    public depthMin: number = 0;

    /** Height painted under the given grid cell (0 if unpainted). Drives the camera zoom. */
    HeightAt(tileX: number, tileY: number): number {
        return HeightAt(this.heightData, tileX, tileY);
    }

    /** Stops animated tiles' sprites so reloading a level doesn't leave them ticking in the background forever. */
    private DisposeTiles(): void {
        this.levelData.forEach(layer =>
            layer.forEach(column =>
                column && column.forEach(cell => cell && cell.forEach(tile => tile.anim && tile.anim.stop()))
            )
        );
    }

    LoadEditorData(editorLevelData: {editorData: IEditorState, levelData: Brush[]}): void {

        this.DisposeTiles();

        this.tileLayers = [];
        this.collisionData = [];
        this.heightData = [];
        this.depthMax = 0;
        this.depthMin = 0;

        const idMap: {[ id: number ]: number} = {};
        let id = 0;
        editorLevelData.editorData.layers.forEach(layer => {
            if(!layer.isData) {
                this.tileLayers[ id ] = layer;
                idMap[ layer.id ] = id;
                id++;
            }
        });

        const levelData = editorLevelData.levelData["levelData"];

        // find map bounds
        const bounds = {x1: Number.MAX_VALUE, y1: Number.MAX_VALUE, x2: Number.MIN_VALUE, y2: Number.MIN_VALUE};
        levelData.forEach(brush => {
            bounds.x1 = Math.min(bounds.x1, brush.position.x);
            bounds.y1 = Math.min(bounds.y1, brush.position.y);
            bounds.x2 = Math.max(bounds.x2, brush.position.x);
            bounds.y2 = Math.max(bounds.y2, brush.position.y);
        });

        // normalise origin to zero
        this.boundRect = new Rectangle(0, 0, bounds.x2 - bounds.x1 + 2, bounds.y2 - bounds.y1 + 2);

        // parse data layers
        levelData.forEach(brush => {
            if(!idMap[ brush.layerId ]) {
                const posX = brush.position.x - bounds.x1;
                const posY = brush.position.y - bounds.y1;

                switch(brush.name) {
                    case DataBrushName.PLAYER_START:
                        this.playerStartPosition = {x: posX, y: posY};
                        break;
                    case DataBrushName.COLLISION:
                        if(this.collisionData[ posX ] == null) {
                            this.collisionData[ posX ] = [];
                        }
                        this.collisionData[ posX ][ posY ] = true;
                        break;
                    case DataBrushName.Z_INDEX:
                        if(this.heightData[ posX ] == null) {
                            this.heightData[ posX ] = [];
                        }
                        this.heightData[ posX ][ posY ] = brush.data;
                        if(brush.data > this.depthMax) {
                            this.depthMax = brush.data;
                        }
                        if(brush.data < this.depthMin) {
                            this.depthMin = brush.data;
                        }
                        break;
                }
            }
        });

        this.tileLayers.forEach(layer => this.levelData[ idMap[ layer.id ] ] = []);

        // parse tile data
        levelData.forEach(brush => {

            const index = idMap[ brush.layerId ];
            const posX = brush.position.x - bounds.x1;
            const posY = brush.position.y - bounds.y1;

            if(index != null) {
                if(this.levelData[ index ][ posX ] == null) {
                    this.levelData[ index ][ posX ] = [];
                }
                if(this.levelData[ index ][ posX ][ posY ] == null) {
                    this.levelData[ index ][ posX ][ posY ] = [];
                }

                this.levelData[ index ][ posX ][ posY ].push(CreateTile(brush));
            } else {
                switch(brush.name) {
                    case DataBrushName.PLAYER_START:
                        this.playerStartPosition = {x: posX, y: posY};
                        break;
                    case DataBrushName.COLLISION:
                        if(this.collisionData[ posX ] == null) {
                            this.collisionData[ posX ] = [];
                        }
                        this.collisionData[ posX ][ posY ] = true;
                        break;
                    case DataBrushName.Z_INDEX:
                        if(this.heightData[ posX ] == null) {
                            this.heightData[ posX ] = [];
                        }
                        this.heightData[ posX ][ posY ] = brush.data;
                        if(brush.data > this.depthMax) {
                            this.depthMax = brush.data;
                        }
                        if(brush.data < this.depthMin) {
                            this.depthMin = brush.data;
                        }
                        break;
                }
            }
        });

        Game.inst.dispatcher.emit(LEVEL_LOADED);
    }
}
