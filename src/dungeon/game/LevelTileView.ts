import CompositeRectTileLayer from "../../_extern/pixi-tilemap/CompositeRectTileLayer";
import GameComponent from "../../_lib/game/GameComponent";
import {Key} from "../../_lib/io/Keyboard";
import {Point, Rectangle} from "../../_lib/math/Geometry";
import {GameHeight, GameWidth, PlayerSpeed, Scenes, TileSize} from "../Constants";
import Level from "./Level";

export default class LevelView extends GameComponent {

    private viewRect: Rectangle;
    private directionVec: Point = new Point();
    private scaledTileSize: Point = new Point();

    private needsRefresh: boolean = true;
    private depthLayers: CompositeRectTileLayer[] = [];

    constructor(private level: Level) {
        super();
    }

    Init(): void {
        this.AddToScene(Scenes.GAME);
        this.root.interactive = false;
        this.root.interactiveChildren = false;

        for(let depth = 0; depth <= this.level.depthMax; depth++) {
            const d = new CompositeRectTileLayer(depth);

            d.name = "depth" + depth.toString();
            this.depthLayers[depth] = d;
            // d.alpha = 1 - depth * 0.1;
            this.root.addChild(d);
        }

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
    }

    private OnUpdate(dt: number): void {

        if(this.game.keyboard.AnyKeyPressed()) {
            if(this.game.keyboard.KeyPressed(Key.UpArrow)) {
                this.directionVec.Offset(0, 1);
            }
            if(this.game.keyboard.KeyPressed(Key.DownArrow)) {
                this.directionVec.Offset(0, -1);
            }
            if(this.game.keyboard.KeyPressed(Key.LeftArrow)) {
                this.directionVec.Offset(1, 0);
            }
            if(this.game.keyboard.KeyPressed(Key.RightArrow)) {
                this.directionVec.Offset(-1, 0);
            }
        }

        this.root.x += this.directionVec.x * dt * PlayerSpeed;
        this.root.y += this.directionVec.y * dt * PlayerSpeed;

        this.directionVec.x *= 0.9;
        this.directionVec.y *= 0.9;

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

            // clear
            this.depthLayers.forEach((l, i) => {
                l.scale.set(scale * 1 - i * 0.01);
                l.removeChildren()
            });

            // redraw
            for(let x = this.viewRect.x; x < w; x++) {
                if(x < 0 || x >= this.level.boundRect.width) {
                    continue;
                }
                for(let y = this.viewRect.y; y < h; y++) {
                    if(y < 0 || y >= this.level.boundRect.height) {
                        continue;
                    }
                    const tile = level[x][y];
                    if(tile) {
                        const sprites = tile.sprites;
                        for(let z = 0, len = sprites.length; z < len; z++) {
                            const s = sprites[z].sprite;
                            s.x = (((x - this.viewRect.x) * TileSize) + sprites[z].offset.x);
                            s.y = (((y - this.viewRect.y) * TileSize) + sprites[z].offset.y);
                            this.depthLayers[tile.depth].addFrame(s.texture, s.x, s.y);
                        }
                    }
                }
            }
        }
    }
}
