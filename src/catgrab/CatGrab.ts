import Game from "../_lib/game/Game";
import Loader from "../_lib/loading/Loader";
import { AssetPath, GameHeight, GameWidth, Scenes } from "./Constants";
import {CatGrabMain} from "./game/CatGrabMain";

export function CatGrab(): void {
    const game = new Game({width: GameWidth, height: GameHeight, fullscreen: true});

    // load
    Loader.inst.LoadSpriteSheet(AssetPath + "spritesheet.json", /^.+(?=_f)/, () => {
        // init
        game.sceneManager.AddScene(Scenes.GAME, new CatGrabMain());
        game.sceneManager.ShowScene(Scenes.GAME);
    });
}
