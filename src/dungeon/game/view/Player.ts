import CompositeRectTileLayer from "../../../_extern/pixi-tilemap/CompositeRectTileLayer";
import GameComponent from "../../../_lib/game/GameComponent";
import {Key} from "../../../_lib/io/Keyboard";
import AssetFactory from "../../../_lib/loading/AssetFactory";
import {Vec2, Vec2Like} from "../../../_lib/math/Geometry";
import {PlayerSpeed, Scenes, TileSize} from "../../Constants";
import {Camera} from "./Camera";
import TileCollision, {CollisionType} from "../level/TileCollision";

export class Player extends GameComponent {

    private player: PIXI.extras.AnimatedSprite;
    private inputVec = new Vec2();
    private directionVec = new Vec2();
    private newPosition = new Vec2();

    constructor(
        playerStartPosition: Vec2Like,
        private playerLayer:CompositeRectTileLayer,
        private camera:Camera,
        private collision:TileCollision) {

        super();

        this.player = AssetFactory.inst.CreateAnimatedSprite("chest_full_open_anim");
        this.player.play();
        this.player.animationSpeed = 0.1;
        this.player.position.set(playerStartPosition.x * TileSize, playerStartPosition.y * TileSize);

        this.game.ticker.add(this.OnUpdate, this);
        
        this.AddToScene(Scenes.GAME);
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

        this.directionVec.x *= 0.9 * dt;
        this.directionVec.y *= 0.9 * dt;

        this.newPosition.x = this.player.x - deltaX;
        this.newPosition.y = this.player.y - deltaY;

        const movedX = Math.floor(this.player.x / TileSize) !== Math.floor(this.newPosition.x / TileSize);
        const movedY = Math.floor(this.player.y / TileSize) !== Math.floor(this.newPosition.y / TileSize);

        if(movedX || movedY) {

            const collision = this.collision.Test(this.player.position, this.newPosition);
            if(collision.type !== CollisionType.NONE) {
                this.player.position.set(collision.result.x, collision.result.y);

                if(collision.type == CollisionType.X || collision.type == CollisionType.XY) {
                    this.directionVec.x = 0;
                }
                if(collision.type == CollisionType.Y || collision.type == CollisionType.XY) {
                    this.directionVec.y = 0;
                }
            } else {
                this.player.x -= deltaX;
                this.player.y -= deltaY;
            }

        } else {
            this.player.x -= deltaX;
            this.player.y -= deltaY;
        }
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