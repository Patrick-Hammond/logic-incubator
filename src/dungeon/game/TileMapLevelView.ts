import CompositeRectTileLayer from "../../_extern/pixi-tilemap/CompositeRectTileLayer";
import GameComponent from "../../_lib/game/GameComponent";
import {Key} from "../../_lib/io/Keyboard";
import {Point, Rectangle} from "../../_lib/math/Geometry";
import {GameHeight, GameWidth, PlayerSpeed, Scenes, TileSize} from "../Constants";
import {LEVEL_LOADED} from "./Events";
import Level from "./Level";
import * as Stats from "stats.js";

export default class TileMapLevelView extends GameComponent {

    private layers:CompositeRectTileLayer[] = [];
    private viewRect: Rectangle;
    private directionVec: Point = new Point();
    private scaledTileSize: Point = new Point();
    private stats:Stats;
    private needsRefresh: boolean = true;

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

        this.stats = new Stats();
        document.body.appendChild( this.stats.dom );

        this.game.ticker.add(this.OnUpdate, this);
    }

    private OnLevelLoaded(): void {

        this.level.layerIds.forEach((layerId) => {
            const layer = new CompositeRectTileLayer(layerId);
            layer.interactive = layer.interactiveChildren = false;
            layer.name = layerId.toString();
            this.root.addChild(layer);

            this.layers.push(layer);
        });

        this.stats.showPanel(0);

        this.needsRefresh = true;
    }

    private OnUpdate(dt: number): void {

        this.stats.begin();

        this.GetInput();

        this.ScrollView(dt);

        if(this.needsRefresh) {
           this.needsRefresh = false;
           this.Redraw();
        }

        this.stats.end();
    }

    private GetInput():void {

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
    }

    private ScrollView(dt:number):void {

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
    }

    private Redraw():void {

        const level = this.level.levelData;
        const w = this.viewRect.x + this.viewRect.width;
        const h = this.viewRect.y + this.viewRect.height;
        const scale = Math.min(
            GameWidth / this.viewRect.width / TileSize,
            GameHeight / this.viewRect.height / TileSize
        );
       
        // redraw
        for(let l = 0, len = this.layers.length; l < len; l++) {
            const layer = this.layers[l];
            layer.clear();
            layer.scale.set(scale);
            for(let x = this.viewRect.x; x <= w; x++) {
                if(x < 0 || x >= this.level.boundRect.width) {
                    continue;
                }
                for(let y = this.viewRect.y; y <= h; y++) {
                    if(y < 0 || y >= this.level.boundRect.height) {
                        continue;
                    }
                    if(level[l][x] == null || level[l][x][y] == null) {
                        continue;
                    }
                    const tile = level[l][x][y];
                    if(tile) {
                        layer.addFrame(tile.texture, (x - this.viewRect.x) * TileSize, (y - this.viewRect.y) * TileSize);
                    }
                }
            }
        }
    }
}
