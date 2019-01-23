import GameComponent from "../../_lib/game/GameComponent";
import {Key} from "../../_lib/io/Keyboard";
import {Point, Rectangle} from "../../_lib/math/Geometry";
import {GameHeight, GameWidth, PlayerSpeed, Scenes, TileSize} from "../Constants";
import {LEVEL_LOADED} from "./Events";
import Level from "./Level";

export default class LevelView extends GameComponent {

    private viewRect: Rectangle;
    private directionVec: Point = new Point();
    private scaledTileSize: Point = new Point();

    private needsRefresh: boolean = true;
    private depthContainers: PIXI.Container[][] = [];
    private visibleTiles: PIXI.Sprite[] = [];

    constructor(private level: Level) {
        super();

        this.game.dispatcher.on(LEVEL_LOADED, this.OnLevelLoaded, this);

        this.AddToScene(Scenes.GAME);
    }

    protected OnInitialise() {
        this.root.interactive = false;
        this.root.interactiveChildren = false;

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

    private OnLevelLoaded(): void {

        this.depthContainers.forEach(dl => {
            dl.forEach(layer => {
                layer.removeChildren();
            });
            const depthContainer = dl[0].parent;
            depthContainer.removeChildren();
            depthContainer.parent.removeChild(depthContainer);
        });
        this.depthContainers.length = 0;

        for(let depth = 0; depth <= this.level.depthMax; depth++) {
            const depthContainer = new PIXI.Container();
            depthContainer.interactive = depthContainer.interactiveChildren = false;
            depthContainer.name = "depth" + depth.toString();
            depthContainer.alpha = 1 - depth * 0.2;
            depthContainer.scale.set(1 - depth * 0.05);
            this.depthContainers[depth] = [];
            this.root.addChild(depthContainer);

            this.level.layerIds.forEach((layerId) => {
                const layerContainer = new PIXI.Container();
                layerContainer.interactive = layerContainer.interactiveChildren = false;
                layerContainer.name = layerId.toString();
                depthContainer.addChild(layerContainer);

                this.depthContainers[depth][layerId] = layerContainer;
            });
        }

        this.needsRefresh = true;
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
            this.visibleTiles.forEach(t => {
                t.visible = false;
            });
            this.visibleTiles.length = 0;

            // redraw
            for(let x = this.viewRect.x; x <= w; x++) {
                if(x < 0 || x >= this.level.boundRect.width) {
                    continue;
                }
                for(let y = this.viewRect.y; y <= h; y++) {
                    if(y < 0 || y >= this.level.boundRect.height) {
                        continue;
                    }
                    if(level[x] == null || level[x][y] == null) {
                        continue;
                    }
                    const tiles = level[x][y];
                    const len = tiles.length;
                    if(len) {
                        for(let j = 0; j < len; j++) {
                            const tile = tiles[j];
                            const s = tile.sprite;
                            s.x = (x - this.viewRect.x) * TileSize * scale;
                            s.y = (y - this.viewRect.y) * TileSize * scale;
                            s.scale.set(scale * tile.scale.x, scale * tile.scale.y);
                            s.visible = true;
                            this.visibleTiles.push(s);
                            if(!s.parent) {
                                this.depthContainers[tile.depth][tile.layerId].addChild(s);
                            }
                        }
                    }
                }
            }
        }
    }
}
