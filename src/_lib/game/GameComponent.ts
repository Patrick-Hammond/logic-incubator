import AssetFactory from "../loading/AssetFactory";
import Loader from "../loading/Loader";
import Game from "./Game";

export default abstract class GameComponent {
    public game: Game;
    public assetFactory: AssetFactory;
    public loader: Loader;
    public root = new PIXI.Container();

    constructor() {
        this.game = Game.inst;
        this.assetFactory = AssetFactory.inst;
        this.loader = Loader.inst;
    }

    public AddToScene(id: string): void {
        this.game.sceneManager.GetScene(id).root.addChild(this.root);
    }
}
