import GameComponent from "../../../../_lib/game/GameComponent";
import { Sprite, BitmapText } from "pixi.js";
import AssetFactory from "_lib/loading/AssetFactory";

export class Summary extends GameComponent {
    private player: Sprite;
    private playerScore: BitmapText;
    private viking: Sprite;
    private vikingScore: BitmapText;
    private background : Sprite;

    constructor() {
        super();

        this.player = AssetFactory.inst.CreateSprite("player_1_f0");
        this.viking = AssetFactory.inst.CreateSprite("viking_f0");
        this.background = AssetFactory.inst.CreateSprite("victory");
    }
}