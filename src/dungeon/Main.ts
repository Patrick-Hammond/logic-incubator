import Game from "../_lib/Game";
import {DungeonEditor} from "./editor/DungeonEditor";
import {Dungeon} from "./game/Dungeon";

const game = new Game(1280, 720, {backgroundColor: 0x111111});
// const dungeon = new Dungeon();
const editor = new DungeonEditor();
