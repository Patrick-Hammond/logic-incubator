import GameComponent from "../../_lib/game/GameComponent";
import { LoadFromLocalStorage } from "../../_lib/io/Storage";
import Level from "./level/Level";
import TileMapView from "./view/TileMap";
import { Player } from "./view/Player";
import { Camera } from "./view/Camera";
import TileCollision from "./level/TileCollision";
import { LEVEL_CREATED } from "./Events";
import CompositeRectTileLayer from "../../_extern/pixi-tilemap/CompositeRectTileLayer";

export class Dungeon extends GameComponent {
    private level: Level;

    protected OnInitialise(): void {
        this.level = new Level();

        const camera = new Camera();
        new TileMapView(this.level, camera);

        this.game.dispatcher.on(LEVEL_CREATED, () => {
            const collision = new TileCollision(this.level.collisionData);
            const id = this.level.playerLayerId.toString();
            const playerLayer = camera.root.getChildByName(id) as CompositeRectTileLayer;
            new Player(this.level.playerStartPosition, playerLayer, camera, collision);
        });
    }

    protected OnShow(): void {
        const localData = LoadFromLocalStorage("dungeonLevel");
        if (localData) {
            this.level.LoadEditorData(JSON.parse(localData).levelData.levelData);
        }
    }
}
