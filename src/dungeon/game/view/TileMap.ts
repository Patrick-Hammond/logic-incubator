import CompositeRectTileLayer from "../../../_extern/pixi-tilemap/CompositeRectTileLayer";
import GameComponent from "../../../_lib/game/GameComponent";
import { TileSize } from "../../Constants";
import { LEVEL_LOADED, CAMERA_MOVED, LEVEL_CREATED } from "../Events";
import Level, { Tile } from "../level/Level";
import { Camera } from "./Camera";

export default class TileMapView extends GameComponent {
    private layers: CompositeRectTileLayer[] = [];
    private levelData: Tile[][][];

    constructor(private level: Level, private camera: Camera) {
        super();

        this.game.dispatcher.on(LEVEL_LOADED, this.OnLevelLoaded, this);
        this.game.dispatcher.on(CAMERA_MOVED, this.Render, this);
    }

    private OnLevelLoaded(): void {
       
        while(this.layers.length) {
            this.layers[0].clear();
            this.camera.root.removeChild(this.layers.shift());
        };

        this.levelData = this.level.levelData;
        this.level.tileLayers.forEach(layer => {
            if(!layer.isData) {
                const tileLayer = new CompositeRectTileLayer(layer.id);
                tileLayer.interactive = tileLayer.interactiveChildren = false;
                tileLayer.name = layer.name;
                this.camera.root.addChild(tileLayer);
                this.layers.push(tileLayer);
            }
        });

        this.game.dispatcher.emit(LEVEL_CREATED);

        this.Render();
    }

    private Render(): void {
        for (let l = 0, len = this.layers.length; l < len; l++) {
            const layer = this.layers[l];          
            layer.clear();
            layer.scale.set(this.camera.Scale);
            for (let x = this.camera.ViewRect.x | 0, w = this.camera.ViewRect.right | 0; x <= w; x++) {
                if (x < 0 || x >= this.level.boundRect.width) {
                    continue;
                }
                for (let y = this.camera.ViewRect.y | 0, h = this.camera.ViewRect.bottom | 0; y <= h; y++) {
                    if (y < 0 || y >= this.level.boundRect.height) {
                        continue;
                    }
                    if (this.levelData[l][x] == null || this.levelData[l][x][y] == null) {
                        continue;
                    }
                    const tile = this.levelData[l][x][y];
                    if (tile && tile.texture) {
                        layer.addFrame(tile.texture, (x - this.camera.ViewRect.x) * TileSize, (y - this.camera.ViewRect.y) * TileSize);
                    }
                }
            }
        }
    }
}
