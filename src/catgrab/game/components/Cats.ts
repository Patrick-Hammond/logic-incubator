import GameComponent from "../../../_lib/game/GameComponent";
import ObjectPool from "../../../_lib/patterns/ObjectPool";
import Cat from "./Cat";
import Map from "./Map";
import { GetInterval, Wait } from "_lib/game/Timing";
import { Vec2Like } from "_lib/math/Geometry";

export class Cats extends GameComponent {

    private cats: ObjectPool<Cat>;

    constructor(map: Map) {

        super();

        this.cats = new ObjectPool<Cat>(6, () => new Cat(this.root, map));
    }

    Start(): void {
        GetInterval(5000, this.DispatchNext, this);
        Wait(500, this.DispatchNext, this);
    }

    CheckCollision(position: Vec2Like): Cat[] {
        return this.cats.Popped.filter(cat => cat.CheckCollision(position));
    }

    private DispatchNext(): void {
        if(this.cats.Popped.length < 6) {
            this.cats.Get().Start();
        }
    }
}
