import GameComponent from "../../_lib/game/GameComponent";
import {Camera} from "./components/Camera";
import HomePlayer from "./components/HomePlayer";
import HomeViking from "./components/HomeViking";
import Map from "./components/Map";
import Player from "./components/Player";
import Viking from "./components/Viking";
import { Collisions } from "./components/Collisions";
import { Cats } from "./components/Cats";
import {PlayerHomeLocation, VikingHomeLocation} from "../Constants";

export class CatGrabMain extends GameComponent {

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

        this.camera.root.addChild(
            this.map.background,
            this.player.Springs.root, this.viking.Springs.root,
            cats.root, this.viking.root, this.player.root,
            this.playerHome.root, this.vikingHome.root,
            this.map.foreground
            );
    }
}
