import Game from "./Game";
import AssetFactory from "./loading/AssetFactory";
import Loader from "./loading/Loader";

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
        this.game.GetScene(id).root.addChild(this.root);
    }
}
