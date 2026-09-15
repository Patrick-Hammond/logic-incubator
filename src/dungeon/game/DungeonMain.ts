import GameComponent from "../../_lib/game/GameComponent";
import {LoadFromLocalStorage} from "../../_lib/io/Storage";
import {LEVEL_CREATED} from "./Events";
import Level from "./level/Level";
import TileCollision from "./level/TileCollision";
import {Camera} from "./view/Camera";
import {Player} from "./view/Player";
import TileMapView from "./view/TileMap";

export class DungeonMain extends GameComponent {
    private level: Level | undefined;
    private player: Player | undefined;

    protected OnInitialise(): void {
        this.level = new Level();

        const camera = new Camera();
        new TileMapView(this.level, camera);

        this.game.dispatcher.on(LEVEL_CREATED, () => {
            const level = this.level as Level;
            if(!this.player) {
                const collision = new TileCollision(level);
                this.player = new Player(camera, collision, level);
            }
            this.player.Init(level.playerStartPosition);
        });
    }

    protected OnShow(): void {
        const localData = LoadFromLocalStorage("dungeonLevel");
        if(localData && this.level) {
            const data = JSON.parse(localData);
            this.level.LoadEditorData(data);
        }
    }
}
