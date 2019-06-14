import GameComponent from "../../../_lib/game/GameComponent";
import {Point, PointLike, Rectangle} from "../../../_lib/math/Geometry";
import {GameWidth, TileSize, GameHeight, Scenes} from "../../Constants";
import {CAMERA_MOVED} from "../Events";

export class Camera extends GameComponent {

    private viewRect: Rectangle;
    private scale:number;
    private scaledTileSize:number;
    
    constructor() {

        super();

        this.AddToScene(Scenes.GAME);
    }

    public get Zoom():number {
        return 2;
    }

    public get Scale():number {
        return this.scale;
    }

    public get ScaledTileSize():number {
        return this.scaledTileSize;
    }

    public get ViewRect() : Rectangle {
        return this.viewRect;
    }

    protected OnInitialise() {

        this.viewRect = new Rectangle(0, 0, Math.floor(GameWidth / TileSize / this.Zoom), Math.floor(GameHeight / TileSize / this.Zoom));
        this.scale = Math.min(GameWidth / this.viewRect.width / TileSize, GameHeight / this.viewRect.height / TileSize);
        this.scaledTileSize = TileSize * this.scale;
    }

    public Move(x:number, y:number):void {

        this.root.x += x;
        this.root.y += y;

        if(Math.abs(this.root.x) >= this.scaledTileSize) {
            let offsetX = -this.root.x / this.scaledTileSize;
            this.viewRect.Offset(offsetX | 0, 0);
            this.root.x = offsetX % 1;
            this.game.dispatcher.emit(CAMERA_MOVED);
        }
        if(Math.abs(this.root.y) >= this.scaledTileSize) {
            let offsetY = -this.root.y / this.scaledTileSize;
            this.viewRect.Offset(0, offsetY | 0);
            this.root.y = offsetY % 1;
            this.game.dispatcher.emit(CAMERA_MOVED);
        }
    }

    public CenterOn(x:number, y:number):void {

        this.viewRect.Set(x - this.viewRect.width * 0.5, y - this.viewRect.height * 0.5, this.viewRect.width, this.viewRect.height);
        this.root.position.set(0, 0);
        this.game.dispatcher.emit(CAMERA_MOVED);
    }
}