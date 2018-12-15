export class ScrollingContainer extends PIXI.Container {
    constructor(bounds: PIXI.Rectangle, borderWidth: number = 0) {
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

        document.onwheel = (e: WheelEvent) => {
            if(mask.getBounds().contains(e.offsetX, e.offsetY)) {
                let topChildY = Number.MAX_VALUE;
                let bottomChildY = 0;
                this.children.forEach(child => {
                    if(child.name != "mask" && child.name != "border") {
                        topChildY = Math.min(topChildY, child.y);
                        bottomChildY = Math.max(topChildY, child.y);
                    }
                });
                console.log(topChildY, e.deltaY)
                const canScrollUp = topChildY < 0;
                const canScrollDown = bottomChildY > bounds.height * 0.5;
                const canScroll = (e.deltaY < 0 && canScrollUp) || (e.deltaY > 0 && canScrollDown);
                if(canScroll) {
                    this.children.forEach(child => {
                        if(child.name != "mask" && child.name != "border") {
                            child.y -= e.deltaY;
                        }
                    });
                }
            }
        };
    }
}