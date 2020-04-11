import GameComponent from "../../../_lib/game/GameComponent";
import {Vec2} from "../../../_lib/math/Geometry";
import Cat from ".././components/Cat";
import Player from ".././components/Player";
import {PLAYER_MOVED, VIKING_MOVED, CAT_MOVED} from ".././Events";
import { Cats } from "./Cats";

export class Collisions extends GameComponent {

    constructor(private player: Player, private cats: Cats) {

        super();

        this.game.dispatcher.on(PLAYER_MOVED, this.CheckCollisionWithCat, this);
        this.game.dispatcher.on(VIKING_MOVED, this.CheckCollisionWithCat, this);
        this.game.dispatcher.on(CAT_MOVED,    this.CheckCatCollideWithSpring, this);
    }

    private CheckCollisionWithCat(position: Vec2): void {
        this.cats.CheckCollision(position).forEach(cat => cat.Follow(position));
    }

    private CheckCatCollideWithSpring(cat : Cat): void {
        if(this.player.Springs.Collides(cat.Position)) {
            cat.HitSpring();
        }
    }
}
