import {Application, interaction, RendererOptions} from "pixi.js";
import {Keyboard} from "../io/Keyboard";
import SceneManager from "./SceneManager";

export default class Game extends Application {

    public static inst: Game;
    public keyboard = new Keyboard();
    public sceneManager = new SceneManager();

    constructor(private width = 1280, private height = 720, rendererOptions?: RendererOptions) {
        super(width, height, rendererOptions || {backgroundColor: 0x111111, autoStart: true}, false, true, true);

        Game.inst = this;
        this.stage.name = "stage";
        document.body.appendChild(this.view);
    }

    public get interactionManager(): interaction.InteractionManager {
        return this.renderer.plugins.interaction;
    }
}
