import {Container} from "pixi.js";
import GameComponent from "../../_lib/game/GameComponent";
import {Vec2} from "../../_lib/math/Geometry";
import ObjectPool from "../../_lib/patterns/ObjectPool";
import {GetInterval} from "../../_lib/game/Timing";
import {Camera} from "./components/Camera";
import Cat from "./components/Cat";
import HomePlayer from "./components/HomePlayer";
import HomeViking from "./components/HomeViking";
import Map from "./components/Map";
import Player from "./components/Player";
import PlayerControl from "./components/PlayerControl";
import Viking from "./components/Viking";
import {PLAYER_MOVED, VIKING_MOVED, SPRING_DROPPED} from "./Events";
import { Springs } from "./components/Springs";

export class CatGrabMain extends GameComponent {

    private camera: Camera;
    private map: Map;
    private player: Player;
    private playerControl: PlayerControl;
    private playerHome: HomePlayer;
    private viking: Viking;
    private vikingHome: HomeViking;
    private cats: ObjectPool<Cat>;
    private catLayer = new Container();
    private springs: Springs;

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

        this.springs = new Springs();

        this.camera.root.addChild(this.map.background, this.springs.root);
        this.camera.root.addChild(this.catLayer, this.viking.root, this.player.root, this.playerHome.root, this.vikingHome.root);
        this.camera.root.addChild(this.map.foreground);
        this.game.ticker.add(this.OnUpdate, this);

        GetInterval(5000, this.DispatchCats, this);
        this.DispatchCats();

        this.game.dispatcher.on(PLAYER_MOVED, this.CheckCollisions, this);
        this.game.dispatcher.on(VIKING_MOVED, this.CheckCollisions, this);
        this.game.dispatcher.on(SPRING_DROPPED, this.DropSpring, this);
    }

    private OnUpdate(): void {
        const input = this.playerControl.Get();
        if(input && input.length) {
            input.forEach(i => i === "fire" ? this.player.DropSpring() : this.player.Move(i));
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

    private DropSpring(position: Vec2): void {
        this.springs.Drop(position);
    }
}
