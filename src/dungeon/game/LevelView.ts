
import {TweenMax} from "gsap";
import GameComponent from "../../_lib/game/GameComponent";
import {Rectangle} from "../../_lib/math/Geometry";
import {GameHeight, GameWidth, KeyCodes, Scenes, TileSize} from "../Constants";
import Level from "./Level";

export default class LevelView extends GameComponent {

    private viewRect: Rectangle;
    private zoomRect: Rectangle;
    private needsRefresh: boolean = true;
    private layers: PIXI.Container[] = [];

    constructor(private level: Level) {
        super();

        this.viewRect = new Rectangle(0, 0, 100, 50);
        this.zoomRect = new Rectangle(12, 22, 18, 16);
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
                    this.viewRect.Offset(0, -1);
                    break;
                case KeyCodes.DOWN:
                    this.viewRect.Offset(0, 1);
                    break;
                case KeyCodes.LEFT:
                    this.viewRect.Offset(-1, 0);
                    break;
                case KeyCodes.RIGHT:
                    this.viewRect.Offset(1, 0);
                    break;
            }
            this.needsRefresh = true;
        }

        const moveRandom = () => {
            TweenMax.to(this.viewRect, 2, {
                ...this.zoomRect,
                yoyo: true,
                repeat: 1,
                onUpdate: () => this.needsRefresh = true,
                onComplete: () => {
                    this.zoomRect.x = Math.random() * 300;
                    this.zoomRect.y = Math.random() * 200;
                    moveRandom();
                }
            });
        }
        moveRandom();

    }

    private OnUpdate(dt: number): void {

        if(this.needsRefresh) {
            this.needsRefresh = false;

            this.viewRect.x = this.viewRect.x | 0;
            this.viewRect.y = this.viewRect.y | 0;
            this.viewRect.width = this.viewRect.width | 0;
            this.viewRect.height = this.viewRect.height | 0;

            const level = this.level.levelData;
            const w = this.viewRect.x + this.viewRect.width;
            const h = this.viewRect.y + this.viewRect.height;
            const scale = Math.min(
                GameWidth / this.viewRect.width / TileSize,
                GameHeight / this.viewRect.height / TileSize
            );

            for(let l = 0, layerCount = level.length; l < layerCount; l++) {
                this.layers[l].removeChildren();
                for(let x = this.viewRect.x; x < w; x++) {
                    if(x < 0 || x >= this.level.boundRect.width) {
                        continue;
                    }
                    for(let y = this.viewRect.y; y < h; y++) {
                        if(y < 0 || y >= this.level.boundRect.height) {
                            continue;
                        }
                        const tile = level[l][x][y];
                        if(tile) {
                            const sprites = tile.sprites;
                            for(let z = 0, len = sprites.length; z < len; z++) {
                                const s = sprites[z].sprite;
                                s.x = (((x - this.viewRect.x) * TileSize) + sprites[z].offset.x) * scale;
                                s.y = (((y - this.viewRect.y) * TileSize) + sprites[z].offset.y) * scale;
                                s.scale.set(scale);
                                this.layers[l].addChild(s);
                            }
                        }
                    }
                }
            }
        }
    }
}
