import GameComponent from "../../_lib/game/GameComponent";
import {LoadFromLocalStorage} from "../../_lib/io/Storage";
import {AssetPath} from "../Constants";
import {LEVEL_CREATED} from "./Events";
import AssetMetadataStore from "./level/AssetMetadata";
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
        this.Reload();
    }

    /**
     * Re-fetches assets-meta.json (bypassing cache) before reloading the level, so a hand-edit to it
     * shows up on every editor -> game switch, the same as a placed-brush edit already does via
     * `LoadFromLocalStorage` below. Without this, `AssetMetadataStore` would keep serving whatever was
     * loaded once at page boot (see `Dungeon.ts`) until a full page refresh.
     */
    private async Reload(): Promise<void> {
        try {
            const res = await fetch(AssetPath + "assets-meta.json", { cache: "no-store" });
            AssetMetadataStore.inst.Load(await res.json());
        } catch {
            // Dev-time convenience refetch - if it fails, keep whatever metadata is already loaded
            // rather than block the scene switch on it.
        }

        const localData = LoadFromLocalStorage("dungeonLevel");
        if (localData && this.level) {
            const data = JSON.parse(localData);
            this.level.LoadEditorData(data);
        }
    }
}
