import {Container} from "pixi.js";
import GameComponent from "../../_lib/game/GameComponent";
import {Vec2} from "../../_lib/math/Geometry";
import ObjectPool from "../../_lib/patterns/ObjectPool";
import {GetInterval} from "../../_lib/utils/Time";
import {RGB} from "../../_lib/utils/Types";
import {Camera} from "./components/Camera";
import Cat from "./components/Cat";
import HomePlayer from "./components/HomePlayer";
import HomeViking from "./components/HomeViking";
import Map from "./components/Map";
import Player from "./components/Player";
import PlayerControl from "./components/PlayerControl";
import Viking from "./components/Viking";
import {CAT_HOME_PLAYER, CAT_HOME_VIKING, PLAYER_MOVED, VIKING_MOVED} from "./Events";

export class TreasureGrab extends GameComponent {

    private camera: Camera;
    private map: Map;
    private player: Player;
    private playerControl: PlayerControl;
    private playerHome: HomePlayer;
    private viking: Viking;
    private vikingHome: HomeViking;
    private cats: ObjectPool<Cat>;
    private catLayer = new Container();

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

        this.cats = new ObjectPool<Cat>(6, () => new Cat(this.map));

        this.camera.root.addChild(this.map.background);
        this.camera.root.addChild(this.catLayer, this.viking.root, this.player.root, this.playerHome.root, this.vikingHome.root);
        this.camera.root.addChild(this.map.foreground);
        this.game.ticker.add(this.OnUpdate, this);

        GetInterval(5000, this.DispatchCats, this);
        this.DispatchCats();

        this.game.dispatcher.on(PLAYER_MOVED, this.CheckCollisions, this);
        this.game.dispatcher.on(VIKING_MOVED, this.CheckCollisions, this);
        this.game.dispatcher.addListener(CAT_HOME_PLAYER, this.OnCatHome, this);
        this.game.dispatcher.addListener(CAT_HOME_VIKING, this.OnCatHome, this);
    }

    private OnUpdate(dt: number): void {
        const direction = this.playerControl.Get();
        if(direction && direction !== "none") {
            this.player.Move(direction);
        }
    }

    private DispatchCats(): void {
        if(this.cats.Popped.length < 6) {
            const cat = this.cats.Get();
            cat.Create(this.catLayer);
            this.camera.root.addChild(cat.root);
        }
    }

    private CheckCollisions(position: Vec2): void {
        this.cats.Popped.forEach(cat => {
            if(cat.CheckCollision(position)) {
                cat.Follow(position);
            }
        })
    }

    private OnCatHome(colour: RGB, cat: Cat): void {
        // this.cats.Put(cat);
    }
}
