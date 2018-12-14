export class ScrollingContainer extends PIXI.Container
{
    private scrollAmount: number = 0;

    constructor(bounds: PIXI.Rectangle, borderWidth: number = 0)
    {
        super();

        this.position.set(bounds.x, bounds.y);

        let mask = new PIXI.Graphics().beginFill(0xFF, 0.5).drawRect(0, 0, bounds.width, bounds.height).endFill();
        mask.name = "mask";
        this.addChild(mask);
        this.mask = mask;

        if(borderWidth > 0) {
            let border = new PIXI.Graphics().lineStyle(borderWidth, 0x999999, 0.25, 0).drawRect(0, 0, bounds.width, bounds.height);
            border.name = "border";
            this.addChild(border);
        }

        document.onwheel = (e: WheelEvent) =>
        {
            if(mask.getBounds().contains(e.offsetX, e.offsetY)) {
                if(this.scrollAmount - e.deltaY <= 0) {
                    this.scrollAmount -= e.deltaY;
                    this.children.forEach(child =>
                    {
                        if(child.name != "mask" && child.name != "border") {
                            child.y -= e.deltaY;
                        }
                    });
                }
            }
        };
    }
}