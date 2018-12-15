import GameComponent from "../../_lib/GameComponent";
import * as AssetTypes from "./assets/AssetTypes";


export class Dungeon extends GameComponent {
    constructor() {
        super();

        this.loader.LoadSpriteSheet("http://localhost:4000/dist-include/spritesheet.json", /^.+(?=_f\d)/, () => {
            this.AddToStage();

            this.Create();
        });
    }

    private Create(): void {
        let a = this.assetFactory.CreateAnimatedSprite(AssetTypes.Animations.big_zombie_run_anim);
        a.texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
        a.scale.set(4);
        a.animationSpeed = 0.1;
        a.play();
        this.root.addChild(a);
    }
}