import Game from "../_lib/Game";
import { Dungeon } from "./dungeon/Dungeon";
import { DungeonEditor } from "./dungeon/editor/DungeonEditor";

let game = new Game(1280, 720, {backgroundColor:0x111111});
//let dungeon = new Dungeon();
let editor = new DungeonEditor();