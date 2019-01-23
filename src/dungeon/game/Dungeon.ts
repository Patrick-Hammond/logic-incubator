import GameComponent from "../../_lib/game/GameComponent";
import {LoadFromLocalStorage} from "../../_lib/io/Storage";
import Level from "./Level";
import LevelView from "./LevelView";

export class Dungeon extends GameComponent {

    private level: Level;

    protected OnInitialise(): void {
        this.level = new Level();
        new LevelView(this.level);
    }

    protected OnShow(): void {
        const localData = LoadFromLocalStorage("dungeonLevel");
        if(localData) {
            this.level.LoadEditorData(JSON.parse(localData).levelData.levelData);
        }
    }
}
