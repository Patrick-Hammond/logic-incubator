import GameComponent from "../../../_lib/game/GameComponent";
import {Key} from "../../../_lib/io/Keyboard";
import {LEVEL_CREATED} from "../Events";
import {Point} from "../../../_lib/math/Geometry";
import Level from "../Level";
import {PlayerSpeed, Scenes, TileSize} from "../../Constants";
import {Camera} from "./Camera";
import AssetFactory from "../../../_lib/loading/AssetFactory";
import CompositeRectTileLayer from "../../../_extern/pixi-tilemap/CompositeRectTileLayer";

export class Player extends GameComponent {

    private player: PIXI.extras.AnimatedSprite;
    private inputVec = new Point();
    private directionVec = new Point();
    private boundsVec = new Point();
    private playerLayer:CompositeRectTileLayer;
    private startPos = new Point();

    constructor(private level: Level, private camera:Camera) {

        super();

        this.game.dispatcher.on(LEVEL_CREATED, this.OnLevelCreated, this);
        
        this.AddToScene(Scenes.GAME);
    }

    private OnLevelCreated(): void {

        const pos = this.level.playerStartPosition;
        this.startPos.Set(pos.x * TileSize, pos.y * TileSize);

        this.player = AssetFactory.inst.CreateAnimatedSprite("chest_full_open_anim");
        this.player.play();
        this.player.animationSpeed = 0.1;

        this.playerLayer = this.camera.root.getChildByName(pos.layerId.toString()) as CompositeRectTileLayer;

        this.game.ticker.add(this.OnUpdate, this);
    }

    private OnUpdate(dt:number): void {

        this.GetInput();
        this.Move(dt);
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

        let deltaX = this.directionVec.x * dt * PlayerSpeed;
        let deltaY = this.directionVec.y * dt * PlayerSpeed;
/*
        this.boundsVec.x = this.startPos.x + this.player.x - deltaX;
        this.boundsVec.y = this.startPos.y + this.player.y - deltaY;

        let posX = (this.camera.ViewRect.x + this.boundsVec.x / this.camera.ScaledTileSize) | 0;
        let posY = (this.camera.ViewRect.y + this.boundsVec.y / this.camera.ScaledTileSize) | 0;
        
        if(this.level.CheckCollision(posX, posY)){
            console.log("hit!");
        }
  */      
        this.player.x -= deltaX;
        this.player.y -= deltaY;

        this.camera.Follow(
            this.startPos.x + this.player.x,
            this.startPos.y + this.player.y,
            0.2
        );

        this.directionVec.x *= 0.9 * dt;
        this.directionVec.y *= 0.9 * dt;
    }

    private Render():void {
        this.playerLayer.clear();
        this.playerLayer.addFrame(
            this.player.texture, 
            this.startPos.x - this.camera.ViewRect.x * TileSize + this.player.x,
            this.startPos.y - this.camera.ViewRect.y * TileSize + this.player.y
        )
    }
}