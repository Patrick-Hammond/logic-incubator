import GameComponent from "../../_lib/game/GameComponent";
import {Rectangle} from "../../_lib/math/Geometry";
import {Scenes, TileSize} from "../Constants";
import Level from "./Level";

export default class LevelView extends GameComponent {

    private viewRect: Rectangle;
    private needsRefresh: boolean = true;
    private layers:PIXI.Container[] = [];

    constructor(private level: Level) {
        super();

        this.Create();
    }

    private Create(): void {
        this.viewRect = new Rectangle(0, 0, 20, 20);
        this.level.levelData.forEach((layer, index) => {
            const l = new PIXI.Container();
            l.name = "layer" + index.toString();
            this.root.addChild(l);
            this.layers.push(l);
        })
    }

    Init(): void {
        this.AddToScene(Scenes.GAME);
        this.game.ticker.add(this.OnUpdate, this);
    }

    OnUpdate(dt: number): void {
        if(this.needsRefresh) {
            this.needsRefresh = false;

            this.root.removeChildren();

            const offsetX = this.viewRect.x * TileSize;
            const offsetY = this.viewRect.x * TileSize;
            const level = this.level.levelData;

            for(let l = 0, layerCount = level.length; l < layerCount; l++) {
                for(let x = this.viewRect.x, w = this.viewRect.x + this.viewRect.width; x < w; x++) {
                    for(let y = this.viewRect.y, h = this.viewRect.y + this.viewRect.height; y < h; y++) {
                        if(level[l][x][y]) {
                            const sprites = level[l][x][y].sprites;
                            for(let z = 0, len = sprites.length; z < len; z++) {
                                const s = sprites[z];
                                s.x = s.x - offsetX;
                                s.y = s.y - offsetY;
                                this.layers[l].addChild(s);
                            }
                        }
                    }
                }
            }
        }
    }
}
