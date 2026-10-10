import GameComponent from "@logic-incubator/lib/game/GameComponent";
import AssetFactory from "@logic-incubator/lib/loading/AssetFactory";
import {Vec2Like} from "@logic-incubator/lib/math/Geometry";
import { TileSize } from "./Constants";
import {ALL_PLAYERS_DIED, GAME_PAUSED, GAME_RESUMED, LEVEL_COMPLETED, LEVEL_CREATED} from "./Events";
import FixedStep, {StepSeconds} from "./FixedStep";
import PlayerControl, {DefaultInput, InputDevice} from "./input/PlayerControl";
import AssetMetadataStore from "./level/AssetMetadata";
import { AssetMetadataBinding, BindAssetMetadata } from "./level/AssetMetadataBinding";
import LevelAssets from "./level/LevelAssets";
import {LightSpell} from "./level/entities/LightSpell";
import {WeaponDef} from "./level/entities/Projectiles";
import Level from "./level/Level";
import {LevelFile} from "./level/LevelFormat";
import { MovingLight } from "./level/SceneLights";
import World from "./sim/World";
import {Camera} from "./view/Camera";
import Effects from "./view/Effects";
import EntityRenderer from "./view/EntityRenderer";
import {HeroView} from "./view/HeroView";
import {PartyBounds, PartySpan, PartyZoom} from "./view/helpers/PartyFrame";
import Hud from "./view/Hud";
import TileMapView from "./view/TileMap";

/** The game's side of the heroes: how they look, how tough they are, what they shoot, and how the HUD shows it - every hero's, unless a `HeroSlot` says otherwise. */
export type PlayerSetup = {
    /** Animation the hero is drawn with. */
    sprite: string;
    /** In half-hearts - see `Hud`. */
    hitPoints: number;
    /** Sprite names for a full, half and empty heart; without them the HUD draws the UI skin's hearts. */
    hearts?: {full: string; half: string; empty: string};
    /** Starting loadout - the first is equipped. Fired while a fire direction is held (see `PlayerControl`). */
    weapons: WeaponDef[];
    /** A light they can call up with the cast control (see `PlayerControl`) - a mage-light that floats beside them. Leave out for a hero who can't. */
    lightSpell?: LightSpell;
};

/** One hero in a level and who plays them - see `DungeonMainOptions.heroes`. */
export type HeroSlot = {
    /** What they're played with - the keyboard or the first gamepad without it. */
    input?: InputDevice;
    /** The animation they're drawn with - `PlayerSetup.sprite` without it. */
    sprite?: string;
    /** Their light spell: null for none, `PlayerSetup.lightSpell` when left out. */
    lightSpell?: LightSpell | null;
};

export type DungeonMainOptions = {
    player: PlayerSetup;
    /**
     * Who plays - one slot per hero, in order (the first is hero 0) - asked for each time a level starts,
     * like `level`. Undefined, or without it, there's one hero, played with the keyboard or the first
     * gamepad, drawn and lit as `playerSprite` and `playerLightSpell` say.
     */
    heroes?: () => ReadonlyArray<HeroSlot> | undefined;
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
     * The animation to draw a lone hero with (see `heroes`), asked for each time a level starts, like `level`:
     * when it returns one it is used in place of `player.sprite` - how a game lets the player pick a character.
     */
    playerSprite?: () => string | undefined;
    /**
     * The light spell a lone hero has (see `heroes`), asked each time a level starts, like `playerSprite`: null
     * for none, a spell to use in place of `player.lightSpell`, or undefined to keep that - how a game gives
     * only some characters the spell.
     */
    playerLightSpell?: () => LightSpell | null | undefined;
    /**
     * Something drawn over the HUD and kept with the scene - a pause menu, a death screen: made when the scene is, given the scene so it can `Pause`, `Resume` and `Restart` it, and
     * listening to the engine's events (`ALL_PLAYERS_DIED`) for what else it needs.
     */
    overlay?: (main: DungeonMain) => GameComponent;
    /**
     * Whether the end of a level - the last hero falling, or one reaching a way out - waits to be told to start over (`Restart`) instead of starting over by itself a moment after - for a game whose `overlay` offers a choice. Off by default.
     */
    manualRestart?: boolean;
};

/** Seconds between the end of a level - the last hero falling, or one getting out - and the next start. */
const RestartDelay = 1.5;
/** Share of the way the camera closes on the heroes each 60th of a second - it trails them rather than being stuck to them. */
const CameraFollow = 0.05;

export class DungeonMain extends GameComponent {
    private level: Level | undefined;

