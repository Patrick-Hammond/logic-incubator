import {AnimationSequence} from "../../_lib/game/display/AnimationSequence";
import GameComponent from "../../_lib/game/GameComponent";
import {Vec2} from "../../_lib/math/Geometry";
import {NullFunction} from "../../_lib/patterns/FunctionUtils";
import {GetInterval} from "../../_lib/utils/Time";
import {CAT_FOUND} from "./Events";
import Map, {TileType} from "./Map";
import {TileToPixel} from "./Utils";

export default class Cat extends GameComponent {
    private anim: AnimationSequence;
    private position = new Vec2();
    private stopFollowing = NullFunction;

    constructor(private map: Map) {
        super();

        this.anim = new AnimationSequence(["cat_sit", "cat_walkr", "cat_walkl", "cat_walku", "cat_walkd"]);
        this.anim.root.pivot.set(18, -18);
        this.root.addChild(this.anim.root);
        this.Create();

        this.game.dispatcher.addListener(CAT_FOUND, this.Follow, this);
    }

    Create(): void {
        const {x, y} = this.map.GetRandomPosition();
        this.map.SetTile(x, y, TileType.CAT);
        this.position.Set(x, y);
        const pos = TileToPixel(this.position);
        this.anim.root.position.set(pos.x, pos.y);
        this.anim.Play("cat_sit");
    }

    private Follow(target: Vec2): void {
        this.stopFollowing();
        this.stopFollowing = GetInterval(1000, () => {
            this.map.FindShortestPath(this.position, target);
        })
    }
}
