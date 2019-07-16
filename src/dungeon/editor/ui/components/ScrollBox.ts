import {ISkinUI} from "../skins/ISkinUI";
import BaseContainer from "./BaseContainer";

export default class ScrollBox extends BaseContainer {
    protected scrollBar = new PIXI.Graphics();

    constructor(bounds: PIXI.Rectangle, skin: ISkinUI) {
        super(bounds, skin);

        this.on("added", () => (document.onwheel = e => this.OnScrollWheel(e)));
        this.on("removed", () => (document.onwheel = null));
    }

    private OnScrollWheel(e: WheelEvent): void {
        if (this.getBounds().contains(e.offsetX, e.offsetY)) {
            let topChildY = Number.MAX_VALUE;
            let bottomChildY = 0;

            this.children.forEach(child => {
                topChildY = Math.min(topChildY, child.y);
                bottomChildY = Math.max(bottomChildY, child.y);
            });

            console.log(topChildY, bottomChildY);

            const canScrollUp = topChildY < 0;
            const canScrollDown = bottomChildY > this.rect.height * 0.5;
            const canScroll = (e.deltaY < 0 && canScrollUp) || (e.deltaY > 0 && canScrollDown);
            if (canScroll) {
                this.children.forEach(child => child.y -= e.deltaY);
            }
        }
    }
}