    private camera: Camera | undefined;
    /** Each hero's controls, by slot - remade as each level starts, from `heroes`. */
    private controls: PlayerControl[] = [];
    /** Each hero's looks, by slot - kept from level to level, and pointed at that level's heroes. */
    private views: HeroView[] = [];
    private world: World | undefined;
    private renderer: EntityRenderer | undefined;
    private hud: Hud | undefined;
    private effects: Effects | undefined;
    private levelAssets: LevelAssets | undefined;
    /** Seconds until the next start after the level ended - 0 while it's being played. */
    private restartIn = 0;
    private restarting = false;
    /** Whether a level has been created yet - there's nothing to play until the first one has loaded. */
    private started = false;
    private paused = false;
    /** The level over, in a game whose end waits for `Restart`: everything holds still until it comes. */
    private waitingForRestart = false;
    /** Seconds of play so far - what the lights flicker by. */
    private lightTime = 0;
    /** This frame's moving lights, gathered afresh each frame into the same array - see `MovingLights`. */
    private movingLights: MovingLight[] = [];
    /** Turns display frames into steps of play - see `OnUpdate`. */
    private fixedStep = new FixedStep();
    /** Where the heroes the camera follows are drawn this frame, and the box round them - gathered into the same objects each frame. */
    private followed: Vec2Like[] = [];
    private partyBox = PartyBounds([]);

    constructor(private options: DungeonMainOptions) {
        super();
    }

    /** Where a game plays particle effects (`Effects.Play`) - undefined until the scene has been initialised. */
    get Effects(): Effects | undefined {
        return this.effects;
    }

    /** Whether play runs on: a level has started, and nothing - a pause, the party's end, a restart - holds it. */
    private get Running(): boolean {
        return this.started && !this.paused && !this.waitingForRestart && !this.restarting && this.restartIn <= 0;
    }

    /** Whether play is stopped by `Pause`. */
    get Paused(): boolean {
        return this.paused;
    }

    /** Whether the level is over - every hero down, or one out - and waiting to be restarted (see `manualRestart`). */
    get WaitingForRestart(): boolean {
        return this.waitingForRestart;
    }

    /** Stops play - nothing moves, shoots or spawns - until `Resume`. Does nothing before a level has started, or once it's over. */
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

    /**
     * Starts over now - the heroes, every one on their feet, the monsters, everything - as it does a moment after a
     * level ends: with the level `level` hands back, which can be the next one after a way out was reached.
     */
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
        const camera = this.camera = this.Attach(new Camera());
        this.Attach(new TileMapView(level, camera));
        // Inside the camera, so effects scroll and zoom with the world, and over its layers; under the HUD.
        this.effects = this.Attach(new Effects(camera), camera.root);
        this.hud = this.Attach(new Hud(this.options.player.hearts));
        if (this.options.overlay) {
            this.Attach(this.options.overlay(this));
        }

        this.renderer = new EntityRenderer(camera, level);
        this.world = new World(level, {
            emit: (event, ...args) => this.game.dispatcher.emit(event, ...args),
            sizeFor: name => (AssetFactory.inst.Has(name) ? AssetFactory.inst.CreateTexture(name) : undefined)
        });

        // Each bundle's metadata (collision, doors, light...) follows the bundle in and out.
        const metadata: AssetMetadataBinding = BindAssetMetadata(this.game.assets, AssetMetadataStore.inst);
        this.Own(() => metadata.Dispose());
        this.levelAssets = new LevelAssets(this.game.assets, metadata);

