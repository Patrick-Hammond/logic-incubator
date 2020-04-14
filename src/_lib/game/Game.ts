import { EventEmitter } from "eventemitter3";
import {Application, interaction, settings, SCALE_MODES, utils} from "pixi.js";
import GamePad from "../io/GamePad";
import Keyboard from "../io/Keyboard";
import { StatsTicker } from "../utils/StatsTicker";
import SceneManager from "./SceneManager";
import ScreenFull from 'screenfull-es6';
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
    public sceneManager = new SceneManager();
    public dispatcher = new EventEmitter();
    public resizeStrategy: IResizeStrategy;

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

        if(options.fullscreen && ScreenFull.enabled) {
            const mobileIOS = utils.isMobile.apple && (utils.isMobile.phone || utils.isMobile.tablet);
            if(mobileIOS) {
                this.interactionManager.once("pointerdown", () => ScreenFull.request(this.view));
            }
        }

        this.resizeStrategy = GetResizeStrategy(options.fit || "border");
        const onResize = window.onresize = () => this.resizeStrategy.Resize(this.view);
        onResize();
    }

    public get interactionManager(): interaction.InteractionManager {
        return this.renderer.plugins.interaction;
    }
}
