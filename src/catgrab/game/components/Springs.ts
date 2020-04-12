
import GameComponent from "../../../_lib/game/GameComponent";
import { Vec2Like, Vec2 } from "_lib/math/Geometry";
import { Sprite } from "pixi.js";
import ObjectPool from "_lib/patterns/ObjectPool";
import AssetFactory from "_lib/loading/AssetFactory";
import { TileToPixel } from "../Utils";
import { RemoveFromParent } from "_lib/game/display/Utils";

export class Springs extends GameComponent {

    private springPool: ObjectPool<Spring>;

    constructor() {
        super();
    }

    protected OnInitialise(): void {
        this.springPool = new ObjectPool<Spring>(1, () => new Spring());
    }

    Drop(position: Vec2Like, max: number): boolean {
        const hasSpring = this.HasSpring(position);
        if(!hasSpring) {
            if(this.springPool.Popped.length < max) {
                const spring = this.springPool.Get();
                spring.SetPosition(position);
                this.root.addChild(spring);
            }
        }
        return hasSpring;
    }

    Collides(position: Vec2Like): boolean {
        const hit = this.springPool.Popped.find(spring => spring.Collides(position));
        if(hit) {
            this.Restore(hit);
        }
        return hit != null;
    }

    private Restore(spring: Spring): void {
        RemoveFromParent(spring);
        this.springPool.Put(spring);
    }

    private HasSpring(position: Vec2Like): boolean {
        return this.springPool.Popped.some(spring => spring.Collides(position));
    }
}

class Spring extends Sprite {

    private tilePos: Vec2 = new Vec2(-1, -1);

    constructor() {
        super(AssetFactory.inst.CreateTexture("spring"));

        this.pivot.set(-14, -14);
    }

    SetPosition(position: Vec2Like): void {
        this.tilePos.Copy(position);

        const pos = TileToPixel(this.tilePos);
        this.position.set(pos.x, pos.y);
    }

    Collides(position: Vec2Like): boolean {
        return this.tilePos.Equals(position);
    }
}