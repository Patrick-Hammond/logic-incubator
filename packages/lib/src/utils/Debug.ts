import {DisplayObject} from "pixi.js";
import { Key } from "../io/Keyboard";
import Game from "../game/Game";
import { Cancel } from "../game/Timing";
import { DragObject } from "./DragObject";

/**
 * @deprecated Use `this.debug.Drag(object)` in a component, or `DragObject` (which takes options). This is `DragObject` with its
 * defaults: whole pixels, the position logged on drop. It no longer emits `dragging` / `stopped_dragging` or dims the object,
 * and it returns a function that stops it.
 */
export function MakeDraggable(sprite: DisplayObject): Cancel {
    return DragObject(sprite);
}

export function MoveWithArrowKeys(sprite: DisplayObject): void {
    const keyboard = Game.inst.keyboard;
    const checkKeys = () => {

        if(keyboard.AnyKeyPressed()) {
            if (keyboard.KeyPressed(Key.UpArrow)) {
                sprite.y--;
            }
            if (keyboard.KeyPressed(Key.DownArrow)) {
                sprite.y++;
            }
            if (keyboard.KeyPressed(Key.LeftArrow)) {
                sprite.x--;
            }
            if (keyboard.KeyPressed(Key.RightArrow)) {
                sprite.x++;
            }
            console.log(sprite.position);
        }
    }
    Game.inst.ticker.add(checkKeys);
}
