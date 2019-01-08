import GameComponent from "../../_lib/game/GameComponent";
import {Rectangle} from "../../_lib/math/Geometry";
import {KeyCodes, Scenes, TileSize} from "../Constants";
import Level from "./Level";

export default class LevelView extends GameComponent {

    private viewRect: Rectangle;
    private needsRefresh: boolean = true;
    private layers: PIXI.Container[] = [];

    constructor(private level: Level) {
        super();

        this.viewRect = new Rectangle(0, 0, 40, 20);
    }

    Init(): void {
        this.AddToScene(Scenes.GAME);

        this.level.layerIds.forEach(id => {
            const l = new PIXI.Container();
            l.name = "layer" + id.toString();
            l.renderable = id < 1000;
            this.root.addChild(l);
            this.layers.push(l);
        })

        this.game.ticker.add(this.OnUpdate, this);

        document.onkeydown = (e: KeyboardEvent) => {
            switch(e.keyCode) {
                case KeyCodes.UP:
                    if(this.viewRect.y > 0) {
                        this.viewRect.Offset(0, -1);
                    }
                    break;
                case KeyCodes.DOWN:
                    this.viewRect.Offset(0, 1);
                    break;
                case KeyCodes.LEFT:
                    if(this.viewRect.x > 0) {
                        this.viewRect.Offset(-1, 0);
                    }
                    break;
                case KeyCodes.RIGHT:
                    this.viewRect.Offset(1, 0);
                    break;
            }
            this.needsRefresh = true;
        }
    }

    OnUpdate(dt: number): void {
        if(this.needsRefresh) {
            this.needsRefresh = false;

            const level = this.level.levelData;
            for(let l = 0, layerCount = level.length; l < layerCount; l++) {
                this.layers[l].removeChildren();
                for(let x = this.viewRect.x, w = this.viewRect.x + this.viewRect.width; x < w; x++) {
                    for(let y = this.viewRect.y, h = this.viewRect.y + this.viewRect.height; y < h; y++) {
                        const tile = level[l][x][y];
                        if(tile && tile.data == null) {
                            const sprites = tile.sprites;
                            for(let z = 0, len = sprites.length; z < len; z++) {
                                const s = sprites[z];
                                s.x = (tile.x - this.viewRect.x) * TileSize;
                                s.y = (tile.y - this.viewRect.y) * TileSize;
                                this.layers[l].addChild(s);
                            }
                        }
                    }
                }
            }
        }
    }
}
