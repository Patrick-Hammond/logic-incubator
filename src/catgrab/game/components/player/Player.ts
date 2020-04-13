import gsap, {Linear, Power3} from "gsap";
import {AnimatedSprite} from "pixi.js";
import GameComponent from "../../../../_lib/game/GameComponent";
import {Vec2, Vec2Like} from "../../../../_lib/math/Geometry";
import {Direction} from "../../../../_lib/utils/Types";
import {PLAYER_MOVED} from "../../Events";
import {TileToPixel} from "../../Utils";
import {Camera} from "../Camera";
import Map, {TileType} from "../Map";
import { Springs } from "../Springs";
import PlayerControl from "./PlayerControl";

enum PlayerState {
    IDLE, MOVING, FALLING
}

export default class Player extends GameComponent {

    private playerControl: PlayerControl;
    private anim: AnimatedSprite;
    private position = new Vec2();
    private state: PlayerState;
    private springs: Springs;

    public constructor(private map: Map, private camera: Camera) {
        super();

        this.state = PlayerState.IDLE;

        this.anim = this.assetFactory.CreateAnimatedSprite("player_1");
        this.anim.anchor.set(0.5);
        this.anim.pivot.x = -32;
        this.anim.animationSpeed = 0.1;
        this.root.addChild(this.anim);

        this.springs = new Springs();
        this.playerControl = new PlayerControl(0);

        this.game.ticker.add(this.OnUpdate, this);
    }

    get Springs(): Springs {
        return this.springs;
    }

    get Position() : Vec2 {
        return this.position;
    }

    Start(position: Vec2Like): void {
        this.position.Copy(position);
        const pos = TileToPixel(this.position);
        this.anim.position.set(pos.x, pos.y);
        this.camera.Follow(this.anim);
    }

    HitSpring(): void {
        gsap.killTweensOf(this.anim);
        this.state = PlayerState.FALLING;

        this.position.Copy(this.map.GetRandomPosition());
        const pos = TileToPixel(this.position);
        gsap.to(this.anim, 0.75, {x: pos.x, y: pos.y - 400, ease: Power3.easeOut,
            onUpdate: () => {
                this.camera.Follow(this.anim);
            }
        });
        gsap.to(this.anim, 1, {x: pos.x, y: pos.y, delay: 0.75, ease: Power3.easeIn,
            onComplete: () => {
                this.state = PlayerState.IDLE
                this.camera.Follow(this.anim);
            }
        });
    }

    private OnUpdate(): void {
        const input = this.playerControl.Get();
        if(input && input.length) {
            input.forEach(i => i === "fire" ? this.DropSpring() : this.Move(i));
        }
    }

    private Move(direction: Direction): void {

        if(this.state === PlayerState.IDLE) {
            const tileType = this.map.GetTile(this.position, direction).type;

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
                gsap.to(this.anim, .5, {
                    x: pos.x, y: pos.y, ease: Linear.easeNone,
                    onUpdate: () => this.camera.Follow(this.anim),
                    onComplete: () => {
                        this.state = PlayerState.IDLE;
                        this.anim.stop();
                        this.game.dispatcher.emit(PLAYER_MOVED, this.position);
                    }
                });
            }
        }
    }

    private DropSpring() : void {
        this.springs.Drop(this.position, 1);
    }
}
