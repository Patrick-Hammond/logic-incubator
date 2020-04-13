import GameComponent from "../../../../_lib/game/GameComponent";
import ObjectPool from "../../../../_lib/patterns/ObjectPool";
import Cat from "./Cat";
import Map from "../Map";
import {CAT_POSITIONS, CAT_HOME_PLAYER, CAT_HOME_VIKING} from "../../Events";
import { GetInterval, Wait } from "_lib/game/Timing";
import { Vec2Like } from "_lib/math/Geometry";
import { RGB } from "_lib/utils/Types";

export class Cats extends GameComponent {

    private cats: ObjectPool<Cat>;
    private catCount: number;

    constructor(map: Map) {

        super();

        this.cats = new ObjectPool<Cat>(6, () => new Cat(this.root, map));

        this.game.dispatcher.on(CAT_HOME_PLAYER, this.OnCatHome, this);
        this.game.dispatcher.on(CAT_HOME_VIKING, this.OnCatHome, this);
    }

    Start(): void {
        this.catCount = 0;

        GetInterval(5000, this.DispatchNext, this);
        Wait(500, this.DispatchNext, this);

        GetInterval(5000, this.BroadcastPositions, this);
    }

    CheckCollision(position: Vec2Like): Cat[] {
        return this.cats.Popped.filter(cat => cat.CheckCollision(position));
    }

    private DispatchNext(): void {
        if(this.catCount < 6) {
            this.cats.Get().Start();
            this.catCount++;
        }
    }

    private BroadcastPositions(): void {
        this.game.dispatcher.emit(CAT_POSITIONS, this.cats.Popped);
    }

    private OnCatHome(tint: RGB, cat: Cat) : void {
        this.cats.Put(cat);
    }
}
