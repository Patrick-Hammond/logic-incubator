import {loaders} from "pixi.js";
import GameComponent from "../../_lib/GameComponent";
import {AssetPath} from "../editor/Constants";

export class Dungeon extends GameComponent {
    constructor() {
        super();

        this.game.loader.add("levelData", AssetPath + "level.json");
        this.game.loader.load((loader: loaders.Loader, resource: loaders.Resource) => {
            const levelData = resource["levelData"].data.levelData;
            this.loader.LoadSpriteSheet(AssetPath + "spritesheet.json", /^.+(?=_f\d)/, () => {
                // ready
            });
        });
    }
}
