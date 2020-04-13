import gsap, {Linear, Power3} from "gsap";
import {AnimatedSprite} from "pixi.js";
import {FindShortestPath, SearchNode, FindClosestNode} from "../../../../_lib/algorithms/Search";
import {CallbackDone} from "../../../../_lib/game/display/Utils";
import GameComponent from "../../../../_lib/game/GameComponent";
import {Vec2, Vec2Like} from "../../../../_lib/math/Geometry";
import {NullFunction} from "../../../../_lib/patterns/FunctionUtils";
import {Cancel, Wait} from "../../../../_lib/game/Timing";
import {Direction} from "../../../../_lib/utils/Types";
import {VikingHomeLocation} from "../../../Constants";
import {CAT_FOLLOWING, VIKING_MOVED, CAT_POSITIONS} from "../../Events";
import {TileToPixel} from "../../Utils";
import Map, {TileType} from "../Map";
import { Springs } from "../Springs";

enum VikingState {
    PATROLLING, END_PATROL, GOING_HOME, FALLING
}

export default class Viking extends GameComponent {

    private anim: AnimatedSprite;
    private position = new Vec2();
    private state: VikingState;
    private catPositions: SearchNode[] = [];
    private cancelDelayedPatrol: Cancel = NullFunction;
    private springs: Springs;

    public constructor(private map: Map) {
        super();

        this.anim = this.assetFactory.CreateAnimatedSprite("viking");
        this.anim.anchor.set(0.5);
        this.anim.scale.set(-2, 2);
        this.anim.pivot.x = 16;
        this.anim.animationSpeed = 0.1;
        this.anim.play();
        this.root.addChild(this.anim);

        this.springs = new Springs();

        this.game.dispatcher.on(CAT_FOLLOWING, this.OnCatFollowing, this);
        this.game.dispatcher.on(CAT_POSITIONS, (cats) => this.catPositions = cats);
    }

    get Springs(): Springs {
        return this.springs;
    }

    Start(position: Vec2Like): void {
        this.position.Copy(position);
        const pos = TileToPixel(this.position);
        this.anim.position.set(pos.x, pos.y);
        this.Patrol();
    }

    HitSpring(): void {
        this.cancelDelayedPatrol();
        gsap.killTweensOf(this.anim);
        this.state = VikingState.FALLING;

        this.position.Copy(this.map.GetRandomPosition());
        const pos = TileToPixel(this.position);
        gsap.to(this.anim, 0.75, {x: pos.x, y: pos.y - 400, ease: Power3.easeOut});
        gsap.to(this.anim, 1, {x: pos.x, y: pos.y, delay: 0.75, ease: Power3.easeIn, onComplete: () => this.ChaseCat()});
    }

    DropSpring() : void {
        this.springs.Drop(this.position, 1);
    }

    private OnCatFollowing(target: Vec2): void {
        if(this.state === VikingState.PATROLLING && target === this.position) {
            this.state = VikingState.END_PATROL;
            this.cancelDelayedPatrol();
        }
    }

    private ChaseCat(): void {
        this.state = VikingState.PATROLLING;

        if(this.catPositions.length) {
            const closestCat = FindClosestNode(this.map, this.position, this.catPositions);
            if(closestCat) {
                this.MoveTo(closestCat.position.x, closestCat.position.y, () => this.Patrol());
                return;
            }
        }

        this.Patrol();
    }

    private Patrol(): void {
        this.state = VikingState.PATROLLING;

        const routes = [[8, 1], [1, 10], [15, 8], [8, 9], [5, 5], [2, 3], [14, 3]];
        const route = routes[((Math.random() * routes.length) | 0)];
        this.MoveTo(route[0], route[1], () => this.ChaseCat());
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

            Wait(500, () => this.game.dispatcher.emit(VIKING_MOVED, this.position));
        }
    }

    private GoHome(): void {
        this.state = VikingState.GOING_HOME;
        this.MoveTo(VikingHomeLocation.x, VikingHomeLocation.y, () => {
            this.cancelDelayedPatrol = Wait(5000, () => this.ChaseCat());
        });
    }
}
