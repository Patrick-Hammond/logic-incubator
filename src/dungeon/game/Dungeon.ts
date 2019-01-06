import GameComponent from "../../_lib/game/GameComponent";
import {LoadFromLocalStorage} from "../../_lib/utils/Storage";
import Level from "./Level";

export class Dungeon extends GameComponent {

    private level: Level = new Level();

    constructor() {
        super();
        this.root.on("added", this.Init, this);
    }

    private Init(): void {
        const localData = LoadFromLocalStorage("dungeonLevel");
        if(localData) {
            this.level.LoadEditorData(JSON.parse(localData).levelData.levelData);
        }
    }
}
