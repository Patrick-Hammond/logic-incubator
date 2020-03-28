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

    update(currentTime?: number): void {
        this.stats.begin();
        super.update(currentTime);
        this.stats.end();
    }
}