        this.Listen(this.game.dispatcher, LEVEL_CREATED, this.OnLevelCreated);
        // The level is over either way: everyone down, or a hero out.
        this.Listen(this.game.dispatcher, ALL_PLAYERS_DIED, this.OnLevelOver);
        this.Listen(this.game.dispatcher, LEVEL_COMPLETED, this.OnLevelOver);
        this.Tick(this.OnUpdate);
    }

    protected OnShow(): void {
        // A visit starts from the beginning, whatever the last one ended in.
        this.paused = false;
        this.waitingForRestart = false;
        this.Reload();
    }

    protected OnDestroy(): void {
        this.views.forEach(view => view.Destroy());
        this.views = [];
        this.controls = [];
        this.level.Dispose();
        if (this.options.levelBundle && !this.game.assets.IsDestroyed) {
            // Lets go of the level's bundle (its textures go a frame later, once this scene has left the stage).
            this.game.assets.UseLevelBundle().catch(() => undefined);
        }
        // Drops anything a `Reload` still waiting on its assets would otherwise carry on with.
        this.level = this.camera = this.world = this.renderer = this.hud = this.effects = this.levelAssets = undefined;
    }

    /** Every hero is down, or one got out: hold still, then start over - with whatever level `level` hands back - shortly, or when told to. */
    private OnLevelOver(): void {
        if (this.options.manualRestart) {
            this.waitingForRestart = true;
        } else {
            this.restartIn = RestartDelay;
        }
    }

    /** A level has just been built (see `TileMapView`): start it over - the heroes, monsters and drawing, and the restart timer. */
    private OnLevelCreated(): void {
        const setup = this.options.player;
        const slots = this.Slots();
        this.world.Reset(setup, slots.map(slot => (slot.lightSpell === undefined ? setup.lightSpell : slot.lightSpell || undefined)));
        // A party shares one screen, so it's held to what fits on it.
        this.world.SetLeash(slots.length > 1 ? PartySpan(this.BaseView()) : null);
        this.controls = slots.map(slot => new PlayerControl(slot.input || DefaultInput));
        // Views are kept from level to level, so a hero's animation isn't remade on every restart.
        this.views.splice(slots.length).forEach(view => view.Destroy());
        this.world.Heroes.forEach((hero, i) => {
            const sprite = slots[i].sprite || setup.sprite;
            const view = this.views[i];
            if (view) {
                view.SetSprite(sprite);
                view.Reset(hero);
            } else {
                this.views.push(new HeroView(hero, sprite));
            }
        });
        this.renderer.Reset();
        this.fixedStep.Reset();
        this.restartIn = 0;
        this.restarting = false;
        this.waitingForRestart = false;
        this.started = true;
    }

    /**
     * One display frame - only while this scene is showing (see `Tick`), so nothing moves (or
     * spawns) behind the editor. Play runs in fixed steps of `StepSeconds` (see `FixedStep`),
     * as many as the frame's time calls for, so it comes out the same at any frame rate; what's
     * drawn goes between the last two steps. `frames` is the ticker's delta, in 60ths of a second.
     */
    private OnUpdate(frames: number): void {
        if (!this.started || this.paused || this.waitingForRestart) {
            return;
        }
        const seconds = this.game.ticker.deltaMS / 1000;

        if (this.restartIn > 0 || this.restarting) {
            // Over: everything holds still for a moment, then until the level has started over.
            this.restartIn -= seconds;
            if (this.restartIn <= 0 && !this.restarting) {
                this.restarting = true;
                this.Reload();
            }
            return;
        }

        const steps = this.fixedStep.Advance(seconds);
        // A step can stop play - the last hero falls, or one gets out - and none run after that.
        for (let i = 0; i < steps && this.Running; i++) {
            this.world.Step(this.controls.map(control => control.Get()), 1, StepSeconds);
        }
        const alpha = this.fixedStep.Alpha;
        this.views.forEach(view => view.Place(alpha));

        // Before the camera moves, since moving it draws the tiles.
        this.lightTime += seconds;
        this.level.UpdateLights(this.lightTime, this.MovingLights(alpha));
        this.MoveCamera(frames, seconds);

        this.renderer.Render(this.views, this.world.encounter, alpha);
        if (this.world.Heroes.length) {
            this.hud.RenderHeroes(this.world.Heroes);
        }
    }

    /** Who plays this level: `heroes`' slots, or one hero from `playerSprite` and `playerLightSpell`. */
    private Slots(): ReadonlyArray<HeroSlot> {
        const slots = this.options.heroes && this.options.heroes();
        if (slots && slots.length) {
            return slots;
        }
        const spell = this.options.playerLightSpell && this.options.playerLightSpell();
        return [{ sprite: this.options.playerSprite && this.options.playerSprite(), lightSpell: spell }];
    }

    /**
     * Keeps the camera on the heroes still standing - centred on the box round where they're drawn, zoomed out
     * as far as it takes to show them all (see `PartyFrame`) and for the height the first of them stands at;
     * on everyone, once they're all down. `frames` and `seconds` since the last display frame.
     */
    private MoveCamera(frames: number, seconds: number): void {
        const anyStanding = this.views.some(view => view.Hero.Alive);
        const followed = this.followed;
        followed.length = 0;
        this.views.forEach(view => {
            if (view.Hero.Alive || !anyStanding) {
                followed.push(view.DrawPosition);
            }
        });
        if (!followed.length) {
            return;
        }
        const first = this.views.find(view => view.Hero.Alive || !anyStanding);
        const tile = first.Hero.Tile;
        this.camera.SetZ(this.level.HeightAt(tile.x, tile.y));
        this.camera.UpdateZoom(seconds);
        const box = PartyBounds(followed, this.partyBox);
        this.camera.ZoomForParty(PartyZoom(box, this.BaseView()), frames);
        // The same pull per second whatever the frame rate.
        this.camera.Follow((box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2, 1 - Math.pow(1 - CameraFollow, frames));
    }

    /** How many tiles the camera shows across and down at its usual zoom. */
    private BaseView(): {width: number; height: number} {
        return {width: this.camera.BaseViewWidth, height: this.camera.BaseViewHeight};
    }

    /** The lights moving through the level this frame, where they're drawn (`alpha` between the last two steps): the torches the heroes carry, their mage-lights, and any shots that glow. */
    private MovingLights(alpha: number): MovingLight[] {
        const lights = this.movingLights;
        lights.length = 0;
        this.views.forEach(view => {
            const carried = view.Light;
            if (carried) {
                lights.push(carried);
            }
            const spell = view.SpellLight;
            if (spell) {
                lights.push(spell);
            }
        });
        this.world.encounter.projectiles.forEach(projectile => {
            if (projectile.light && !projectile.dead) {
                const x = projectile.px + (projectile.x - projectile.px) * alpha;
                const y = projectile.py + (projectile.y - projectile.py) * alpha;
                lights.push({ x: x / TileSize, y: y / TileSize, value: projectile.light, key: projectile });
            }
        });
        return lights;
    }

    /**
     * Gets the level's assets ready (see `LevelAssets`), then builds the level - at the start of
     * every visit and after every restart.
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
