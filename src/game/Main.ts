import Game from "../_lib/Game";
import {Dungeon} from "./dungeon/Dungeon";
import {DungeonEditor} from "./dungeon/editor/DungeonEditor";

const game = new Game(1280, 720, {backgroundColor: 0x111111});
// let dungeon = new Dungeon();
const editor = new DungeonEditor();
