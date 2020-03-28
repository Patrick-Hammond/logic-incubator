import {Linear, TweenMax} from "gsap";
import {AnimationSequence} from "../../_lib/game/display/AnimationSequence";
import GameComponent from "../../_lib/game/GameComponent";
import {Vec2} from "../../_lib/math/Geometry";
import {GetInterval} from "../../_lib/utils/Time";
import {CAT_FOUND, CAT_HOME} from "./Events";
import Map, {TileType} from "./Map";
import {TileToPixel} from "./Utils";

enum CatState {
    IDLE, FOLLOWING
}

export default class Cat extends GameComponent {
    private anim: AnimationSequence;
    private position = new Vec2();
    private catState: CatState;

    constructor(private map: Map) {
        super();

        this.anim = new AnimationSequence(["cat_sit", "cat_walkr", "cat_walkl", "cat_walku", "cat_walkd"]);
        this.anim.root.pivot.set(-14, -14);
        this.root.addChild(this.anim.root);
        this.Create();

        this.game.dispatcher.addListener(CAT_FOUND, this.Follow, this);
    }

    Create(): void {
        const {x, y} = this.map.GetRandomPosition();
        this.map.SetTile(x, y, TileType.CAT);
        this.position.Set(x, y);

        this.catState = CatState.IDLE;

        const pos = TileToPixel(this.position);
        this.anim.root.position.set(pos.x, pos.y);
        this.anim.Play("cat_sit");
    }

    MoveTo(x: number, y: number, onComplete?: () => void): void {
        this.position.Set(x, y);
        const pos = TileToPixel({x, y});
        const root = this.anim.root;
        TweenMax.to(root, 1.5, {x: pos.x, y: pos.y, ease: Linear.easeNone, onComplete: () => {
            this.anim.Play("cat_sit");
            if(onComplete) {
                onComplete();
            }
        }});

        if(pos.x !== root.x) {
            this.anim.PlayLooped(pos.x > root.x ? "cat_walkr" : "cat_walkl");
        } else if(pos.y !== root.y) {
            this.anim.PlayLooped(pos.y > root.y ? "cat_walkd" : "cat_walku");
        }
    }

    private Follow(target: Vec2): void {
        if(this.catState === CatState.IDLE) {
            this.catState = CatState.FOLLOWING;

            this.map.SetTile(this.position.x, this.position.y, TileType.TRAVERSABLE);

            const stopFollowing = GetInterval(1500, () => {
                const path = this.map.FindShortestPath(this.position, target);
                if(path.length > 1) {
                    this.MoveTo(path[0].x, path[0].y);
                } else if (target.Equals(14, 2)) {
                    stopFollowing();
                    this.GoHome();
                }
            });
        }
    }

    private GoHome(): void {
        this.MoveTo(14, 2, () => {
            this.game.dispatcher.emit(CAT_HOME);
        });
    }
}
