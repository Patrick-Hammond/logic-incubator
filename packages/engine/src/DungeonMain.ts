import type {SoundId} from "@logic-incubator/lib/assets/AssetIds";
import NamedSounds from "@logic-incubator/lib/assets/NamedSounds";
import GameComponent from "@logic-incubator/lib/game/GameComponent";
import AssetFactory from "@logic-incubator/lib/loading/AssetFactory";
import {Vec2, Vec2Like} from "@logic-incubator/lib/math/Geometry";
import AmbientSounds from "./AmbientSounds";
import { TileSize } from "./Constants";
import {ALL_PLAYERS_DIED, BOSS_WOKE, GAME_PAUSED, GAME_RESUMED, LEVEL_COMPLETED, LEVEL_CREATED, MONSTER_KILLED, NPC_BUMPED, TALK_ENDED, TALK_LINE, TALK_STARTED} from "./Events";
import FixedStep, {StepSeconds} from "./FixedStep";
import Footsteps from "./Footsteps";
import PlayerControl, {DefaultInput, InputDevice} from "./input/PlayerControl";
import AssetMetadataStore from "./level/AssetMetadata";
import { AssetMetadataBinding, BindAssetMetadata } from "./level/AssetMetadataBinding";
import LevelAssets from "./level/LevelAssets";
import LevelMusic from "./level/LevelMusic";
import MonsterRoster from "./level/entities/MonsterRoster";
import {LightSpell} from "./level/entities/LightSpell";
import {ArtBounds, SpriteSize, WeaponDef} from "./level/entities/Projectiles";
import Level from "./level/Level";
import {LevelFile} from "./level/LevelFormat";
import { MovingLight } from "./level/SceneLights";
import type {NetPlay} from "./net/NetPlay";
import World from "./sim/World";
import SoundBoard, {HeroSounds, SoundEvents, SoundTable} from "./SoundBoard";
import DialogRunner, {DialogLine} from "./story/DialogRunner";
import type {EncounterView} from "./Encounter";
import {Camera} from "./view/Camera";
import DialogView from "./view/DialogView";
import Effects from "./view/Effects";
import EntityRenderer from "./view/EntityRenderer";
import {HeroView} from "./view/HeroView";
import {PartyBounds, PartySpan, PartyZoom} from "./view/helpers/PartyFrame";
import Hud from "./view/Hud";
import QuestTracker from "./view/QuestTracker";
import ShoutView from "./view/ShoutView";
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
    /** What they sound like when hurt and when they fall - left out, the game's `sounds` table has it. */
    sounds?: HeroSounds;
};

/** One hero in a level and who plays them - see `DungeonMainOptions.heroes`. */
export type HeroSlot = {
    /**
     * What they're played with - the keyboard or the first gamepad without it. Null for a hero played on another
     * machine, in an online run: nothing here moves them, and this screen's camera leaves them out (see `heroes`).
     */
    input?: InputDevice | null;
    /** The animation they're drawn with - `PlayerSetup.sprite` without it. */
    sprite?: string;
    /** Their light spell: null for none, `PlayerSetup.lightSpell` when left out. */
    lightSpell?: LightSpell | null;
    /** What they sound like when hurt and when they fall - a character's own voice. `PlayerSetup.sounds` when left out. */
    sounds?: HeroSounds;
    /** What their row in the HUD is headed - "PLAYER n" when left out. */
    name?: string;
};

