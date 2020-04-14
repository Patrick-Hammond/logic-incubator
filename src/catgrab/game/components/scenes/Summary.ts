import GameComponent from "../../../../_lib/game/GameComponent";
import { Sprite, BitmapText, Rectangle } from "pixi.js";
import { ROUND_FINISHED, NEXT_ROUND } from "catgrab/game/Events";
import { Scenes } from "catgrab/Constants";
import { CenterScreen, CenterOn, RemoveFromParent } from "_lib/game/display/Utils";

export default class Summary extends GameComponent {

    private player: Sprite;
    private playerText: BitmapText;
    private viking: Sprite;
    private vikingText: BitmapText;

    private background : Sprite;

    constructor() {
        super();

        this.background = this.assetFactory.CreateSprite("victory");
        this.background.hitArea = new Rectangle(171, 447, 178, 96);
        this.background.interactive = true;
        this.background.buttonMode = true;
        CenterScreen(this.background);

        this.player = this.assetFactory.CreateSprite("player_1");
        this.player.scale.set(2.5);
        CenterOn(this.player, this.background).y = 46;

        this.playerText = this.assetFactory.CreateBitmapText("numbers-export", 46);
        this.playerText.anchor = 0.5;
        this.playerText.text = "34";
        this.playerText.position.set(136, 380);


        this.viking = this.assetFactory.CreateSprite("viking");
        this.viking.scale.set(4.5);
        CenterOn(this.viking, this.background).y = 46;

        this.vikingText = this.assetFactory.CreateBitmapText("numbers-export", 46);
        this.vikingText.anchor = 0.5;
        this.vikingText.text = "67";
        this.vikingText.position.set(379, 380);

        this.background.addChild(this.player, this.viking, this.playerText, this.vikingText);
        this.root.addChild(this.background);

        this.game.dispatcher.on(ROUND_FINISHED, this.Show, this);
    }

    private Show(playerWon: boolean, playerRoundsWon: string, vikingRoundsWon: string): void {
        this.AddToScene(Scenes.GAME);

        this.player.visible = playerWon;
        this.viking.visible = !playerWon;

        this.playerText.text = playerRoundsWon;
        this.vikingText.text = vikingRoundsWon;

        this.background.once("pointerup", this.Hide, this);
    }

    private Hide(): void {
        RemoveFromParent(this.root);
        this.game.dispatcher.emit(NEXT_ROUND);
    }
}