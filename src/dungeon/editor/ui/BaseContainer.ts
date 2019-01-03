export abstract class BaseContainer extends PIXI.Container {
    constructor(protected bounds: PIXI.Rectangle, borderWidth: number = 0) {
        super();

        this.position.set(bounds.x, bounds.y);

        const mask = new PIXI.Graphics().beginFill(0xFF, 0.5).drawRect(0, 0, bounds.width, bounds.height).endFill();
        mask.name = "mask";
        this.addChild(mask);
        this.mask = mask;

        if(borderWidth > 0) {
            const border = new PIXI.Graphics().lineStyle(borderWidth, 0x999999, 0.25, 0).drawRect(0, 0, bounds.width, bounds.height);
            border.name = "border";
            this.addChild(border);
        }
    }
}
