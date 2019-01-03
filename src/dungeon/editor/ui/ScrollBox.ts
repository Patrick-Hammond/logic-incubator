import BaseContainer from "./BaseContainer";

export default class ScrollBox extends BaseContainer {
    constructor(bounds: PIXI.Rectangle, borderWidth: number = 0) {
        super(bounds, borderWidth);

        this.on("added", () => document.onwheel = (e) => this.EnableScroll(e));
        this.on("removed", () => document.onwheel = null);
    }

    private EnableScroll(e: WheelEvent): void {
        if(this.mask.getBounds().contains(e.offsetX, e.offsetY)) {
            let topChildY = Number.MAX_VALUE;
            let bottomChildY = 0;
            this.children.forEach(child => {
                if(child.name !== "mask" && child.name !== "border") {
                    topChildY = Math.min(topChildY, child.y);
                    bottomChildY = Math.max(topChildY, child.y);
                }
            });

            const canScrollUp = topChildY < 0;
            const canScrollDown = bottomChildY > this.bounds.height * 0.5;
            const canScroll = (e.deltaY < 0 && canScrollUp) || (e.deltaY > 0 && canScrollDown);
            if(canScroll) {
                this.children.forEach(child => {
                    if(child.name !== "mask" && child.name !== "border") {
                        child.y -= e.deltaY;
                    }
                });
            }
        }
    };
}
