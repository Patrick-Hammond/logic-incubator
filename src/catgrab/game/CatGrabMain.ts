import GameComponent from "../../_lib/game/GameComponent";
import Camera from "./components/Camera";
import HomePlayer from "./components/player/HomePlayer";
import HomeViking from "./components/viking/HomeViking";
import Map from "./components/Map";
import Player from "./components/player/Player";
import Viking from "./components/viking/Viking";
import Collisions from "./components/Collisions";
import Cats from "./components/cat/Cats";
import {PlayerHomeLocation, VikingHomeLocation, Scenes} from "../Constants";
import ScoreKeeper from "./components/ScoreKeeper";
import { TITLE_SCREEN_CLOSED } from "./Events";

export default class CatGrabMain extends GameComponent {

    private camera: Camera;
    private map: Map;
    private player: Player;
    private playerHome: HomePlayer;
    private viking: Viking;
    private vikingHome: HomeViking;
    private cats: Cats;

    constructor() {
        super();
        this.game.dispatcher.once(TITLE_SCREEN_CLOSED, this.Start, this);
    }

    protected OnInitialise(): void {

        this.camera = new Camera();

        this.map = new Map();

        this.player = new Player(this.map, this.camera);
        this.playerHome = new HomePlayer();

        this.viking = new Viking(this.map);
        this.vikingHome = new HomeViking();

        this.cats = new Cats(this.map);

        new Collisions(this.player, this.viking, this.cats);

        new ScoreKeeper();

        this.camera.root.addChild(
            this.map.background,
            this.player.Springs.root, this.viking.Springs.root,
            this.cats.root, this.viking.root, this.player.root,
            this.playerHome.root, this.vikingHome.root,
            this.map.foreground
            );
    }

    private Start(): void {

        this.game.sceneManager.ShowScene(Scenes.GAME);

        this.player.Start(PlayerHomeLocation);
        this.viking.Start(VikingHomeLocation);
        this.cats.Start();
    }
}
