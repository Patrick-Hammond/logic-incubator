import {Linear, TweenMax} from "gsap";
import {AnimatedSprite} from "pixi.js";
import {FindShortestPath} from "../../../_lib/algorithms/Search";
import {CallbackDone} from "../../../_lib/game/display/Utils";
import GameComponent from "../../../_lib/game/GameComponent";
import {Vec2} from "../../../_lib/math/Geometry";
import {Wait} from "../../../_lib/utils/Time";
import {Directions} from "../../../_lib/utils/Types";
import {HomeViking} from "../../Constants";
import {CAT_FOLLOWING, VIKING_MOVED} from "../Events";
import {TileToPixel} from "../Utils";
import Map, {TileType} from "./Map";

enum VikingState {
    PATROLLING, END_PATROL, GOING_HOME
}

export default class Viking extends GameComponent {

    private anim: AnimatedSprite;
    private position = new Vec2();
    private state: VikingState;

    public constructor(private map: Map) {
        super();

        this.anim = this.assetFactory.CreateAnimatedSprite("viking");
        this.anim.anchor.set(0.5);
        this.anim.scale.set(-2, 2);
        this.anim.pivot.x = 16;
        this.anim.animationSpeed = 0.1;
        this.anim.play();
        this.root.addChild(this.anim);

        this.game.dispatcher.on(CAT_FOLLOWING, this.OnCatFollowing, this);
    }

    SetPosition(x: number, y: number): void {
        this.position.Set(x, y);
        const pos = TileToPixel(this.position);
        this.anim.position.set(pos.x, pos.y);
    }

    Move(direction: Directions, onComplete?: () => void): void {

        const tileType = this.map.GetTile(this.position, direction).type;

        if(tileType === TileType.TRAVERSABLE) {
            this.anim.play();

            switch(direction) {
                case "left":
                    this.position.x -= 1;
                    this.anim.scale.x = -2;
                    this.anim.pivot.x = 16;
                    break;
                case "right":
                    this.position.x += 1;
                    this.anim.scale.x = 2;
                    this.anim.pivot.x = -16;
                    break;
                case "up":
                    this.position.y -= 1;
                    break;
                case "down":
                    this.position.y += 1;
                    break;
                }

            const pos = TileToPixel(this.position);
            TweenMax.to(this.anim, .75, {x: pos.x, y: pos.y, ease: Linear.easeNone, onComplete: () => {
                if(this.state === VikingState.END_PATROL) {
                    this.GoHome();
                } else {
                    CallbackDone(onComplete);
                }
            }});

            this.game.dispatcher.emit(VIKING_MOVED, this.position);
        }
    }

    MoveTo(x: number, y: number, onComplete?: () => void): void {
        const path = FindShortestPath(this.map, this.position, {x, y});
        if(path.length > 1) {
            const p = path[1];
            if(p.x !== this.position.x) {
                this.Move(p.x < this.position.x ? "left" : "right", () => this.MoveTo(x, y, onComplete));
            } else {
                this.Move(p.y < this.position.y ? "up" : "down", () => this.MoveTo(x, y, onComplete));
            }
        } else {
           CallbackDone(onComplete);
        }
    }

    Patrol(): void {
        this.state = VikingState.PATROLLING;
        this.MoveTo(8, 1, () => this.MoveTo(1, 10, () => this.MoveTo(15, 8, () => this.Patrol())));
    }

    GoHome(): void {
        this.state = VikingState.GOING_HOME;
        this.MoveTo(HomeViking.x, HomeViking.y, () => {
            Wait(5000, () => this.Patrol());
        });
    }

    private OnCatFollowing(target: Vec2): void {
        if(this.state === VikingState.PATROLLING && target === this.position) {
            this.state = VikingState.END_PATROL;
        }
    }
}
