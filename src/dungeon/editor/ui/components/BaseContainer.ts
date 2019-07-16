import {RectangleLike} from "../../../../_lib/math/Geometry";
import {ISkinUI} from "../skins/ISkinUI";

export default abstract class BaseContainer extends PIXI.Container {

    constructor(protected rect: RectangleLike, skin: ISkinUI) {
        super();

        this.mask = skin.Mask;

        this.updateTransform = () => {
            super.updateTransform();

            rect.x = this.x;
            rect.y = this.y;
            skin.Redraw(rect);
        }

        this.on("added", () => {
            skin.SetParent(this.parent);
        });

        this.position.set(rect.x, rect.y);
    }
}
