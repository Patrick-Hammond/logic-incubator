import {Layerable} from "../../_extern/pixi-display/_Mixins";
import Group from "../../_extern/pixi-display/Group";
import {Layer} from "../../_extern/pixi-display/Layer";
import GameComponent from "../../_lib/game/GameComponent";
import {Key} from "../../_lib/io/Keyboard";
import {Point, Rectangle} from "../../_lib/math/Geometry";
import {GameHeight, GameWidth, PlayerSpeed, Scenes, TileSize} from "../Constants";
import Level from "./Level";

type TileSprite = PIXI.Sprite & Layerable;

export default class LevelView extends GameComponent {

    private viewRect: Rectangle;
    private directionVec: Point = new Point();
    private scaledTileSize: Point = new Point();

    private needsRefresh: boolean = true;
    private depthLayers: Group[] = [];

    constructor(private level: Level) {
        super();
    }

    Init(): void {
        this.root.interactive = false;
        this.root.interactiveChildren = false;
        this.AddToScene(Scenes.GAME);

        for(let depth = 0; depth <= this.level.depthMax; depth++) {
            const group = new Group(depth, true);
            const layer = new Layer(group);
            layer.interactive = layer.interactiveChildren = false;
            layer.name = "depth" + depth.toString();
            this.depthLayers[depth] = group;
            this.game.stage.addChild(layer);
        }

        this.viewRect = new Rectangle(0, 0, GameWidth / TileSize / 2, GameHeight / TileSize / 2);
        this.scaledTileSize.Set(GameWidth / this.viewRect.width, GameHeight / this.viewRect.height);

        const maskRect = new PIXI.Graphics().beginFill(0xFF0000).drawRect(
            this.scaledTileSize.x,
            this.scaledTileSize.y,
            GameWidth - this.scaledTileSize.x * 2,
            GameHeight - this.scaledTileSize.y * 2
        ).endFill();
        this.game.stage.mask = maskRect;

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

        if(Math.abs(this.root.x) >= this.scaledTileSize.x) {
            this.root.x < 0 ? this.viewRect.Offset(1, 0) : this.viewRect.Offset(-1, 0);
            this.root.x = 0;
            this.needsRefresh = true;
        }
        if(Math.abs(this.root.y) >= this.scaledTileSize.y) {
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
            this.root.children.forEach(c => c.visible = false);

            // redraw
            for(let x = this.viewRect.x; x <= w; x++) {
                if(x < 0 || x >= this.level.boundRect.width) {
                    continue;
                }
                for(let y = this.viewRect.y; y <= h; y++) {
                    if(y < 0 || y >= this.level.boundRect.height) {
                        continue;
                    }
                    const tile = level[x][y];
                    if(tile) {
                        const sprites = tile.sprites;
                        for(let z = 0, len = sprites.length; z < len; z++) {
                            const s = sprites[z].sprite as TileSprite;
                            s.parentGroup = this.depthLayers[tile.depth];
                            s.zIndex = z;
                            s.texture = sprites[z].sprite.texture;
                            s.x = (((x - this.viewRect.x) * TileSize) + sprites[z].offset.x) * scale;
                            s.y = (((y - this.viewRect.y) * TileSize) + sprites[z].offset.y) * scale;
                            s.scale.set(scale);
                            s.visible = true;
                            if(!s.parent) {
                                this.root.addChild(s);
                            }
                        }
                    }
                }
            }
        }
    }
}
