import { EventEmitter } from "eventemitter3";
import {Application, interaction, settings, SCALE_MODES, utils} from "pixi.js";
import Assets from "../assets/Assets";
import { CreateAssets } from "../assets/PixiAssets";
import GamePad from "../io/GamePad";
import Keyboard from "../io/Keyboard";
import AssetFactory from "../loading/AssetFactory";
import { StatsTicker } from "../utils/StatsTicker";
import SceneManager from "./SceneManager";
import * as ScreenFull from 'screenfull';
import { IResizeStrategy, GetResizeStrategy, ResizeStrategies } from "./display/ResizeStrategies";

export interface IGameOptions {
        autoStart?: boolean;
        width?: number;
        height?: number;
        fit?: ResizeStrategies,
        fullscreen?: boolean;
        pixelArt?: boolean,
        view?: HTMLCanvasElement;
        transparent?: boolean;
        autoDensity?: boolean;
        antialias?: boolean;
        preserveDrawingBuffer?: boolean;
        resolution?: number;
        forceCanvas?: boolean;
        backgroundColor?: number;
        clearBeforeRender?: boolean;
        forceFXAA?: boolean;
        powerPreference?: string;
        sharedTicker?: boolean;
        sharedLoader?: boolean;
        resizeTo?: Window | HTMLElement;
}

export default class Game extends Application {
    public static inst: Game;
    public keyboard = new Keyboard();
    public gamePad = new GamePad();
    public sceneManager = new SceneManager(this.stage);
    /** This game's asset bundles - `await game.assets.Init(manifestUrl)` then `LoadBundle("global")` before the scenes that use them. Taken down with the game. */
    public assets: Assets = CreateAssets(() => this.ticker);
    public dispatcher = new EventEmitter();
    public resizeStrategy: IResizeStrategy;

    private destroyed = false;
    /** The window's resize handler this installed - `destroy` only takes it back if nobody's replaced it since. */
    private onResize: () => void;
    private requestFullscreen: (() => void) | undefined;

    constructor(options: IGameOptions, showStats: boolean = false) {
        super(options);

        Game.inst = this;
        this.stage.name = "stage";

        document.body.appendChild(this.view);

        if (showStats) {
            this.ticker = new StatsTicker();
        }

        if(options.pixelArt) {
            settings.SCALE_MODE = SCALE_MODES.NEAREST;
        }

        if(options.fullscreen && ScreenFull.isEnabled) {
            this.requestFullscreen = () => ScreenFull.request(this.view);
            this.interactionManager.once("pointerdown", this.requestFullscreen);
        }

        this.resizeStrategy = GetResizeStrategy(options.fit || "border");
        this.onResize = window.onresize = () => this.resizeStrategy.Resize(this.view);
        this.onResize();
    }

    public get interactionManager(): interaction.InteractionManager {
        return this.renderer.plugins.interaction;
    }

    /** Whether `destroy` has run - for async code (a boot that's loading) to notice the game went away under it. */
    public get Destroyed(): boolean {
        return this.destroyed;
    }

    /**
     * Takes the whole game down, in the order that lets each part rely on the ones after it: the
     * scenes first (they release what they hold on the stage, the ticker and the input), then the
     * input, the asset bundles (in-flight loads abandoned, sounds and fonts - process-wide tables -
     * removed), the shared sprite registry, and every texture Pixi has cached - and only then
     * Pixi's own application (its ticker, loader, stage and renderer). `Game.inst` is cleared, so
     * a new `Game` can be made in the same page. Safe to call twice.
     *
     * Overrides `Application.destroy`, so either way of tearing down reaches all of this.
     * `removeView` also takes the canvas off the page; unlike Pixi's it defaults to true, since
     * the constructor is what put it there.
     */
    destroy(removeView = true, stageOptions?: Parameters<Application["destroy"]>[1]): void {
        if (this.destroyed) {
            return;
        }
        this.destroyed = true;

        this.sceneManager.Destroy();

        this.keyboard.Destroy();
        this.gamePad.Destroy();
        this.dispatcher.removeAllListeners();
        this.assets.Destroy();

        if (window.onresize === this.onResize) {
            window.onresize = null;
        }
        if (this.requestFullscreen) {
            this.interactionManager.off("pointerdown", this.requestFullscreen);
        }

        AssetFactory.Destroy();
        // Before the renderer goes: destroying a texture disposes its GPU copy through it.
        utils.destroyTextureCache();

        super.destroy(removeView, stageOptions);

        if (Game.inst === this) {
            Game.inst = undefined;
        }
    }
}
