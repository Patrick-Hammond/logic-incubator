import GameComponent from "../../../_lib/game/GameComponent";

export default class Map extends GameComponent {

    public background: PIXI.Sprite;
    public foreground: PIXI.Sprite;

    public constructor() {
        super();

        this.background = this.assetFactory.Create("path");
        this.foreground = this.assetFactory.Create("trees");
    }

}
