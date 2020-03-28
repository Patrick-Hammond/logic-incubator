import {Linear, TweenMax} from "gsap";
import GameComponent from "../../_lib/game/GameComponent";
import {Vec2} from "../../_lib/math/Geometry";
import {Directions} from "../../_lib/utils/Types";
import {Camera} from "./Camera";
import {CAT_FOUND} from "./Events";
import Map, {TileType} from "./Map";
import {TileToPixel} from "./Utils";

enum PlayerState {
    IDLE, MOVING
}

export default class Player extends GameComponent {

    private anim: PIXI.extras.AnimatedSprite;
    private position = new Vec2();
    private state: PlayerState;

    public constructor(private map: Map, private camera: Camera) {
        super();

        this.state = PlayerState.IDLE;

        this.anim = this.assetFactory.CreateAnimatedSprite("player_1");
        this.anim.anchor.set(0.5);
        this.anim.pivot.x = 32;
        this.anim.scale.x = -1;
        this.anim.animationSpeed = 0.1;
        this.root.addChild(this.anim);
    }

    SetPosition(x: number, y: number): void {
        this.position.Set(x, y);
        const pos = TileToPixel(this.position);
        this.anim.position.set(pos.x, pos.y);
        this.camera.Follow(this.anim);
    }

    Move(direction: Directions): void {

        if(this.state === PlayerState.IDLE) {
            const tileType = this.map.GetAdjacentTile(this.position, direction).type;

            if(tileType === TileType.TRAVERSABLE) {
                this.state = PlayerState.MOVING;
                this.anim.play();

                switch(direction) {
                    case "left":
                        this.position.x -= 1;
                        this.anim.scale.x = -1;
                        this.anim.pivot.x = 32;
                        break;
                    case "right":
                        this.position.x += 1;
                        this.anim.scale.x = 1;
                        this.anim.pivot.x = -32;
                        break;
                    case "up":
                        this.position.y -= 1;
                        break;
                    case "down":
                        this.position.y += 1;
                        break;
                    }

                const pos = TileToPixel(this.position);
                TweenMax.to(this.anim, 1, {
                    x: pos.x, y: pos.y, ease: Linear.easeNone,
                    onUpdate: () => this.camera.Follow(this.anim),
                    onComplete: () => this.MoveComplete()
                });
            } else if(tileType === TileType.CAT) {
                this.game.dispatcher.emit(CAT_FOUND, this.position);
            }
        }
    }

    private MoveComplete(): void {
        this.state = PlayerState.IDLE;
        this.anim.stop();
    }
}
