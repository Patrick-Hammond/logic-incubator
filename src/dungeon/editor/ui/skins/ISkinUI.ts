import {RectangleLike} from "../../../../_lib/math/Geometry";

export interface ISkinUI {
    Mask: PIXI.Graphics | PIXI.Sprite;
    SetParent(parent: PIXI.Container): void;
    Redraw(bounds: RectangleLike): void;
}
