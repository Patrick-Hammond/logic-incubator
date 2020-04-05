import {AdjustmentFilter} from "pixi-filters";
import {RenderTexture, Sprite} from "pixi.js";
import GameComponent from "../../../_lib/game/GameComponent";
import {RGB} from "../../../_lib/utils/Types";
import {ALL_CATS_HOME, CAT_HOME_PLAYER} from "../Events";

export default class HomePlayer extends GameComponent {

    private tint = new AdjustmentFilter();
    private cat: Sprite;
    private cats: Sprite[] = [];
    private catCount: number = 0;

    protected OnInitialise(): void {
        this.cat = this.assetFactory.CreateSprite("cat_sit");
        this.cat.filters = [this.tint];

        for (let i = 0; i < 6; i++) {
            const cat = new Sprite();
            cat.texture = RenderTexture.create({width: this.cat.width, height: 23});
            cat.anchor.set(0.5);
            cat.x = [20, 59, 41, 68, 26, -3][i] + 34;
            cat.y = [40, 40, 18, -8, 67, 32][i] + 26;
            this.cats.push(cat);
        }

        this.game.dispatcher.addListener(CAT_HOME_PLAYER, this.OnCatHome, this);
    }

    private OnCatHome(tint: RGB): void {
        if(this.catCount < 6) {
            this.tint.red   = tint.r;
            this.tint.green = tint.g;
            this.tint.blue  = tint.b;

            const cat = this.cats[this.catCount];
            this.game.renderer.render(this.cat, cat.texture as RenderTexture);
            this.root.addChild(cat);

            this.catCount++;

        } else if (this.catCount === 6) {
            this.game.dispatcher.emit(ALL_CATS_HOME);
        }
    }
}
