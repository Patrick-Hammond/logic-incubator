import GameComponent from "../../_lib/game/GameComponent";
import {LoadFromLocalStorage} from "../../_lib/io/Storage";
import Level from "./Level";
import TileMapView from "./view/TileMap";
import {Player} from "./view/Player";
import {Camera} from "./view/Camera";

export class Dungeon extends GameComponent {

    private level: Level;

    protected OnInitialise(): void {
        this.level = new Level();

        const camera = new Camera();
        new TileMapView(this.level, camera);
        new Player(this.level, camera);
    }

    protected OnShow(): void {
        const localData = LoadFromLocalStorage("dungeonLevel");
        if(localData) {
            this.level.LoadEditorData(JSON.parse(localData).levelData.levelData);
        }
    }
}
