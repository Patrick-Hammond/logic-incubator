import GameComponent from "../../../_lib/game/GameComponent";
import {Key} from "../../../_lib/io/Keyboard";
import {LEVEL_CREATED} from "../Events";
import {Vec2} from "../../../_lib/math/Geometry";
import Level, {CollisionType} from "../Level";
import {PlayerSpeed, Scenes, TileSize} from "../../Constants";
import {Camera} from "./Camera";
import AssetFactory from "../../../_lib/loading/AssetFactory";
import CompositeRectTileLayer from "../../../_extern/pixi-tilemap/CompositeRectTileLayer";

export class Player extends GameComponent {

    private player: PIXI.extras.AnimatedSprite;
    private inputVec = new Vec2();
    private directionVec = new Vec2();
    private newPosition = new Vec2();
    private playerLayer:CompositeRectTileLayer;

    constructor(private level: Level, private camera:Camera) {

        super();

        this.game.dispatcher.on(LEVEL_CREATED, this.OnLevelCreated, this);
        
        this.AddToScene(Scenes.GAME);
    }

    private OnLevelCreated(): void {

        this.player = AssetFactory.inst.CreateAnimatedSprite("chest_full_open_anim");
        this.player.play();
        this.player.animationSpeed = 0.1;

        const pos = this.level.playerStartPosition;
        this.player.position.set(pos.x * TileSize, pos.y * TileSize);

        this.playerLayer = this.camera.root.getChildByName(pos.layerId.toString()) as CompositeRectTileLayer;

        this.game.ticker.add(this.OnUpdate, this);
    }

    private OnUpdate(dt:number): void {

        this.GetInput();

        this.Move(dt);
        
        this.camera.Follow(this.player.x, this.player.y, 0.05);

        this.Render();
    }

    private GetInput():void {

        if(this.game.keyboard.AnyKeyPressed()) {

            this.inputVec.Set(0, 0);

            if(this.game.keyboard.KeyPressed(Key.UpArrow)) {
                this.inputVec.Offset(0, 1);
            }
            if(this.game.keyboard.KeyPressed(Key.DownArrow)) {
                this.inputVec.Offset(0, -1);
            }
            if(this.game.keyboard.KeyPressed(Key.LeftArrow)) {
                this.inputVec.Offset(1, 0);
            }
            if(this.game.keyboard.KeyPressed(Key.RightArrow)) {
                this.inputVec.Offset(-1, 0);
            }

            const n = this.inputVec.normalized;
            this.directionVec.Offset(n.x, n.y);
        }
    }

    private Move(dt:number):void {

        const deltaX = this.directionVec.x * dt * PlayerSpeed;
        const deltaY = this.directionVec.y * dt * PlayerSpeed;     

        this.newPosition.x = this.player.x - deltaX;
        this.newPosition.y = this.player.y - deltaY;

        const movedX = Math.floor(this.player.x / TileSize) !== Math.floor(this.newPosition.x / TileSize);
        const movedY = Math.floor(this.player.y / TileSize) !== Math.floor(this.newPosition.y / TileSize);

        const collision = movedX || movedY ? this.level.CheckCollision(this.player.position, this.newPosition) : null;

        if(collision) {
            if(movedX && collision.type === CollisionType.X || collision.type === CollisionType.XY) {
                if(deltaX > 0) {
                    this.player.x = (this.player.x | 0) + collision.distance * TileSize;
                }
                else {
                    this.player.x = (this.player.x | 0) - collision.distance * TileSize;
                }
                this.directionVec.x = 0;
            } else {
                this.player.x -= deltaX;
            }
            
            if(movedY && collision.type === CollisionType.Y || collision.type === CollisionType.XY) {
                if(deltaY > 0) {
                    this.player.y = (this.player.y | 0) + collision.distance * TileSize;
                }
                else {
                    this.player.y = (this.player.y | 0) - collision.distance * TileSize;
                }
                this.directionVec.y = 0;
            } else {
                this.player.y -= deltaY;
            }
        }
        else {
            this.player.x -= deltaX;
            this.player.y -= deltaY;
        }

        this.directionVec.x *= 0.9 * dt;
        this.directionVec.y *= 0.9 * dt;
    }

    private Render():void {
        this.playerLayer.clear();
        this.playerLayer.addFrame(
            this.player.texture, 
            this.player.x - this.camera.ViewRect.x * TileSize,
            this.player.y - this.camera.ViewRect.y * TileSize
        )
    }
}