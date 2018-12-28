import {Application, interaction, RendererOptions} from "pixi.js";

export default class Game extends Application {
    public static inst: Game;

    constructor(private width = 1280, private height = 720, rendererOptions?: RendererOptions) {
        super(width, height, rendererOptions || {backgroundColor: 0x111111, autoStart: true}, false, true, true);

        Game.inst = this;

        document.body.appendChild(this.view);
    }

    public get interactionManager(): interaction.InteractionManager {
        return this.renderer.plugins.interaction;
    }
}
