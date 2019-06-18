import GameComponent from "../../../_lib/game/GameComponent";
import {Rectangle} from "../../../_lib/math/Geometry";
import {GameWidth, TileSize, GameHeight, Scenes} from "../../Constants";
import {CAMERA_MOVED} from "../Events";
import {Sign, Lerp} from "../../../_lib/math/Utils";

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

        const rootX = Math.abs(this.root.x);
        if(rootX >= this.scaledTileSize) {
            const dir = Sign(this.root.x);
            const over = (rootX - (rootX | 0)) * dir;
            this.viewRect.Offset(-dir, 0);
            this.root.x = over;
            this.game.dispatcher.emit(CAMERA_MOVED);
        }

        const rootY = Math.abs(this.root.y);
        if(rootY >= this.scaledTileSize) {
            const dir = Sign(this.root.y);
            const over = (rootY - (rootY | 0)) * dir;
            this.viewRect.Offset(0, -dir);
            this.root.y = over;
            this.game.dispatcher.emit(CAMERA_MOVED);
        }
    }

    public CenterOn(x:number, y:number):void {

        this.viewRect.Set(x - this.viewRect.width * 0.5, y - this.viewRect.height * 0.5, this.viewRect.width, this.viewRect.height);
        this.root.position.set(0, 0);
        this.game.dispatcher.emit(CAMERA_MOVED);
    }

    public Follow(pixelX:number, pixelY:number, amount:number):void {

        this.viewRect.Set(
            Lerp(this.viewRect.x, pixelX / TileSize - this.viewRect.width * 0.5, amount), 
            Lerp(this.viewRect.y, pixelY / TileSize - this.viewRect.height * 0.5, amount)
            );
        this.root.position.set(0, 0);
        this.game.dispatcher.emit(CAMERA_MOVED);
    }
}