import gsap, {Linear} from "gsap";
import {AnimatedSprite} from "pixi.js";
import {FindShortestPath, SearchNode, FindClosestNode, GetPath} from "../../../_lib/algorithms/Search";
import {CallbackDone} from "../../../_lib/game/display/Utils";
import GameComponent from "../../../_lib/game/GameComponent";
import {Vec2, Vec2Like} from "../../../_lib/math/Geometry";
import {NullFunction} from "../../../_lib/patterns/FunctionUtils";
import {Cancel, Wait} from "../../../_lib/game/Timing";
import {Direction} from "../../../_lib/utils/Types";
import {VikingHomeLocation} from "../../Constants";
import {CAT_FOLLOWING, VIKING_MOVED, CAT_POSITIONS} from "../Events";
import {TileToPixel} from "../Utils";
import Map, {TileType} from "./Map";

enum VikingState {
    PATROLLING, END_PATROL, GOING_HOME
}

export default class Viking extends GameComponent {

    private anim: AnimatedSprite;
    private position = new Vec2();
    private state: VikingState;
    private catPositions: SearchNode[] = [];
    private cancelDelayedPatrol: Cancel = NullFunction;

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
        this.game.dispatcher.on(CAT_POSITIONS, (cats) => this.catPositions = cats);
    }

    Start(position: Vec2Like): void {
        this.position.Copy(position);
        const pos = TileToPixel(this.position);
        this.anim.position.set(pos.x, pos.y);
        this.Patrol();
    }

    private OnCatFollowing(target: Vec2): void {
        if(this.state === VikingState.PATROLLING && target === this.position) {
            this.state = VikingState.END_PATROL;
            this.cancelDelayedPatrol();
        }
    }

    private Patrol(): void {
        this.state = VikingState.PATROLLING;

        if(this.catPositions.length) {
            const closestCat = FindClosestNode(this.map, this.position, this.catPositions);
            if(closestCat) {
                this.MoveTo(closestCat.position.x, closestCat.position.y, () => this.Patrol());
                return;
            }
        }

        const route = Math.random();
        if(route < 0.3) {
            this.MoveTo(8, 1, () => this.MoveTo(1, 10, () => this.MoveTo(15, 8, () => this.Patrol())));
        } else if(route < 0.6) {
            this.MoveTo(8, 9, () => this.MoveTo(5, 5, () => this.MoveTo(1, 7, () => this.Patrol())));
        } else {
            this.MoveTo(2, 3, () => this.MoveTo(14, 3, () => this.Patrol()));
        }
    }

    private MoveTo(x: number, y: number, onComplete?: () => void): void {
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

    private Move(direction: Direction, onComplete?: () => void): void {

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
            gsap.to(this.anim, .75, {x: pos.x, y: pos.y, ease: Linear.easeNone, onComplete: () => {
                if(this.state === VikingState.END_PATROL) {
                    this.GoHome();
                } else {
                    CallbackDone(onComplete);
                }
            }});

            this.game.dispatcher.emit(VIKING_MOVED, this.position);
        }
    }

    private GoHome(): void {
        this.state = VikingState.GOING_HOME;
        this.MoveTo(VikingHomeLocation.x, VikingHomeLocation.y, () => {
            this.cancelDelayedPatrol = Wait(5000, () => this.Patrol());
        });
    }
}
