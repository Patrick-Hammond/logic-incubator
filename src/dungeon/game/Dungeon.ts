import {loaders} from "pixi.js";
import GameComponent from "../../_lib/GameComponent";

export class Dungeon extends GameComponent {
    constructor() {
        super();

        this.game.loader.add("levelData", "http://localhost:4000/dist-include/level.json");
        this.game.loader.load((loader: loaders.Loader, resource: loaders.Resource) => {
            const levelData = resource["levelData"].data.levelData;

            this.loader.LoadSpriteSheet("http://localhost:4000/dist-include/spritesheet.json", /^.+(?=_f\d)/, () => {
                this.AddToStage();
            });
        });
    }
}
