import GameComponent from "@logic-incubator/lib/game/GameComponent";
import AssetFactory from "@logic-incubator/lib/loading/AssetFactory";
import Encounter from "./Encounter";
import {GAME_PAUSED, GAME_RESUMED, LEVEL_CREATED, PLAYER_DIED} from "./Events";
import AssetMetadataStore from "./level/AssetMetadata";
import { AssetMetadataBinding, BindAssetMetadata } from "./level/AssetMetadataBinding";
import LevelAssets from "./level/LevelAssets";
import {WeaponDef} from "./level/entities/Projectiles";
import Level from "./level/Level";
import {LevelFile} from "./level/LevelFormat";
import TileCollision from "./level/TileCollision";
import {Camera} from "./view/Camera";
import Effects from "./view/Effects";
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
    /** Sprite names for a full, half and empty heart; without them the HUD draws the UI skin's hearts. */
    hearts?: {full: string; half: string; empty: string};
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
    /**
     * The asset bundle the level plays in, asked for with each start like `level`: loaded (with
     * what it depends on) before the level is built, and let go of when another is asked for or the
     * scene is destroyed. Without it the level uses only what's already loaded - `global`.
     */
    levelBundle?: () => string | undefined;
    /**
     * The animation to draw the player with, asked for each time a level starts, like `level`: when it
     * returns one it is used in place of `player.sprite` - how a game lets the player pick a character.
     */
    playerSprite?: () => string | undefined;
    /**
     * Something drawn over the HUD and kept with the scene - a pause menu, a death screen: made when the scene is, given the scene so it can `Pause`, `Resume` and `Restart` it, and
     * listening to the engine's events (`PLAYER_DIED`) for what else it needs.
     */
    overlay?: (main: DungeonMain) => GameComponent;
    /**
     * Whether a death waits to be told to start over (`Restart`) instead of the level restarting by itself a moment after - for a game whose `overlay` offers a choice. Off by default.
     */
    manualRestart?: boolean;
};

/** Seconds between the player dying and the level starting over. */
const RestartDelay = 1.5;

export class DungeonMain extends GameComponent {
    private level: Level | undefined;

    private player: Player | undefined;
    private encounter: Encounter | undefined;
    private renderer: EntityRenderer | undefined;
    private hud: Hud | undefined;
    private effects: Effects | undefined;
    private levelAssets: LevelAssets | undefined;
    /** Seconds until the level restarts after the player died - 0 while they're alive. */
    private restartIn = 0;
    private restarting = false;
    /** Whether a level has been created yet - there's nothing to play until the first one has loaded. */
    private started = false;
    private paused = false;
    /** Dead, in a game whose death waits for `Restart`: everything holds still until it comes. */
    private waitingForRestart = false;

    constructor(private options: DungeonMainOptions) {
        super();
    }

    /** Where a game plays particle effects (`Effects.Play`) - undefined until the scene has been initialised. */
    get Effects(): Effects | undefined {
        return this.effects;
    }

    /** Whether play is stopped by `Pause`. */
    get Paused(): boolean {
        return this.paused;
    }

    /** Whether the player is dead and the level is waiting to be restarted (see `manualRestart`). */
    get WaitingForRestart(): boolean {
        return this.waitingForRestart;
    }

    /** Stops play - nothing moves, shoots or spawns - until `Resume`. Does nothing before a level has started, or while the player is dead. */
    Pause(): void {
        if (this.paused || !this.started || this.waitingForRestart || this.restarting || this.restartIn > 0) {
            return;
        }
        this.paused = true;
        this.game.dispatcher.emit(GAME_PAUSED);
    }

    Resume(): void {
        if (!this.paused) {
            return;
        }
        this.paused = false;
        this.game.dispatcher.emit(GAME_RESUMED);
    }

    /** Starts the level over now - the player, the monsters, everything - as it does a moment after a death. */
    Restart(): void {
        if (!this.started || this.restarting || !this.level) {
            return;
        }
        if (this.paused) {
            this.paused = false;
            this.game.dispatcher.emit(GAME_RESUMED);
        }
        this.restarting = true;
        this.waitingForRestart = false;
        this.Reload();
    }

