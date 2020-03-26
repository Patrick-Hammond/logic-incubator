import {Linear, TweenMax} from "gsap";
import GameComponent from "../../_lib/game/GameComponent";
import {Vec2, Vec2Like} from "../../_lib/math/Geometry";
import {Directions} from "../../_lib/utils/Types";
import {TileSize} from "../Constants";
import Map from "./Map";

enum PlayerState {
    IDLE, MOVING
}

export default class Player extends GameComponent {

    private anim: PIXI.extras.AnimatedSprite;
    private position = new Vec2();
    private state: PlayerState;

    public constructor(private map: Map) {
        super();

        this.state = PlayerState.IDLE;

        this.anim = this.assetFactory.CreateAnimatedSprite("player_1");
        this.anim.anchor.set(0.5);
        this.anim.animationSpeed = 0.1;
        this.anim.play();
        this.root.addChild(this.anim);
    }

    public SetPosition(x: number, y: number): void {
        this.position.Set(x, y);
        this.anim.position.set(this.PositionXPixels, this.PositionYPixels);
    }

    public Move(direction: Directions): void {
        if(this.state === PlayerState.IDLE && this.map.CanMove(this.position, direction)) {
            this.state = PlayerState.MOVING;

            switch(direction) {
                case "left":
                    this.position.x -= 1;
                    this.anim.scale.x = -1;
                    break;
                case "right":
                    this.position.x += 1;
                    this.anim.scale.x = 1;
                    break;
                case "up":
                    this.position.y -= 1;
                    break;
                case "down":
                    this.position.y += 1;
                    break;
                }

            TweenMax.to(this.anim, 1, {
                x: this.PositionXPixels, y: this.PositionYPixels, ease: Linear.easeNone,
                onComplete: () => this.state = PlayerState.IDLE
            });
         }
    }

    private get PositionXPixels(): number {
        return this.position.x * TileSize + TileSize * 0.5;
    }

    private get PositionYPixels(): number {
        return this.position.y * TileSize;
    }
}
