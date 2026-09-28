import {Container} from "pixi.js";
import AssetFactory from "../loading/AssetFactory";
import Loader from "../loading/Loader";
import Game from "./Game";

export default abstract class GameComponent {
    public root = new Container();

    protected game: Game;
    protected assetFactory: AssetFactory;
    protected loader: Loader;

    private initialised = false;

    constructor() {
        this.game = Game.inst;
        this.assetFactory = AssetFactory.inst;
        this.loader = Loader.inst;
        this.root.on("added", () => {
            if (!this.initialised) {
                this.initialised = true;
                this.OnInitialise();
            }
            this.OnShow();
        });
    }
    protected OnInitialise(): void {
        // override and do initialisation here
    }
    protected OnShow(): void {
        // override and do stuff
    }
    protected AddToScene(id: string): void {
        this.game.sceneManager.GetScene(id).root.addChild(this.root);
    }
}
