import GameComponent from "../../../_lib/game/GameComponent";
import {Vec2, Vec2Like} from "../../../_lib/math/Geometry";
import Player from "./player/Player";
import {PLAYER_MOVED, VIKING_MOVED} from ".././Events";
import { Cats } from "./cat/Cats";
import Viking from "./viking/Viking";
import { Queue } from "_lib/datastructures/Queue";

export class Collisions extends GameComponent {

    private trail = Queue.Create<Vec2Like>(5);

    constructor(private player: Player, private viking: Viking, private cats: Cats) {

        super();

        this.game.dispatcher.on(PLAYER_MOVED, this.OnPlayerMoved, this);
        this.game.dispatcher.on(VIKING_MOVED, this.OnVikingMoved, this);
    }

    private OnPlayerMoved(position: Vec2): void {

        if(this.viking.Springs.Collides(position)) {
            this.player.HitSpring();
            return;
        }

        this.CheckCollisionWithCat(position);
    }

    private OnVikingMoved(position: Vec2): void {

        if(this.player.Springs.Collides(position)) {
            this.viking.HitSpring();
            return;
        }

        this.CheckCollisionWithCat(position);

        const playerChasing = this.trail.Queue(position.Clone()).Read().some(pos => this.player.Position.Equals(pos));
        if(playerChasing && Math.random() > 0.6) {
            this.viking.DropSpring();
        }
    }

    private CheckCollisionWithCat(position: Vec2): void {
        this.cats.CheckCollision(position).forEach(cat => cat.Follow(position));
    }
}
