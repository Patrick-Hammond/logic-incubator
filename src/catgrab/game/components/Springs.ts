
import GameComponent from "../../../_lib/game/GameComponent";
import { Vec2Like } from "_lib/math/Geometry";
import { Sprite } from "pixi.js";
import ObjectPool from "_lib/patterns/ObjectPool";
import AssetFactory from "_lib/loading/AssetFactory";
import { TileToPixel } from "../Utils";

export class Springs extends GameComponent {

    private springs: ObjectPool<Spring>;

    constructor() {
        super();
    }

    OnInitialise(): void {
        this.springs = new ObjectPool<Spring>(2, () => new Spring());
    }

    Drop(position: Vec2Like): void {
        const spring = this.springs.Get();
        const pos = TileToPixel(position);
        spring.position.set(pos.x, pos.y);
        this.root.addChild(spring);
    }
}

class Spring extends Sprite {
    constructor() {
        super(AssetFactory.inst.CreateTexture("spring"));

        this.pivot.set(-14, -14);
    }
}