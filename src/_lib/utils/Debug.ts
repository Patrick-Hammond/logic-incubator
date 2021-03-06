import {DisplayObject} from "pixi.js";
import { Key } from "_lib/io/Keyboard";
import Game from "_lib/game/Game";

export function MakeDraggable(sprite: DisplayObject): void {
    sprite.interactive = true;

    sprite.on("mousedown", function(event) {
        if (!this.dragging) {
            this.data = event.data;
            this.alpha = 0.9;
            this.dragging = true;
            this.sx = this.data.getLocalPosition(sprite).x * sprite.scale.x;
            this.sy = this.data.getLocalPosition(sprite).y * sprite.scale.y;
        }
    });

    sprite.on("mouseup", function() {
        if (this.dragging) {
            this.alpha = 1;
            this.dragging = false;
            this.data = null;

            sprite.emit("stopped_dragging");
        }
    });

    sprite.on("mousemove", function(event) {
        if (this.dragging) {
            const newPosition = this.data.getLocalPosition(this.parent);
            this.position.x = newPosition.x - this.sx;
            this.position.y = newPosition.y - this.sy;

            sprite.emit("dragging", event);
        }
    });

    sprite.on("click", function() {
        console.log("(" + this.x + ", " + this.y + ")");
    });
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
