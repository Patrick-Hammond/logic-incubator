import GameComponent from "../../_lib/game/GameComponent";
import Map from "./view/Map";

export class TreasureGrab extends GameComponent {

    private map: Map;

    protected OnInitialise(): void {
        this.map = new Map();
        this.root.addChild(this.map.background, this.map.foreground);
    }
/*
    protected OnShow(): void {

    }
    */
}
