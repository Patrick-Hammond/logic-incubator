import GameComponent from "../../_lib/game/GameComponent";
import {Camera} from "./components/Camera";
import HomePlayer from "./components/HomePlayer";
import HomeViking from "./components/HomeViking";
import Map from "./components/Map";
import Player from "./components/Player";
import PlayerControl from "./components/PlayerControl";
import Viking from "./components/Viking";
import { Collisions } from "./components/Collisions";
import { Cats } from "./components/Cats";

export class CatGrabMain extends GameComponent {

    private camera: Camera;
    private map: Map;
    private player: Player;
    private playerControl: PlayerControl;
    private playerHome: HomePlayer;
    private viking: Viking;
    private vikingHome: HomeViking;

    protected OnInitialise(): void {

        this.camera = new Camera();

        this.map = new Map();

        this.player = new Player(this.map, this.camera);
        this.player.SetPosition(1, 2);
        this.playerControl = new PlayerControl(0);

        this.playerHome = new HomePlayer();

        this.viking = new Viking(this.map);
        this.viking.SetPosition(14, 2);
        this.viking.Patrol();

        this.vikingHome = new HomeViking();

        const cats = new Cats(this.map);

        new Collisions(this.player, cats);

        this.camera.root.addChild(this.map.background, this.player.Springs.root);
        this.camera.root.addChild(cats.root, this.viking.root, this.player.root, this.playerHome.root, this.vikingHome.root);
        this.camera.root.addChild(this.map.foreground);

        this.game.ticker.add(this.OnUpdate, this);

        cats.Start();
    }

    private OnUpdate(): void {
        const input = this.playerControl.Get();
        if(input && input.length) {
            input.forEach(i => i === "fire" ? this.player.DropSpring() : this.player.Move(i));
        }
    }
}
