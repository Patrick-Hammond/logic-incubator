import GameComponent from "../../_lib/game/GameComponent";
import {Camera} from "./components/Camera";
import Cat from "./components/Cat";
import Home from "./components/Home";
import Map from "./components/Map";
import Player from "./components/Player";
import PlayerControl from "./components/PlayerControl";

export class TreasureGrab extends GameComponent {

    private camera: Camera;
    private map: Map;
    private player: Player;
    private home: Home;
    private cat: Cat;
    private playerControl: PlayerControl;

    protected OnInitialise(): void {

        this.camera = new Camera();

        this.map = new Map();

        this.player = new Player(this.map, this.camera);
        this.player.SetPosition(14, 2);
        this.playerControl = new PlayerControl(0);

        this.home = new Home();

        this.cat = new Cat(this.map);

        this.camera.root.addChild(this.map.background, this.cat.root, this.player.root, this.map.foreground, this.home.root);

        this.game.ticker.add(this.OnUpdate, this);
    }

    private OnUpdate(dt: number): void {
        const direction = this.playerControl.Get();
        if(direction && direction !== "none") {
            this.player.Move(direction);
        }
    }
}
