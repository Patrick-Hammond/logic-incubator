import {BaseContainer} from "./BaseContainer";

export class ScrollBox extends BaseContainer {
    constructor(bounds: PIXI.Rectangle, borderWidth: number = 0) {
        super(bounds, borderWidth);

        document.onwheel = (e: WheelEvent) => {
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
                const canScrollDown = bottomChildY > bounds.height * 0.5;
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

    SetVisible(tf:boolean): void {
        this.children.forEach(child => {
            if(child.name !== "mask" && child.name !== "border") {
                child.visible = tf;
            }
        });
    }
}
