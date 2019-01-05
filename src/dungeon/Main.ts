import Game from "../_lib/Game";
import {Scenes} from "./editor/Constants";
import {DungeonEditor} from "./editor/DungeonEditor";
import {Dungeon} from "./game/Dungeon";

const game = new Game(1280, 720, {backgroundColor: 0x111111});
game.AddScene(Scenes.GAME, new Dungeon());
game.AddScene(Scenes.EDITOR, new DungeonEditor());

game.ShowScene(Scenes.EDITOR);
