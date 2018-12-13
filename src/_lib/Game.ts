import { RendererOptions, Application, interaction } from "pixi.js";

export default class Game extends Application
{
    public static inst: Game;

    constructor(private width = 1280, private height = 720, rendererOptions?: RendererOptions)
    {
        super(width, height, rendererOptions || { backgroundColor: 0x111111, autoStart: true }, false, true, true);

        Game.inst = this;

        document.body.appendChild(this.view);

        //window.onresize = () => this.Resize();
        //this.Resize();
    }

    public get interactionManager(): interaction.InteractionManager
    {
        return this.renderer.plugins.interaction;
    }

    private Resize(): void
    {
        let clientWidth = this.view.clientWidth | 0;
        let clientHeight = this.view.clientHeight | 0;

        //resize
        //this.renderer.resize(clientWidth, clientHeight);

        //scale
        //this.stage.scale.set(Math.min(this.clientWidth / this.width, this.clientHeight / this.height));

        //align
        // this.stage.position.set(Math.round((this.clientWidth - this.stage.width) / 2), Math.round((this.clientHeight - this.stage.height) / 2));
    }
}
