import GameComponent from "../../_lib/game/GameComponent";
import {LoadFromLocalStorage} from "../../_lib/io/Storage";
import {LEVEL_CREATED} from "./Events";
import Level from "./level/Level";
import TileCollision from "./level/TileCollision";
import {Camera} from "./view/Camera";
import {Player} from "./view/Player";
import TileMapView from "./view/TileMap";

export class Dungeon extends GameComponent {
    private level: Level;
    private player: Player;

    protected OnInitialise (): void {
        this.level = new Level();

        const camera = new Camera();
        new TileMapView(this.level, camera);

        this.game.dispatcher.on(LEVEL_CREATED, () => {
            if(!this.player) {
                const collision = new TileCollision(this.level);
                this.player = new Player(camera, collision);
            }
            this.player.Init(this.level.playerStartPosition);
        });
    }

    protected OnShow (): void {
        const localData = LoadFromLocalStorage("dungeonLevel");
        if(localData) {
            let data = JSON.parse(localData);
            this.level.LoadEditorData(data);
        }
    }
}
