import GameComponent from "../../../../_lib/game/GameComponent";
import { Sprite, Rectangle } from "pixi.js";
import { TITLE_SCREEN_CLOSED } from "catgrab/game/Events";
import { CenterScreen, RemoveFromParent } from "_lib/game/display/Utils";

export default class TitlePage extends GameComponent {

    private background : Sprite;

    constructor() {
        super();

        this.background = this.assetFactory.CreateSprite("title");
        this.background.hitArea = new Rectangle(574, 508, 188, 121);
        this.background.interactive = true;
        this.background.buttonMode = true;
        CenterScreen(this.background);

        this.root.addChild(this.background);
    }

    protected OnShow(): void {
        this.background.once("pointerup", this.Hide, this);
    }

    private Hide(): void {
        RemoveFromParent(this.root);
        this.game.dispatcher.emit(TITLE_SCREEN_CLOSED);
    }
}