    protected OnInitialise(): void {
        const level = this.level = new Level();

        // Attached in drawing order: the world, then the HUD over it.
        const camera = this.Attach(new Camera());
        this.Attach(new TileMapView(level, camera));
        // Inside the camera, so effects scroll and zoom with the world, and over its layers; under the HUD.
        this.effects = this.Attach(new Effects(camera), camera.root);
        this.hud = this.Attach(new Hud(this.options.player.hearts));
        if (this.options.overlay) {
            this.Attach(this.options.overlay(this));
        }

        // A door the player has no key for is a wall to them; one they have the key for isn't - they walk onto it to open it.
        this.player = new Player(camera, new TileCollision(level, (x, y) => !!this.player && this.player.IsLockedOut(x, y)), level, this.options.player);
        this.renderer = new EntityRenderer(camera, level);
        this.encounter = new Encounter(level, {
            emit: (event, ...args) => this.game.dispatcher.emit(event, ...args),
            sizeFor: name => (AssetFactory.inst.Has(name) ? AssetFactory.inst.CreateTexture(name) : undefined)
        });

        // Each bundle's metadata (collision, doors, light...) follows the bundle in and out.
        const metadata: AssetMetadataBinding = BindAssetMetadata(this.game.assets, AssetMetadataStore.inst);
        this.Own(() => metadata.Dispose());
        this.levelAssets = new LevelAssets(this.game.assets, metadata);

        this.Listen(this.game.dispatcher, LEVEL_CREATED, this.OnLevelCreated);
        this.Listen(this.game.dispatcher, PLAYER_DIED, () => {
            if (this.options.manualRestart) {
                this.waitingForRestart = true;
            } else {
                this.restartIn = RestartDelay;
            }
        });
        this.Tick(this.OnUpdate);
    }

    protected OnShow(): void {
        // A visit starts from the beginning, whatever the last one ended in.
        this.paused = false;
        this.waitingForRestart = false;
        this.Reload();
    }

    protected OnDestroy(): void {
        this.player.Destroy();
        this.level.Dispose();
        if (this.options.levelBundle && !this.game.assets.IsDestroyed) {
            // Lets go of the level's bundle (its textures go a frame later, once this scene has left the stage).
            this.game.assets.UseLevelBundle().catch(() => undefined);
        }
        // Drops anything a `Reload` still waiting on its assets would otherwise carry on with.
        this.level = this.player = this.encounter = this.renderer = this.hud = this.effects = this.levelAssets = undefined;
    }

    /** A level has just been built (see `TileMapView`): start it over - the player, monsters and drawing, and the restart timer. */
    private OnLevelCreated(): void {
        this.encounter.Reset();
        this.player.SetSprite((this.options.playerSprite && this.options.playerSprite()) || this.options.player.sprite);
        this.player.Reset(this.level.playerStartPosition);
        this.renderer.Reset();
        this.restartIn = 0;
        this.restarting = false;
        this.waitingForRestart = false;
        this.started = true;
    }

    /**
     * One frame of play - only while this scene is showing (see `Tick`), so nothing moves (or
     * spawns) behind the editor. `dt` is the ticker's frame delta, which movement is tuned to;
     * timers run on real seconds.
     */
    private OnUpdate(dt: number): void {
        if (!this.started || this.paused || this.waitingForRestart) {
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
        this.hud.Render(this.player.Health, this.player.Gold, this.player.EquippedWeapon.icon, this.player.Inventory, this.player.Keys);
    }

    /**
     * Gets the level's assets ready (see `LevelAssets`), then builds the level - at the start of
     * every visit and after every death.
     */
    private async Reload(): Promise<void> {
        const ready = await this.levelAssets.Prepare(this.options.levelBundle && this.options.levelBundle());
        const file = this.options.level();
        // The scene may have been destroyed while the assets loaded.
        if (ready && file && this.level) {
            this.level.LoadLevel(file);
        }
    }
}
