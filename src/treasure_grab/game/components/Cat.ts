import {Linear, TweenMax} from "gsap";
import {AdjustmentFilter} from "pixi-filters";
import {Container} from "pixi.js";
import {FindShortestPath} from "../../../_lib/algorithms/Search";
import {AnimationSequence} from "../../../_lib/game/display/AnimationSequence";
import GameComponent from "../../../_lib/game/GameComponent";
import {Vec2, Vec2Like} from "../../../_lib/math/Geometry";
import {Wait} from "../../../_lib/utils/Time";
import {CAT_HOME} from "../Events";
import {TileToPixel} from "../Utils";
import Map from "./Map";

export default class Cat extends GameComponent {
    private anim: AnimationSequence;
    private position = new Vec2();
    private followTartget: Vec2;
    private tint = new AdjustmentFilter();

    constructor(private map: Map) {
        super();

        this.anim = new AnimationSequence(["cat_fall", "cat_sit", "cat_walkr", "cat_walkl", "cat_walku", "cat_walkd"]);
        this.anim.root.pivot.set(-14, -14);
        this.anim.root.filters = [this.tint];
        this.root.addChild(this.anim.root);
    }

    Create(parent: Container): void {
        const {x, y} = this.map.GetRandomPosition();
        this.position.Set(x, y);
        this.tint.red   = Math.random() > 0.6 ? 0.7 + Math.random() * 0.3 : 1;
        this.tint.green = Math.random() > 0.6 ? 0.7 + Math.random() * 0.3 : 1;
        this.tint.blue  = Math.random() > 0.6 ? 0.7 + Math.random() * 0.3 : 1;

        const pos = TileToPixel(this.position);
        this.anim.root.position.set(pos.x, pos.y);
        this.anim.Play("cat_fall");

        TweenMax.from(this.anim.root, 5, {x: pos.x, y: pos.y - 400, ease: Linear.easeNone, onComplete: () => {
            this.anim.Play("cat_sit");
            parent.addChild(this.anim.root);
        }});
    }

    MoveTo(x: number, y: number, onComplete?: () => void): void {
        this.position.Set(x, y);
        const pos = TileToPixel({x, y});
        const root = this.anim.root;
        TweenMax.to(root, 1.5, {x: pos.x, y: pos.y, ease: Linear.easeNone, onComplete});

        if(pos.x !== root.x) {
            this.anim.PlayLooped(pos.x > root.x ? "cat_walkr" : "cat_walkl");
        } else if(pos.y !== root.y) {
            this.anim.PlayLooped(pos.y > root.y ? "cat_walkd" : "cat_walku");
        }
    }

    CheckCollision(position: Vec2Like): boolean {
        return this.position.Equals(position.x, position.y);
    }

    Follow(target: Vec2): void {
        if(target !== this.followTartget) {
            this.followTartget = target;
            this.MoveToFollowTarget();
        }
    }

    private MoveToFollowTarget(): void {
        const path = FindShortestPath(this.map, this.position, this.followTartget);
        if(path.length > 1) {
            this.MoveTo(path[1].x, path[1].y, () => this.MoveToFollowTarget());
        } else if (this.followTartget.Equals(14, 2)) {
            this.GoHome();
        } else {
            this.anim.Play("cat_sit");
            Wait(1000, this.MoveToFollowTarget, this);
        }
    }

    private GoHome(): void {
        this.MoveTo(14, 2, () => {
            this.game.dispatcher.emit(CAT_HOME, {r: this.tint.red, g: this.tint.green, b: this.tint.blue});
        });
    }
}
