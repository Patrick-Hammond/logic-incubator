import GameComponent from "../../_lib/game/GameComponent";
import {Camera} from "./Camera";
import Cat from "./Cat";
import Map from "./Map";
import Player from "./Player";
import PlayerControl from "./PlayerControl";

export class TreasureGrab extends GameComponent {

    private camera: Camera;
    private map: Map;
    private player: Player;
    private cat: Cat;
    private playerControl: PlayerControl;

    protected OnInitialise(): void {

        this.camera = new Camera();

        this.map = new Map();

        this.player = new Player(this.map, this.camera);
        this.player.SetPosition(14, 2);
        this.playerControl = new PlayerControl(0);

        this.cat = new Cat(this.map);

        this.camera.root.addChild(this.map.background, this.cat.root, this.player.root, this.map.foreground);

        this.game.ticker.add(this.OnUpdate, this);
    }

    private OnUpdate(dt: number): void {
        const direction = this.playerControl.Get();
        if(direction && direction !== "none") {
            this.player.Move(direction);
        }
    }
}
