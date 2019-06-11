import GameComponent from "../../../_lib/game/GameComponent";
import {Point, Rectangle} from "../../../_lib/math/Geometry";
import {GameWidth, TileSize, GameHeight, Scenes} from "../../Constants";
import {CAMERA_MOVED} from "../Events";

export class Camera extends GameComponent {

    private viewRect: Rectangle;
    private scale = new Point();
    private scaledTileSize = new Point();
    
    constructor() {

        super();

        this.AddToScene(Scenes.GAME);
    }

    public get Scale():Point {
        return this.scale;
    }

    public get ViewRect() : Rectangle {
        return this.viewRect;
    }

    protected OnInitialise() {

        this.viewRect = new Rectangle(0, 0, GameWidth / TileSize / 2, GameHeight / TileSize / 2);
        this.scale.Set(Math.min(GameWidth / this.viewRect.width / TileSize,
                                GameHeight / this.viewRect.height / TileSize
                            ));
        this.scaledTileSize.Set(GameWidth / this.viewRect.width, GameHeight / this.viewRect.height);
    }

    public Move(x:number, y:number):void {
        this.root.x += x;
        this.root.y += y;

        if(Math.abs(this.root.x) >= this.scaledTileSize.x) {
            let offsetX = -this.root.x / this.scaledTileSize.x;
            this.viewRect.Offset(offsetX, 0);
            this.root.x = 0;
            this.game.dispatcher.emit(CAMERA_MOVED);
        }
        if(Math.abs(this.root.y) >= this.scaledTileSize.y) {
            let offsetY = -this.root.y / this.scaledTileSize.y;
            this.viewRect.Offset(0, offsetY);
            this.root.y = 0;
            this.game.dispatcher.emit(CAMERA_MOVED);
        }
    }
}