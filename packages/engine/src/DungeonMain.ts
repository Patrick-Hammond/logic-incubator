import GameComponent from "@logic-incubator/lib/game/GameComponent";
import AssetFactory from "@logic-incubator/lib/loading/AssetFactory";
import { AssetPath } from "./Constants";
import Encounter from "./Encounter";
import {LEVEL_CREATED, PLAYER_DIED} from "./Events";
import AssetMetadataStore from "./level/AssetMetadata";
import {WeaponDef} from "./level/entities/Projectiles";
import Level from "./level/Level";
import {LevelFile} from "./level/LevelFormat";
import TileCollision from "./level/TileCollision";
import {Camera} from "./view/Camera";
import EntityRenderer from "./view/EntityRenderer";
import Hud from "./view/Hud";
import {Player} from "./view/Player";
import TileMapView from "./view/TileMap";

/** The game's side of the player: how they look, how tough they are, what they shoot, and how the HUD shows it. */
export type PlayerSetup = {
    /** Animation the player is drawn with. */
    sprite: string;
    /** In half-hearts - see `Hud`. */
    hitPoints: number;
    /** Sprite names for a full, half and empty heart. */
    hearts: {full: string; half: string; empty: string};
    /** Starting loadout - the first is equipped. Fired while a fire direction is held (see `PlayerControl`). */
    weapons: WeaponDef[];
};

export type DungeonMainOptions = {
    player: PlayerSetup;
    /**
     * The level to play - asked for each time the scene starts, and again on every restart. A game
     * returns its own shipped level, or in a dev build the level editor's latest save.
     */
    level: () => LevelFile | undefined;
};

/** Seconds between the player dying and the level starting over. */
const RestartDelay = 1.5;

export class DungeonMain extends GameComponent {
    private level: Level | undefined;

    private player: Player | undefined;
    private encounter: Encounter | undefined;
    private renderer: EntityRenderer | undefined;
    private hud: Hud | undefined;
    /** Seconds until the level restarts after the player died - 0 while they're alive. */
    private restartIn = 0;
    private restarting = false;

    constructor(private options: DungeonMainOptions) {
        super();
    }

    protected OnInitialise(): void {
        const level = this.level = new Level();

        const camera = new Camera();
        new TileMapView(level, camera);
        this.hud = new Hud(this.options.player.hearts);

        this.game.dispatcher.on(LEVEL_CREATED, () => {
            if(!this.player) {
                const collision = new TileCollision(level);
                this.player = new Player(camera, collision, level, this.options.player);
                this.renderer = new EntityRenderer(camera, level);
                this.encounter = new Encounter(level, {
                    emit: (event, ...args) => this.game.dispatcher.emit(event, ...args),
                    sizeFor: name => (AssetFactory.inst.Has(name) ? AssetFactory.inst.CreateTexture(name) : undefined)
                });
            } else {
                this.encounter.Reset();
            }
            this.player.Init(level.playerStartPosition);
            this.renderer.Init();
            this.restartIn = 0;
            this.restarting = false;
        });
        this.game.dispatcher.on(PLAYER_DIED, () => (this.restartIn = RestartDelay));

        this.game.ticker.add(this.OnUpdate, this);
    }

    protected OnShow(): void {
        this.Reload();
    }

    /**
     * One frame of play - only while this scene is showing, so nothing moves (or spawns) behind
     * the editor. `dt` is the ticker's frame delta, which movement is tuned to; timers run on
     * real seconds.
     */
    private OnUpdate(dt: number): void {
        if (!this.root.parent || !this.player || !this.encounter) {
            return;
        }
        const seconds = this.game.ticker.deltaMS / 1000;

        if (this.restartIn > 0 || this.restarting) {
            // Dead: everything holds still for a moment, then until the level has started over.
            this.restartIn -= seconds;
            if (this.restartIn <= 0 && !this.restarting) {
                this.restarting = true;
                this.Reload();
            }
            return;
        }

        this.player.Update(dt, seconds);
        const shot = this.player.TakeShot();
        if (shot) {
            this.encounter.Fire(this.player.Centre, shot, this.player.EquippedWeapon.shot, "player");
        }
        this.encounter.Update(dt, seconds, this.player);
        this.renderer.Render(this.player, this.encounter);
        this.hud.Render(this.player.Health, this.player.Gold, this.player.EquippedWeapon.icon, this.player.Inventory);
    }

    /**
     * Re-fetches assets-meta.json (bypassing cache) before reloading the level, so a hand-edit to it
     * shows up on every editor -> game switch, the same as a placed-brush edit already does via the
     * `level` option. Without this, `AssetMetadataStore` would keep serving whatever was loaded once
     * at page boot (by the game's boot code) until a full page refresh.
     */
    private async Reload(): Promise<void> {
        try {
            const res = await fetch(AssetPath + "assets-meta.json", { cache: "no-store" });
            AssetMetadataStore.inst.Load(await res.json());
        } catch {
            // Dev-time convenience refetch - if it fails, keep whatever metadata is already loaded
            // rather than block the scene switch on it.
        }

        const file = this.options.level();
        if (file && this.level) {
            this.level.LoadLevel(file);
        }
    }
}
