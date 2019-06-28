import {EventEmitter} from "eventemitter3";
import {Application, interaction, RendererOptions} from "pixi.js";
import Keyboard from "../io/Keyboard";
import GamePad from "../io/GamePad";
import SceneManager from "./SceneManager";
import {StatsTicker} from "../utils/StatsTicker";

export default class Game extends Application {

    public static inst: Game;
    public keyboard = new Keyboard();
    public gamePad = new GamePad();
    public sceneManager = new SceneManager();
    public dispatcher = new EventEmitter();

    constructor(private width = 1280, private height = 720, rendererOptions?: RendererOptions, showStats:boolean = false) {
        super(width, height, rendererOptions || {backgroundColor: 0x111111, autoStart: true}, false, !showStats, true);

        Game.inst = this;
        this.stage.name = "stage";
        document.body.appendChild(this.view);

        if(showStats) {
            this.ticker = new StatsTicker();
        }
    }

    public get interactionManager(): interaction.InteractionManager {
        return this.renderer.plugins.interaction;
    }

    
}
