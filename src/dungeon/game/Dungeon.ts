import Stage from "../../_extern/pixi-display/Stage";
import GameComponent from "../../_lib/game/GameComponent";
import {LoadFromLocalStorage} from "../../_lib/io/Storage";
import Level from "./Level";
import LevelView from "./LevelView";

export class Dungeon extends GameComponent {

    private level: Level;
    private levelView: LevelView;

    constructor() {
        super();
        this.Create();
    }

    private Create(): void {
        this.game.stage = new Stage();
        this.level = new Level();
        this.levelView = new LevelView(this.level);
    }

    private Init(): void {
        const localData = LoadFromLocalStorage("dungeonLevel");
        if(localData) {
            this.level.LoadEditorData(JSON.parse(localData).levelData.levelData);
        }

        this.levelView.Init();
    }
}
