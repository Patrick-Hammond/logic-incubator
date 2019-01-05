import {Application, interaction, RendererOptions} from "pixi.js";
import GameComponent from "./GameComponent";

export default class Game extends Application {

    public static inst: Game;
    private scenes: {[id: string]: GameComponent} = {};

    constructor(private width = 1280, private height = 720, rendererOptions?: RendererOptions) {
        super(width, height, rendererOptions || {backgroundColor: 0x111111, autoStart: true}, false, true, true);

        Game.inst = this;
        this.stage.name = "stage";
        document.body.appendChild(this.view);
    }

    public get interactionManager(): interaction.InteractionManager {
        return this.renderer.plugins.interaction;
    }

    public GetScene(id: string): GameComponent {
        return this.scenes[id];
    }

    public AddScene(id: string, scene: GameComponent): void {
        this.scenes[id] = scene;
        scene.root.name = id;
    }

    public ShowScene(id: string): void {
        Object.keys(this.scenes).forEach(key => {
            const scene = this.scenes[key];
            if(key === id) {
                this.stage.addChild(scene.root);
            } else if(scene.root.parent === this.stage) {
                this.stage.removeChild(scene.root);
            }
        });
    }
}
