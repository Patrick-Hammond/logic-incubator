import { Ticker } from "pixi.js";
import * as Stats from "stats.js";

export class StatsTicker extends Ticker {
    private stats: Stats;

    constructor() {
        super();

        this.stats = new Stats();
        this.stats.showPanel(0);
        document.body.appendChild(this.stats.dom);

        this.start();
    }

    /** Takes the stats panel off the page along with the ticker. */
    destroy(): void {
        if (this.stats.dom.parentNode) {
            this.stats.dom.parentNode.removeChild(this.stats.dom);
        }
        super.destroy();
    }

    update(currentTime?: number): void {
        this.stats.begin();
        super.update(currentTime);
        this.stats.end();
    }
}
