import {Container} from "pixi.js";
import GameComponent from "../../_lib/game/GameComponent";
import {Vec2, Vec2Like} from "../../_lib/math/Geometry";
import ObjectPool from "../../_lib/patterns/ObjectPool";
import {GetInterval} from "../../_lib/utils/Time";
import {Camera} from "./components/Camera";
import Cat from "./components/Cat";
import Home from "./components/Home";
import Map from "./components/Map";
import Player from "./components/Player";
import PlayerControl from "./components/PlayerControl";
import Viking from "./components/Viking";
import {PLAYER_MOVED} from "./Events";

export class TreasureGrab extends GameComponent {

    private camera: Camera;
    private map: Map;
    private player: Player;
    private viking: Viking;
    private home: Home;
    private cats: ObjectPool<Cat>;
    private catLayer = new Container();
    private playerControl: PlayerControl;

    protected OnInitialise(): void {

        this.camera = new Camera();

        this.map = new Map();

        this.player = new Player(this.map, this.camera);
        this.player.SetPosition(1, 2);
        this.playerControl = new PlayerControl(0);

        this.viking = new Viking(this.map);
        this.viking.SetPosition(14, 2);
        this.viking.Think();

        this.home = new Home();

        this.cats = new ObjectPool<Cat>(6, () => new Cat(this.map));

        this.camera.root.addChild(this.map.background);
        this.camera.root.addChild(this.catLayer, this.viking.root, this.player.root, this.home.root);
        this.camera.root.addChild(this.map.foreground);
        this.game.ticker.add(this.OnUpdate, this);

        GetInterval(10000, this.DispatchCats, this);
        this.DispatchCats();

        this.game.dispatcher.on(PLAYER_MOVED, this.CheckCollisions, this);
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
}
