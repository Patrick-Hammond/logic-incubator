import {Container, Graphics, Rectangle, Text} from "pixi.js";

/** A simple rectangular text button for menu-style scenes (Title, CharacterSelect) - bigger and more game-facing than the editor's DOM panel buttons. */
export default class MenuButton extends Container {
    constructor(label: string, width: number, height: number, onClick: () => void) {
        super();

        const background = new Graphics()
            .beginFill(0x2a2a3a)
            .lineStyle(2, 0x8899aa, 1, 0)
            .drawRoundedRect(0, 0, width, height, 6)
            .endFill();

        const hover = new Graphics()
            .beginFill(0x44557a, 0.6)
            .drawRoundedRect(0, 0, width, height, 6)
            .endFill();
        hover.visible = false;

        const text = new Text(label, {fontFamily: "Arial", fontSize: 20, fill: 0xffffff});
        text.anchor.set(0.5);
        text.position.set(width / 2, height / 2);

        this.addChild(background, hover, text);

        this.hitArea = new Rectangle(0, 0, width, height);
        this.interactive = true;
        this.buttonMode = true;

        this.on("pointerover", () => hover.visible = true);
        this.on("pointerout", () => hover.visible = false);
        this.on("pointerdown", onClick);
    }
}