export type DungeonMainOptions = {
    player: PlayerSetup;
    /**
     * Who plays - one slot per hero, in order (the first is hero 0) - asked for each time a level starts,
     * like `level`. Undefined, or without it, there's one hero, played with the keyboard or the first
     * gamepad, drawn and lit as `playerSprite` and `playerLightSpell` say. The camera keeps to the heroes
     * played on this machine (all of them, when none is), and a party all on this screen is held to what
     * fits on it.
     */
    heroes?: () => ReadonlyArray<HeroSlot> | undefined;
    /**
     * The seed the level's random numbers start from (see `Encounter.Reset`), asked for each time a level
     * starts, like `level` - how an online run's machines all spawn the same monsters. Undefined, or without
     * it, a new one each time.
     */
    seed?: () => number | undefined;
    /**
     * Online: the run this machine plays in - a `HostSession` or `GuestSession` (see `CreateNetPlay`) - asked for each
     * time a level starts, like `seed`. The host's world is the run's: a guest's draws the host's snapshots and moves
     * only its own hero ahead of them, and starts the level over only when the host does. Undefined, or without it,
     * the level plays on this machine alone.
     */
    net?: () => NetPlay | undefined;
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
     * The track the level plays to, on a loop - usually one in `levelBundle`'s bundle - asked for with each start like
     * `level`. It plays while the scene is showing and stops when it's hidden; a restart, or a next level, that asks for
     * the same track lets it carry on rather than start it over. Undefined, or without it, the level has no music. While a
     * boss is awake, `sounds.bossMusic` plays in its place, if the build has it.
     */
    music?: () => SoundId | undefined;
    /**
     * What play sounds like, where the thing it happens to doesn't name its own sound (see `SoundBoard`): each by name, a
     * name the build has no sound for being skipped, so every one can be named before its file exists. Without it, only
     * what names its own (shots, monsters, sprites' metadata) is heard. The scene plays a few itself: the heroes' `footstep`,
     * the level's `ambience` and every tile's metadata `loop` (see `AmbientSounds`), and the `bossMusic`.
     */
    sounds?: SoundTable;
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
    /** Each hero's controls, by slot - remade as each level starts, from `heroes`; null for one played on another machine. */
    private controls: Array<PlayerControl | null> = [];
    /** By slot: whether that hero is played on this machine - the ones the camera keeps to. */
    private local: boolean[] = [];
    /** Each hero's looks, by slot - kept from level to level, and pointed at that level's heroes. */
    private views: HeroView[] = [];
    private world: World | undefined;
    private renderer: EntityRenderer | undefined;
    private hud: Hud | undefined;
    private tracker: QuestTracker | undefined;
    private dialog: DialogView | undefined;
    /** The talk with an NPC going on - see `StartTalk` - or null. */
    private talk: {runner: DialogRunner; hero: number} | null = null;
    private effects: Effects | undefined;
    private shouts: ShoutView | undefined;
    /** The centres of the heroes who hear the NPCs shout - gathered into the same array each frame (see `Hearers`). */
    private readonly hearers: Vec2Like[] = [];
    private levelAssets: LevelAssets | undefined;
    private music: LevelMusic | undefined;
    /** The level's loops - its ambience, its torches' crackle. */
    private ambient: AmbientSounds | undefined;
    /** Plays the sounds the scene plays itself, by name - see `sounds`. */
    private sounds: NamedSounds | undefined;
    private footsteps = new Footsteps();
    /** `hearers` in tiles, and by slot where the heroes who walk here are (see `Walkers`) - gathered into the same arrays each frame. */
    private readonly tileHearers: Vec2Like[] = [];
    private readonly walkers: Array<Vec2Like | null> = [];
    /** By slot, what each hero sounds like - from the slots the level started with. */
    private heroSounds: Array<HeroSounds | undefined> = [];
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
    /** The middle of `partyBox` last frame, in pixels - null as a level starts. See `MoveCamera`. */
    private lastFollowed: Vec2 | null = null;
    /** The online run this level is played in, as `net` gave it when the level started - null offline. */
    private net: NetPlay | null = null;
    /** Whether this visit shows the online run's numbers (`NetPlay.Stats`) - see `OnLevelCreated`. */
    private watchingNet = false;

    constructor(private options: DungeonMainOptions) {
        super();
    }

    /** Where a game plays particle effects (`Effects.Play`) - undefined until the scene has been initialised. */
    get Effects(): Effects | undefined {
        return this.effects;
    }

    /** Whether play runs on: a level has started, and nothing - a pause (offline), a talk, the party's end, a restart - holds it. */
    private get Running(): boolean {
        return this.started && (!this.paused || !!this.net) && !this.talk && !this.waitingForRestart && !this.restarting && this.restartIn <= 0;
    }

    /** Whether the hero is talking to an NPC - play holds still until the talk is over (`TALK_ENDED`). */
    get Talking(): boolean {
        return !!this.talk;
    }

    /** Whether `Pause` is in force - online, where play goes on under it, the heroes played here just stand still. */
    get Paused(): boolean {
        return this.paused;
    }

    /** Whether this machine can start the level over (`Restart`): offline, or the host of an online run - a guest's starts over when the host's does. */
    get CanRestart(): boolean {
        return !this.net || this.net.IsHost;
    }

    /** The online run being played, if any - see `DungeonMainOptions.net`. */
    get Net(): NetPlay | null {
        return this.net;
    }

    /** Whether the level is over - every hero down, or one out - and waiting to be restarted (see `manualRestart`). */
    get WaitingForRestart(): boolean {
        return this.waitingForRestart;
    }

    /**
     * Stops play - nothing moves, shoots or spawns - until `Resume`. Online the world plays on, as it's everyone's: only the
     * heroes played here stop, and stand still until `Resume`. Does nothing before a level has started, once it's over, or in a talk.
     */
    Pause(): void {
        if (this.paused || !this.started || this.talk || this.waitingForRestart || this.restarting || this.restartIn > 0) {
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
     * level ends: with the level `level` hands back, which can be the next one after a way out was reached. Online,
     * only the host can (see `CanRestart`), and starts it over for everyone.
     */
    Restart(): void {
        if (this.CanRestart) {
            this.StartOver();
        }
    }

    protected OnInitialise(): void {
        const level = this.level = new Level();

        // Attached in drawing order: the world, then the HUD over it.
        const camera = this.camera = this.Attach(new Camera());
        this.Attach(new TileMapView(level, camera));
        // Inside the camera, so effects scroll and zoom with the world, and over its layers; under the HUD.
        this.effects = this.Attach(new Effects(camera), camera.root);
        // Over the world, as its effects are, but under the HUD.
        this.shouts = this.Attach(new ShoutView(level, camera));
        this.hud = this.Attach(new Hud(this.options.player.hearts));
        this.tracker = this.Attach(new QuestTracker());
        this.dialog = this.Attach(new DialogView({
            next: () => this.TalkOn(this.talk && this.talk.runner.Next()),
            choose: index => this.TalkOn(this.talk && this.talk.runner.Choose(index)),
            end: () => this.EndTalk()
        }));
        if (this.options.overlay) {
            this.Attach(this.options.overlay(this));
        }

        this.renderer = new EntityRenderer(camera, level);
        this.world = new World(level, {
            emit: (event, ...args) => {
                // The host sends what happens on to its guests.
                if (this.net) {
                    this.net.Record(event, args);
                }
                this.game.dispatcher.emit(event, ...args);
            },
            sizeFor: SizeOf
        });

        // Each bundle's metadata (collision, doors, light...) follows the bundle in and out.
        const metadata: AssetMetadataBinding = BindAssetMetadata(this.game.assets, AssetMetadataStore.inst);
        this.Own(() => metadata.Dispose());
        this.levelAssets = new LevelAssets(this.game.assets, metadata);
        const music = this.music = new LevelMusic(this.game.assets);
        this.WhileShown(() => music.Show(), () => music.Hide());
        const assets = this.game.assets;
        const sounds = this.sounds = new NamedSounds(assets);
        const ambient = this.ambient = new AmbientSounds({
            Find: name => sounds.Find(name),
            PlaySound: (id, options) => assets.PlaySound(id, options),
            StopSound: id => assets.StopSound(id)
        });
        this.WhileShown(() => ambient.Show(), () => ambient.Hide());
        this.ListenWhileShown(this.game.dispatcher, BOSS_WOKE, () => music.BossWoke());
        this.ListenWhileShown(this.game.dispatcher, MONSTER_KILLED, (...args: unknown[]) => {
            if (args[4]) {
                music.BossFell();
            }
        });
        const board = new SoundBoard({
            sounds,
            table: this.options.sounds,
            monster: type => MonsterRoster.inst.Def(type),
            metadata: sprite => AssetMetadataStore.inst.Get(sprite),
            hero: slot => this.heroSounds[slot]
        });
        // What happens while the dungeon isn't showing (the editor's own goings-on) isn't heard.
        SoundEvents.forEach(event => this.ListenWhileShown(this.game.dispatcher, event, (...args: unknown[]) => board.Heard(event, args)));

        this.Listen(this.game.dispatcher, LEVEL_CREATED, this.OnLevelCreated);
        // The level is over either way: everyone down, or a hero out.
        this.Listen(this.game.dispatcher, ALL_PLAYERS_DIED, this.OnLevelOver);
        this.Listen(this.game.dispatcher, LEVEL_COMPLETED, this.OnLevelOver);
        this.Listen(this.game.dispatcher, NPC_BUMPED, this.StartTalk);
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
        this.local = [];
        this.net = null;
        this.level.Dispose();
        if (this.options.levelBundle && !this.game.assets.IsDestroyed) {
            // Lets go of the level's bundle (its textures go a frame later, once this scene has left the stage).
            this.game.assets.UseLevelBundle().catch(() => undefined);
        }
        // Drops anything a `Reload` still waiting on its assets would otherwise carry on with.
        this.level = this.camera = this.world = this.renderer = this.hud = this.tracker = this.dialog = this.effects = this.shouts = this.levelAssets = this.music = this.ambient = this.sounds = undefined;
        this.talk = null;
    }

    /** Every hero is down, or one got out: hold still, then start over - with whatever level `level` hands back - shortly, or when told to (always, for an online guest, whose host says when). */
    private OnLevelOver(): void {
        if (this.options.manualRestart || !this.CanRestart) {
            this.waitingForRestart = true;
        } else {
            this.restartIn = RestartDelay;
        }
    }

    /** A level has just been built (see `TileMapView`): start it over - the heroes, monsters and drawing, and the restart timer. */
    private OnLevelCreated(): void {
        const setup = this.options.player;
        const slots = this.Slots();
        const seed = this.options.seed && this.options.seed();
        const net = (this.options.net && this.options.net()) || null;
        this.EndTalk();
        this.world.Reset(setup, slots.map(slot => (slot.lightSpell === undefined ? setup.lightSpell : slot.lightSpell || undefined)), seed);
        this.heroSounds = slots.map(slot => slot.sounds || setup.sounds);
        // Talking is for a Quest: one hero, on this machine alone - and so is hearing the NPCs shout.
        const talk = !net && slots.length === 1;
        this.world.SetTalk(talk);
        const world = this.world;
        this.shouts.Begin(talk ? this.level.talkers : [], { quests: world.quests, flags: world.flags, Reward: () => undefined });
        this.tracker.Begin(this.world.quests);
        this.local = slots.map(slot => slot.input !== null);
        // A party sharing one screen is held to what fits on it; one spread over machines isn't.
        const allHere = this.local.every(here => here);
        this.world.SetLeash(slots.length > 1 && allHere ? PartySpan(this.BaseView()) : null);
        this.controls = slots.map(slot => (slot.input === null ? null : new PlayerControl(slot.input || DefaultInput)));
        // Views are kept from level to level, so a hero's animation isn't remade on every restart.
        this.views.splice(slots.length).forEach(view => view.Destroy());
        this.world.Heroes.forEach((hero, i) => {
            const sprite = slots[i].sprite || setup.sprite;
            hero.SetFigure(ArtOf(sprite));
            const view = this.views[i];
            if (view) {
                view.SetSprite(sprite);
                view.Reset(hero);
            } else {
                this.views.push(new HeroView(hero, sprite));
            }
        });
        this.hud.SetNames(slots.map((slot, i) => ({ name: slot.name || "PLAYER " + (i + 1), own: !allHere && this.local[i] })));
        this.renderer.Reset();
        this.lastFollowed = null;
        this.fixedStep.Reset();
        this.footsteps.Reset();
        this.restartIn = 0;
        this.restarting = false;
        this.waitingForRestart = false;
        this.started = true;

        this.net = net;
        if (net) {
            const dispatcher = this.game.dispatcher;
            net.Begin({
                world: this.world,
                level: this.level,
                emit: (event, ...args) => dispatcher.emit(event, ...args),
                restart: () => this.StartOver(),
                sizeFor: SizeOf
            });
            if (!this.watchingNet) {
                // How the connection is doing, in a corner of the page, for the rest of this visit - a development build only.
                this.watchingNet = true;
                const close = this.debug.Watch("NET", () => (this.net ? this.net.Stats() : []));
                this.Track(() => {
                    close();
                    this.watchingNet = false;
                });
            }
        }
    }

    /** Starts the level over now - on every machine, from an online host. */
    private StartOver(): void {
        if (!this.started || this.restarting || !this.level) {
            return;
        }
        if (this.paused) {
            this.paused = false;
            this.game.dispatcher.emit(GAME_RESUMED);
        }
        if (this.net && this.net.IsHost) {
            this.net.Restart();
        }
        this.restarting = true;
        this.waitingForRestart = false;
        this.Reload();
    }

    /**
     * One display frame - only while this scene is showing (see `Tick`), so nothing moves (or
     * spawns) behind the editor. Play runs in fixed steps of `StepSeconds` (see `FixedStep`),
     * as many as the frame's time calls for, so it comes out the same at any frame rate; what's
     * drawn goes between the last two steps. `frames` is the ticker's delta, in 60ths of a second.
     */
    private OnUpdate(frames: number): void {
        const net = this.net;
        // Offline a pause stops the world; online it's everyone's, and plays on.
        if (!this.started || (this.paused && !net)) {
            return;
        }
        if (this.waitingForRestart) {
            // Nothing moves under the end screen, but online the others are still connected, and one can leave.
            if (net) {
                net.Frame(frames);
                this.hud.RenderHeroes(this.world.Heroes);
            }
            return;
        }
        const seconds = this.game.ticker.deltaMS / 1000;

        if (this.restartIn > 0 || this.restarting) {
            // Over: everything holds still for a moment, then until the level has started over.
            this.restartIn -= seconds;
            if (this.restartIn <= 0 && !this.restarting) {
                this.StartOver();
            }
            return;
        }

        const steps = this.fixedStep.Advance(seconds);
        // A step can stop play - the last hero falls, or one gets out - and none run after that.
        for (let i = 0; i < steps && this.Running; i++) {
            // Paused (online), the heroes played here stand still.
            const inputs = this.controls.map(control => (control && !this.paused ? control.Get() : undefined));
            if (net) {
                net.Step(inputs);
            } else {
                this.world.Step(inputs, 1, StepSeconds);
            }
        }
        if (net) {
            net.Frame(frames);
        }
        const alpha = this.fixedStep.Alpha;
        this.views.forEach((view, i) => view.Place(alpha, net && net.DrawOffset(i)));
        const entities = (net && net.Entities) || this.world.encounter;

        // Before the camera moves, since moving it draws the tiles.
        this.lightTime += seconds;
        this.level.UpdateLights(this.lightTime, this.MovingLights(entities, alpha));
        this.MoveCamera(frames, seconds);

        this.renderer.Render(this.views, entities, alpha);
        if (this.world.Heroes.length) {
            this.hud.RenderHeroes(this.world.Heroes);
        }
        this.tracker.Render(this.world.quests);
        const hearers = this.Hearers();
        // A talk holds the NPCs' shouts where they are, hushed.
        if (!this.talk) {
            this.shouts.Render(seconds, hearers);
        }
        this.ambient.Update(this.InTiles(hearers), seconds);
        if (this.footsteps.Update(this.Walkers()) > 0) {
            this.sounds.Play(this.options.sounds && this.options.sounds.footstep);
        }
    }

    /** The centres of the heroes played here who are still standing - the ones who hear the NPCs shout. */
    private Hearers(): ReadonlyArray<Vec2Like> {
        const hearers = this.hearers;
        hearers.length = 0;
        this.world.Heroes.forEach((hero, i) => {
            if (this.local[i] && hero.Alive && !hero.Gone) {
                hearers.push(hero.Centre);
            }
        });
        return hearers;
    }

    /** `pixels` (the `hearers`), in tiles - what `AmbientSounds` measures by. */
    private InTiles(pixels: ReadonlyArray<Vec2Like>): ReadonlyArray<Vec2Like> {
        const tiles = this.tileHearers;
        tiles.length = pixels.length;
        pixels.forEach((point, i) => {
            const tile = tiles[i] || (tiles[i] = { x: 0, y: 0 });
            tile.x = point.x / TileSize;
            tile.y = point.y / TileSize;
        });
        return tiles;
    }

    /** By slot: the centres of the heroes played here who are still standing, and null for the rest - whose feet are heard (see `Footsteps`). */
    private Walkers(): ReadonlyArray<Vec2Like | null> {
        const walkers = this.walkers;
        walkers.length = 0;
        this.world.Heroes.forEach((hero, i) => walkers.push(this.local[i] && hero.Alive && !hero.Gone ? hero.Centre : null));
        return walkers;
    }

    /**
     * A hero walked into an NPC (`NPC_BUMPED`): the talk starts - play holds still while it goes on - with what its script
     * says first, unless it says nothing at all. What it hands out goes to that hero.
     */
    private StartTalk(hero: number, tileX: number, tileY: number): void {
        const talker = this.level && this.level.TalkerAt(tileX, tileY);
        const world = this.world;
        if (!talker || !world || this.talk || this.net) {
            return;
        }
        const runner = new DialogRunner(talker.script, {
            quests: world.quests,
            flags: world.flags,
            Reward: (value, sprite) => world.Heroes[hero].ApplyPickup({value, sprite})
        });
        const line = runner.Start();
        if (!line) {
            return;
        }
        this.talk = {runner, hero};
        this.shouts.Hush();
        const tile = talker.tile;
        this.dialog.Open(line, tile ? (tile.anim ? tile.anim.texture : tile.texture) : undefined);
        this.game.dispatcher.emit(TALK_STARTED, hero, tileX, tileY);
    }

    /** The talk's next line - or, with none, its end. */
    private TalkOn(line: DialogLine | null): void {
        if (line) {
            this.dialog.Say(line);
            this.game.dispatcher.emit(TALK_LINE);
        } else {
            this.EndTalk();
        }
    }

    /** Ends the talk going on, if there is one, and play goes on. */
    private EndTalk(): void {
        if (!this.talk) {
            return;
        }
        this.talk = null;
        if (this.dialog) {
            this.dialog.Close();
        }
        this.game.dispatcher.emit(TALK_ENDED);
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
     * Keeps the camera on the heroes played here (every hero, if none is) who are still standing - centred on the
     * box round where they're drawn, zoomed out as far as it takes to show them all (see `PartyFrame`) and for the
     * height the first of them stands at. With all of those down it follows a teammate still standing (online, where
     * the rest play on elsewhere), and with no one standing, where they fell. Where they've gone further than half a
     * view in one frame - through a portal - it cuts to them rather than sweeping across the map. `frames` and `seconds`
     * since the last display frame.
     */
    private MoveCamera(frames: number, seconds: number): void {
        const anyHere = this.local.some(here => here);
        const watched = (i: number) => !anyHere || this.local[i];
        const standing = (view: HeroView) => view.Hero.Alive;
        let kept = (view: HeroView, i: number) => watched(i) && standing(view);
        if (!this.views.some(kept)) {
            // One in play: an away teammate stands still.
            const teammate = this.views.findIndex(view => standing(view) && !view.Hero.Away);
            kept = teammate >= 0 ? (_, i) => i === teammate : (view, i) => watched(i) && !view.Hero.Gone;
        }
        const followed = this.followed;
        followed.length = 0;
        this.views.forEach((view, i) => {
            if (kept(view, i)) {
                followed.push(view.DrawPosition);
            }
        });
        if (!followed.length) {
            return;
        }
        const first = this.views.find(kept);
        const tile = first.Hero.Tile;
        this.camera.SetZ(this.level.HeightAt(tile.x, tile.y));
        this.camera.UpdateZoom(seconds);
        const box = PartyBounds(followed, this.partyBox);
        const view = this.BaseView();
        this.camera.ZoomForParty(PartyZoom(box, view), frames);
        const x = (box.minX + box.maxX) / 2;
        const y = (box.minY + box.maxY) / 2;
        const last = this.lastFollowed;
        const jumped = !!last && (Math.abs(x - last.x) > (view.width * TileSize) / 2 || Math.abs(y - last.y) > (view.height * TileSize) / 2);
        this.lastFollowed = (last || new Vec2()).Set(x, y);
        // The same pull per second whatever the frame rate.
        this.camera.Follow(x, y, jumped ? 1 : 1 - Math.pow(1 - CameraFollow, frames));
    }

    /** How many tiles the camera shows across and down at its usual zoom. */
    private BaseView(): {width: number; height: number} {
        return {width: this.camera.BaseViewWidth, height: this.camera.BaseViewHeight};
    }

    /** The lights moving through the level this frame, where they're drawn (`alpha` between the last two steps): the torches the heroes carry, their mage-lights, and any of `entities`' shots that glow. */
    private MovingLights(entities: EncounterView, alpha: number): MovingLight[] {
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
        entities.projectiles.forEach(projectile => {
            if (projectile.light && !projectile.dead) {
                const x = projectile.px + (projectile.x - projectile.px) * alpha;
                const y = projectile.py + (projectile.y - projectile.py) * alpha;
                lights.push({ x: x / TileSize, y: y / TileSize, value: projectile.light, key: projectile });
            }
        });
        return lights;
    }

    /**
     * Gets the level's assets ready (see `LevelAssets`), then builds the level and puts its music and loops on -
     * at the start of every visit and after every restart.
     */
    private async Reload(): Promise<void> {
        const ready = await this.levelAssets.Prepare(this.options.levelBundle && this.options.levelBundle());
        const file = this.options.level();
        // The scene may have been destroyed while the assets loaded.
        if (ready && file && this.level) {
            this.level.LoadLevel(file);
            const table = this.options.sounds || {};
            // Looked up now, as the level's bundle may have its own.
            const boss = table.bossMusic ? this.sounds.Find(table.bossMusic)[0] : undefined;
            this.music.Play((this.options.music && this.options.music()) || null, boss || null);
            this.ambient.Begin(table.ambience, this.level.soundLoops);
        }
    }
}

/** Pixel size of a sprite, or undefined if there's no such thing - what a monster's shootable box is sized from. */
function SizeOf(name: string): {width: number; height: number} | undefined {
    return AssetFactory.inst.Has(name) ? AssetFactory.inst.CreateTexture(name) : undefined;
}

/** A sprite's frame size and where its art is, over every frame of an animation (`ArtBounds`) - what a hero picks things up with. Undefined if there's no such thing. */
function ArtOf(name: string): SpriteSize | undefined {
    return AssetFactory.inst.Has(name) ? ArtBounds(AssetFactory.inst.CreateTextures(name)) : undefined;
}
