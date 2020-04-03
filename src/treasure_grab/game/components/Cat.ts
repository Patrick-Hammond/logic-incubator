import {Linear, TweenMax} from "gsap";
import {AdjustmentFilter} from "pixi-filters";
import {FindShortestPath} from "../../../_lib/algorithms/Search";
import {AnimationSequence} from "../../../_lib/game/display/AnimationSequence";
import GameComponent from "../../../_lib/game/GameComponent";
import {Vec2, Vec2Like} from "../../../_lib/math/Geometry";
import {CAT_FOUND, CAT_HOME, PLAYER_MOVED} from "../Events";
import {TileToPixel} from "../Utils";
import Map, {TileType} from "./Map";

enum CatState {
    IDLE, FOLLOWING, MOVING, HOME
}

export default class Cat extends GameComponent {
    private anim: AnimationSequence;
    private position = new Vec2();
    private catState: CatState;
    private tint = new AdjustmentFilter();

    constructor(private map: Map) {
        super();

        this.anim = new AnimationSequence(["cat_sit", "cat_walkr", "cat_walkl", "cat_walku", "cat_walkd"]);
        this.anim.root.pivot.set(-14, -14);
        this.anim.root.filters = [this.tint];
        this.root.addChild(this.anim.root);
        this.Create();

        this.game.dispatcher.addListener(CAT_FOUND, (target: Vec2) => {
            this.catState = CatState.FOLLOWING;
            this.Follow(target);
        });
        this.game.dispatcher.addListener(PLAYER_MOVED, (target: Vec2) => {
            if(this.catState === CatState.FOLLOWING) {
                this.Follow(target);
            }
        });
    }

    Create(): void {
        const {x, y} = this.map.GetRandomPosition();
        this.map.SetTile(x, y, TileType.CAT);
        this.position.Set(x, y);

        this.catState = CatState.IDLE;

        this.tint.red   = Math.random() > 0.6 ? 0.7 + Math.random() * 0.3 : 1;
        this.tint.green = Math.random() > 0.6 ? 0.7 + Math.random() * 0.3 : 1;
        this.tint.blue  = Math.random() > 0.6 ? 0.7 + Math.random() * 0.3 : 1;

        const pos = TileToPixel(this.position);
        this.anim.root.position.set(pos.x, pos.y);
        this.anim.Play("cat_sit");
    }

    MoveTo(x: number, y: number, onComplete?: () => void): void {

        this.catState = CatState.MOVING;

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

    private Follow(target: Vec2): void {
        const path = FindShortestPath(this.map, this.position, target);
        if(path.length > 1) {
            this.MoveTo(path[1].x, path[1].y, () => this.Follow(target));
        } else if (target.Equals(14, 2)) {
            this.GoHome();
        } else {
            this.catState = CatState.FOLLOWING;
            this.anim.Play("cat_sit");
        }
    }

    private GoHome(): void {
        this.MoveTo(14, 2, () => {
            this.catState = CatState.HOME;
            this.game.dispatcher.emit(CAT_HOME, {r: this.tint.red, g: this.tint.green, b: this.tint.blue});
            this.Create();
        });
    }
}
