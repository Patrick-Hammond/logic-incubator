import GameComponent from "../../../_lib/game/GameComponent";
import {Key} from "../../../_lib/io/Keyboard";
import {LEVEL_LOADED} from "../Events";
import {Point} from "../../../_lib/math/Geometry";
import Level from "../Level";
import {PlayerSpeed, Scenes, GameWidth, GameHeight} from "../../Constants";
import {Camera} from "./Camera";
import AssetFactory from "../../../_lib/loading/AssetFactory";

export class Player extends GameComponent {

    private player: PIXI.extras.AnimatedSprite;
    private inputVec: Point = new Point();
    private directionVec: Point = new Point();
    
    constructor(private level: Level, private camera:Camera) {

        super();

        this.game.dispatcher.on(LEVEL_LOADED, this.OnLevelLoaded, this);
        
        this.game.ticker.add(this.OnUpdate, this);

        this.AddToScene(Scenes.GAME);
    }

    private OnLevelLoaded(): void {

        const pos = this.level.playerStartPosition; 
        this.camera.CenterOn(pos.x, pos.y);

        this.player = AssetFactory.inst.CreateAnimatedSprite("chest_full_open_anim");
        this.player.position.set(this.camera.ViewRect.width * 0.5 * this.camera.ScaledTileSize,
                                 this.camera.ViewRect.height * 0.5 * this.camera.ScaledTileSize);
        this.player.scale.set(this.camera.Scale);
        this.player.interactive = this.player.interactiveChildren = false;
        this.player.play();
        this.player.animationSpeed = 0.1;

        this.root.addChild(this.player);
    }

    private OnUpdate(dt:number): void {

        this.GetInput();
        this.Move(dt);
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

        this.camera.Move(this.directionVec.x * dt * PlayerSpeed, this.directionVec.y * dt * PlayerSpeed);

        this.directionVec.x *= 0.9 * dt;
        this.directionVec.y *= 0.9 * dt;
    }
}