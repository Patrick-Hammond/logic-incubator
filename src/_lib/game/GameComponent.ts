import AssetFactory from "../loading/AssetFactory";
import Loader from "../loading/Loader";
import Game from "./Game";

export default abstract class GameComponent {

    protected game: Game;
    protected assetFactory: AssetFactory;
    protected loader: Loader;
    protected root = new PIXI.Container();

    private initialised = false;

    constructor() {
        this.game = Game.inst;
        this.assetFactory = AssetFactory.inst;
        this.loader = Loader.inst;
        this.root.on("added", () => {
            this.OnShow(this.initialised);
            this.initialised = true;
        }));
    }
    protected OnShow(first): void {}
    protected AddToScene(id: string): void {
        this.game.sceneManager.GetScene(id).root.addChild(this.root);
    }
}
