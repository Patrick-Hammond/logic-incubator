import Game from "./Game";
import AssetFactory from "./loading/AssetFactory";
import Loader from "./loading/Loader";

export default abstract class GameComponent 
{
    public game:Game;
    public assetFactory:AssetFactory;
    public loader:Loader;
    public root = new PIXI.Container();

    constructor(startUpdates:boolean = false)
    {
        this.game = Game.inst;
        this.assetFactory = AssetFactory.inst;
        this.loader = Loader.inst;

        if(startUpdates) this.StartUpdates();
    }
    
    public AddToStage():PIXI.DisplayObject
    {
        return Game.inst.stage.addChild(this.root);
    }

    public RemoveFromStage():PIXI.DisplayObject
    {
        if(this.root.parent){
            return Game.inst.stage.removeChild(this.root);
        }
        return null;
    }

    public StartUpdates():void
    {
        Game.inst.ticker.add(this.Update, this);
    }

    public StopUpdates():void
    {
        Game.inst.ticker.remove(this.Update, this);
    }

    protected Update(dt:number):void{}
}
