import Game from "../_lib/game/Game";
import Loader from "../_lib/loading/Loader";
import { AssetPath, GameHeight, GameWidth, Scenes } from "./Constants";
import { DungeonEditor } from "./editor/DungeonEditor";
import AssetMetadataStore from "./game/level/AssetMetadata";
import { DungeonMain } from "./game/DungeonMain";
import { CharacterSelect } from "./game/scenes/CharacterSelect";
import { TitleScreen } from "./game/scenes/TitleScreen";

export function Dungoen(): void {
    const game = new Game({width: GameWidth, height: GameHeight, backgroundColor: 0 }, true);

    // load
    Loader.inst.LoadSpriteSheet(AssetPath + "frames.json", /^.+(?=_f)/, () => {
        game.loader.baseUrl = AssetPath;
        game.loader.add([
            { name: "icon-eye", url: "icons/eye.png" },
            { name: "icon-eye-slash", url: "icons/eye-slash.png" },
            { name: "icon-arrow-down", url: "icons/arrow-down.png" },
            { name: "icon-arrow-up", url: "icons/arrow-up.png" },
            { name: "icon-edit", url: "icons/edit.png" },
            { name: "icon-plus", url: "icons/plus.png" },
            { name: "icon-minus", url: "icons/minus.png" },
            { name: "icon-data", url: "icons/data.png" },
            { name: "data-square", url: "icons/square.png" },
            { name: "small-font", url: "fonts/small-font-export.fnt" },
            { name: "title", url: "title.png" },
            { name: "levelData", url: "level.json" },
            { name: "assetsMeta", url: "assets-meta.json" }
        ]);
        game.loader.load(() => {
            // init
            AssetMetadataStore.inst.Load(game.loader.resources["assetsMeta"].data);
            game.sceneManager.AddScene(Scenes.GAME, new DungeonMain());
            game.sceneManager.AddScene(Scenes.EDITOR, new DungeonEditor());
            game.sceneManager.AddScene(Scenes.TITLE, new TitleScreen());
            game.sceneManager.AddScene(Scenes.CHARACTER_SELECT, new CharacterSelect());

            game.sceneManager.ShowScene(Scenes.EDITOR);
        });
    });
}