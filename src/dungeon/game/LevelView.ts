import GameComponent from "../../_lib/game/GameComponent";
import {Rectangle} from "../../_lib/math/Geometry";
import {Scenes, TileSize} from "../Constants";
import Level from "./Level";

export default class LevelView extends GameComponent {

    private viewRect: Rectangle;
    private needsRefresh: boolean = true;

    constructor(private level: Level) {
        super();
    }

    Init(): void {
        this.AddToScene(Scenes.GAME);
        this.viewRect = new Rectangle(0, 0, 20, 20);
        this.game.ticker.add(this.OnUpdate, this);
    }

    OnUpdate(dt: number): void {
        if(this.needsRefresh) {
            this.needsRefresh = false;

            this.root.removeChildren();

            const offsetX = this.viewRect.x * TileSize;
            const offsetY = this.viewRect.x * TileSize;
            const level = this.level.level;

            for(let x = this.viewRect.x, w = this.viewRect.x + this.viewRect.width; x < w; x++) {
                for(let y = this.viewRect.y, h = this.viewRect.y + this.viewRect.height; y < h; y++) {
                    if(level[x][y]) {
                        const sprites = level[x][y].sprites;
                        for(let z = 0, len = sprites.length; z < len; z++) {
                            const s = sprites[z];
                            s.x = s.x - offsetX;
                            s.y = s.y - offsetY;
                            this.root.addChild(s);
                        }
                    }
                }
            }
        }
    }
}
