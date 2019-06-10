import Game from "../_lib/game/Game";
import Loader from "../_lib/loading/Loader";
import {AssetPath, Scenes} from "./Constants";
import {DungeonEditor} from "./editor/DungeonEditor";
import {Dungeon} from "./game/Dungeon";

const game = new Game(1280, 720, {backgroundColor: 0x111111}, true);

// load
Loader.inst.LoadSpriteSheet(AssetPath + "spritesheet.json", /^.+(?=_f)/, () => {
    game.loader.baseUrl = AssetPath;
    game.loader.add([
        {name: "icon-eye", url: "icons/eye.png"},
        {name: "icon-eye-slash", url: "icons/eye-slash.png"},
        {name: "icon-arrow-down", url: "icons/arrow-down.png"},
        {name: "icon-arrow-up", url: "icons/arrow-up.png"},
        {name: "icon-edit", url: "icons/edit.png"},
        {name: "icon-plus", url: "icons/plus.png"},
        {name: "icon-minus", url: "icons/minus.png"},
        {name: "icon-data", url: "icons/data.png"},
        {name: "data-square", url: "icons/square.png"},
        {name: "small-font", url: "fonts/small-font-export.fnt"},
        {name: "levelData", url: "level.json"}
    ]);
    game.loader.load(() => {

        // init
        game.sceneManager.AddScene(Scenes.GAME, new Dungeon());
        game.sceneManager.AddScene(Scenes.EDITOR, new DungeonEditor());

        game.sceneManager.ShowScene(Scenes.EDITOR);
    });
});
