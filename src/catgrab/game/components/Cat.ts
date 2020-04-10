import gsap, {Linear, Power3} from "gsap";
import {AdjustmentFilter} from "pixi-filters";
import {FindShortestPath} from "../../../_lib/algorithms/Search";
import {AnimationSequence} from "../../../_lib/game/display/AnimationSequence";
import {RemoveFromParent, CallbackDone} from "../../../_lib/game/display/Utils";
import GameComponent from "../../../_lib/game/GameComponent";
import {Vec2, Vec2Like} from "../../../_lib/math/Geometry";
import {Wait} from "../../../_lib/game/Timing";
import {HomePlayer, HomeViking} from "../../Constants";
import {CAT_FOLLOWING, CAT_HOME_PLAYER, CAT_HOME_VIKING, CAT_MOVED} from "../Events";
import {TileToPixel} from "../Utils";
import Map from "./Map";

enum CatState {
    FALLING, ACTIVE, HOME
}

export default class Cat extends GameComponent {
    private anim: AnimationSequence;
    private position = new Vec2();
    private followTartget: Vec2;
    private tint = new AdjustmentFilter();
    private speed = Math.random() * 0.5 + 1;
    private state: CatState;

    constructor(private parent: PIXI.Container, private map: Map) {
        super();

        this.anim = new AnimationSequence(["cat_fall", "cat_sit", "cat_walkr", "cat_walkl", "cat_walku", "cat_walkd"]);
        this.anim.root.pivot.set(-14, -14);
        this.anim.root.filters = [this.tint];
        this.root.addChild(this.anim.root);
    }

    get Position(): Vec2 {
        return this.position;
    }

    Start(): void {

        // random tint
        this.tint.red   = Math.random() > 0.6 ? 0.7 + Math.random() * 0.5 : 1;
        this.tint.green = Math.random() > 0.6 ? 0.7 + Math.random() * 0.5 : 1;
        this.tint.blue  = Math.random() > 0.6 ? 0.7 + Math.random() * 0.5 : 1;

       this.FallIn();
    }

    MoveTo(x: number, y: number, onComplete?: () => void): void {
        this.position.Set(x, y);
        const pos = TileToPixel({x, y});
        const root = this.anim.root;
        gsap.to(root, this.speed, {x: pos.x, y: pos.y, ease: Linear.easeNone, onComplete: () => {
            this.game.dispatcher.emit(CAT_MOVED, this);
            CallbackDone(onComplete);
        }});

        if(pos.x !== root.x) {
            this.anim.PlayLooped(pos.x > root.x ? "cat_walkr" : "cat_walkl");
        } else if(pos.y !== root.y) {
            this.anim.PlayLooped(pos.y > root.y ? "cat_walkd" : "cat_walku");
        }
    }

    CheckCollision(position: Vec2Like): boolean {
        return this.state === CatState.ACTIVE && this.position.Equals(position.x, position.y);
    }

    HitSpring(): void {
        gsap.killTweensOf(this.anim.root);
        this.state = CatState.FALLING;
        this.followTartget = null;
        const pos = TileToPixel(this.position);
        gsap.to(this.anim.root, 1, {x: pos.x, y: pos.y - 1000, ease: Power3.easeOut, onComplete: () => this.FallIn()});
    }

    Follow(target: Vec2): void {
        if(this.state === CatState.ACTIVE && target !== this.followTartget) {
            const startFollowing = this.followTartget == null;
            this.followTartget = target;
            if(startFollowing) {
                this.MoveToFollowTarget();
                this.game.dispatcher.emit(CAT_FOLLOWING, target);
            }
        }
    }

    private MoveToFollowTarget(): void {
        const path = FindShortestPath(this.map, this.position, this.followTartget);
        if(path.length > 1) {
            this.MoveTo(path[1].x, path[1].y, () => this.MoveToFollowTarget());
        } else {
            const homePlayer = this.followTartget.Equals(HomePlayer);
            const homeViking = this.followTartget.Equals(HomeViking);
            if (homePlayer || homeViking) {
                this.state = CatState.HOME;
                this.anim.Stop();
                RemoveFromParent(this.root);
                this.game.dispatcher.emit(homePlayer ? CAT_HOME_PLAYER : CAT_HOME_VIKING,
                    {r: this.tint.red, g: this.tint.green, b: this.tint.blue}, this);
            } else {
                this.anim.Play("cat_sit");
                Wait(1000, this.MoveToFollowTarget, this);
            }
        }
    }

    private FallIn(): void {
        this.parent.parent.addChild(this.anim.root);
        this.state = CatState.FALLING;
        this.position.Copy(this.map.GetRandomPosition());
        const pos = TileToPixel(this.position);
        this.anim.root.position.set(pos.x, pos.y);
        this.anim.Play("cat_fall");

        gsap.from(this.anim.root, 5, {x: pos.x, y: pos.y - 400, ease: Linear.easeNone, onComplete: () => {
            this.state = CatState.ACTIVE;
            this.anim.Play("cat_sit");
            this.parent.addChild(this.anim.root);
        }});
    }
}
