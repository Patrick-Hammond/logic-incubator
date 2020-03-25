import Game from "../_lib/game/Game";
import Loader from "../_lib/loading/Loader";
import { AssetPath, GameHeight, GameWidth, Scenes } from "./Constants";
import {TreasureGrab} from "./game/TreasureGrab";

const game = new Game(GameWidth, GameHeight);

// load
Loader.inst.LoadSpriteSheet(AssetPath + "spritesheet.json", /^.+(?=_f)/, () => {
    // init
    game.sceneManager.AddScene(Scenes.GAME, new TreasureGrab());
    game.sceneManager.ShowScene(Scenes.GAME);
});
