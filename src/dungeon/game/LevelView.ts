import GameComponent from "../../_lib/game/GameComponent";
import {Point, Rectangle} from "../../_lib/math/Geometry";
import {GameHeight, GameWidth, KeyCodes, Scenes, TileSize} from "../Constants";
import Level from "./Level";

export default class LevelView extends GameComponent {

    private viewRect: Rectangle;
    private directionVec: Point = new Point();
    private scaledTileSize: Point = new Point();

    private keyCode: number = -1;
    private needsRefresh: boolean = true;
    private layers: PIXI.Container[] = [];

    constructor(private level: Level) {
        super();
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

        this.viewRect = new Rectangle(0, 0, GameWidth / TileSize / 2, GameHeight / TileSize / 2);
        this.scaledTileSize.Set(GameWidth / this.viewRect.width, GameHeight / this.viewRect.height);

        const maskRect = new PIXI.Graphics().beginFill(0xFF0000).drawRect(
            this.scaledTileSize.x,
            this.scaledTileSize.y,
            GameWidth - this.scaledTileSize.x * 2,
            GameHeight - this.scaledTileSize.y * 2
        ).endFill();
        this.root.mask = maskRect;

        this.game.ticker.add(this.OnUpdate, this);

        document.onkeydown = (e: KeyboardEvent) => this.keyCode = e.keyCode;
        document.onkeyup = (e: KeyboardEvent) => this.keyCode = -1;
    }

    private OnUpdate(dt: number): void {

        if(this.keyCode !== -1) {
            switch(this.keyCode) {
                case KeyCodes.UP:
                    this.directionVec.Offset(0, -1);
                    break;
                case KeyCodes.DOWN:
                    this.directionVec.Offset(0, 1);
                    break;
                case KeyCodes.LEFT:
                    this.directionVec.Offset(-1, 0);
                    break;
                case KeyCodes.RIGHT:
                    this.directionVec.Offset(1, 0);
                    break;
            }
        }

        this.root.x += this.directionVec.x * dt;
        this.root.y += this.directionVec.y * dt;

        this.directionVec.x *= 0.95 * dt;
        this.directionVec.y *= 0.95 * dt;

        if(Math.abs(this.root.x) > this.scaledTileSize.x) {
            this.root.x < 0 ? this.viewRect.Offset(1, 0) : this.viewRect.Offset(-1, 0);
            this.root.x = 0;
            this.needsRefresh = true;
        }
        if(Math.abs(this.root.y) > this.scaledTileSize.y) {
            this.root.y < 0 ? this.viewRect.Offset(0, 1) : this.viewRect.Offset(0, -1);
            this.root.y = 0;
            this.needsRefresh = true;
        }

        if(this.needsRefresh) {
            this.needsRefresh = false;

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
