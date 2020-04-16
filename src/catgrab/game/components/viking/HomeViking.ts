import {AdjustmentFilter} from "pixi-filters";
import {RenderTexture, Sprite} from "pixi.js";
import GameComponent from "../../../../_lib/game/GameComponent";
import {RGB} from "../../../../_lib/utils/Types";
import {CAT_HOME_VIKING, NEXT_ROUND} from "../../Events";
import { RemoveFromParent } from "_lib/game/display/Utils";

export default class HomeViking extends GameComponent {

    private tint = new AdjustmentFilter();
    private cat: Sprite;
    private cats: Sprite[] = [];
    private catCount: number = 0;

    protected OnInitialise(): void {
        this.cat = this.assetFactory.CreateSprite("cat_sit");
        this.cat.filters = [this.tint];

        for (let i = 0; i < 6; i++) {
            const cat = new Sprite();
            cat.texture = RenderTexture.create({width: this.cat.width, height: this.cat.height});
            cat.anchor.set(0.5);
            cat.position.set(924 + (i % 2) * 20 - ((i > 1 && i < 4) ? 10 : 0), 50 + Math.floor(i / 2) * 12);
            this.cats.push(cat);
        }

        this.game.dispatcher.on(CAT_HOME_VIKING, this.OnCatHome, this);
        this.game.dispatcher.on(NEXT_ROUND, this.OnRoundStart, this);
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
        }
    }

    private OnRoundStart(): void {
        this.root.removeChildren();
        this.catCount = 0;
    }
}
