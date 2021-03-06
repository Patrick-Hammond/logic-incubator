import {Container, Graphics, Text} from "pixi.js";

export default class TextButton extends Container {
    private label: Text;

    constructor(label: string, onClick: () => void) {
        super();

        this.label = new Text(label, { fontFamily: "Arial", fontSize: 11, fill: 0xeeeeee });
        const border = new Graphics()
            .lineStyle(1, 0x999999, 0.25, 0)
            .drawRect(-2, -1, this.label.width + 4, 15)
            .endFill();
        const hover = new Graphics()
            .beginFill(0x3355aa, 0.4)
            .drawRect(0, 0, this.label.width, 13)
            .endFill();

        const removeHover = () => {
            if (hover.parent) {
                this.removeChild(hover);
            }
        };

        this.label.buttonMode = true;
        this.label.interactive = true;

        this.label.on("pointerover", () => {
            this.addChild(hover);
        });
        this.label.on("pointerout", () => {
            removeHover();
        });
        this.label.on("pointerdown", () => {
            removeHover();
            onClick();
        });

        this.addChild(border);
        this.addChild(this.label);
    }
}
