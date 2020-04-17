import Game from "../_lib/game/Game";
import Loader from "../_lib/loading/Loader";
import { AssetPath, GameHeight, GameWidth, Scenes } from "./Constants";
import CatGrabMain from "./game/CatGrabMain";
import TitlePage from "./game/components/scenes/TitlePage";
import Summary from "./game/components/scenes/Summary";

export function CatGrab(): void {
    const game = new Game({width: GameWidth, height: GameHeight, fullscreen: true});

    Loader.inst.LoadSpriteSheet(AssetPath + "spritesheet.json", /^.+(?=_f)/, () => {
        game.loader.add(AssetPath + "numbers-export.fnt");
        game.loader.load(() => {
            game.sceneManager.AddScene(Scenes.TITLE, new TitlePage());
            game.sceneManager.AddScene(Scenes.GAME, new CatGrabMain());
            game.sceneManager.AddScene(Scenes.SUMMARY, new Summary());

            game.sceneManager.ShowScene(Scenes.TITLE);
        });
    });
}
