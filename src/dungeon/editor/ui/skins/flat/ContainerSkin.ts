import {Container, Graphics, Sprite} from "pixi.js";
import {Rectangle, RectangleLike} from "../../../../../_lib/math/Geometry";
import {ISkinUI} from "../ISkinUI";

export default class ContainerSkin implements ISkinUI {

    protected root = new Container();
    protected skinMask = new Graphics();
    protected border =  new Graphics();

    private currentBounds = new Rectangle();

    constructor(protected borderWidth: number = 1) {
        this.root.addChild(this.skinMask);
    }

    get Mask(): Graphics | Sprite {
        return this.skinMask;
    }

    SetParent(parent: Container): void {
        parent.addChild(this.root);
    }

    Redraw(bounds: RectangleLike): void {
        const changed = Rectangle.Equals(this.currentBounds);
        if(changed) {

            this.currentBounds.Copy(bounds);

            this.root.position.set(bounds.x, bounds.y);

            if (this.borderWidth > 0) {
                this.border.clear()
                    .lineStyle(this.borderWidth, 0x999999, 0.25, 0)
                    .drawRect(0, 0, bounds.width, bounds.height);
                this.root.addChild(this.border);
            }

            this.skinMask.clear()
                .beginFill(0xff, 0.5)
                .drawRect(0, 0, bounds.width, bounds.height)
                .endFill();
        }
    }
}
