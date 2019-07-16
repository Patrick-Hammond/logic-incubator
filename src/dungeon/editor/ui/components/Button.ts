export default class Button extends PIXI.Sprite {
    constructor(icon: string, onClick: () => void) {
        super(PIXI.Texture.from(icon));

        this.buttonMode = true;
        this.interactive = true;

        this.on("pointerdown", () => {
            onClick();
        });
    }
}
