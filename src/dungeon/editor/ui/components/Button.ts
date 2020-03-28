import {Sprite, Texture} from "pixi.js";

export default class Button extends Sprite {
    constructor(icon: string, onClick: () => void) {
        super(Texture.from(icon));

        this.buttonMode = true;
        this.interactive = true;

        this.on("pointerdown", () => {
            onClick();
        });
    }
}
