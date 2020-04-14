import GameComponent from "../../_lib/game/GameComponent";
import Camera from "./components/Camera";
import HomePlayer from "./components/player/HomePlayer";
import HomeViking from "./components/viking/HomeViking";
import Map from "./components/Map";
import Player from "./components/player/Player";
import Viking from "./components/viking/Viking";
import Collisions from "./components/Collisions";
import Cats from "./components/cat/Cats";
import {PlayerHomeLocation, VikingHomeLocation} from "../Constants";
import ScoreKeeper from "./components/ScoreKeeper";

export default class CatGrabMain extends GameComponent {

    private camera: Camera;
    private map: Map;
    private player: Player;
    private playerHome: HomePlayer;
    private viking: Viking;
    private vikingHome: HomeViking;

    protected OnInitialise(): void {

        this.camera = new Camera();

        this.map = new Map();

        this.player = new Player(this.map, this.camera);
        this.player.Start(PlayerHomeLocation);

        this.playerHome = new HomePlayer();

        this.viking = new Viking(this.map);
        this.viking.Start(VikingHomeLocation);

        this.vikingHome = new HomeViking();

        const cats = new Cats(this.map);
        cats.Start();

        new Collisions(this.player, this.viking, cats);

        new ScoreKeeper();

        this.camera.root.addChild(
            this.map.background,
            this.player.Springs.root, this.viking.Springs.root,
            cats.root, this.viking.root, this.player.root,
            this.playerHome.root, this.vikingHome.root,
            this.map.foreground
            );
    }
}
