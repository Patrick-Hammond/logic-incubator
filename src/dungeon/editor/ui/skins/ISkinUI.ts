import {Container, Graphics, Sprite} from "pixi.js";
import {RectangleLike} from "../../../../_lib/math/Geometry";

export interface ISkinUI {
    Mask: Graphics | Sprite;
    SetParent(parent: Container): void;
    Redraw(bounds: RectangleLike): void;
}
