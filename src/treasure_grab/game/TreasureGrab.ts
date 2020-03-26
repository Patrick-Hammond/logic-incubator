import GameComponent from "../../_lib/game/GameComponent";
import Map from "./Map";
import Player from "./Player";
import PlayerControl from "./PlayerControl";

export class TreasureGrab extends GameComponent {

    private map: Map;
    private player: Player;
    private playerControl: PlayerControl;

    protected OnInitialise(): void {
        this.map = new Map();

        this.player = new Player(this.map);
        this.player.SetPosition(0, 1);

        this.playerControl = new PlayerControl(0);

        this.root.addChild(this.map.background, this.player.root, this.map.foreground);

        this.game.ticker.add(this.OnUpdate, this);
    }

    private OnUpdate(dt: number): void {
        const direction = this.playerControl.Get();
        if(direction && direction !== "none") {
            this.player.Move(direction);
        }
    }
}
