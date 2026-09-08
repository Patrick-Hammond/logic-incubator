
import * as PIXI from "pixi.js"
window["PIXI"] = PIXI
import "pixi-tilemap";

import {AnimatedSprite} from "pixi.js";
import GameComponent from "../../../_lib/game/GameComponent";
import AssetFactory from "../../../_lib/loading/AssetFactory";
import {Vec2, Vec2Like} from "../../../_lib/math/Geometry";
import {Scenes, TileSize} from "../../Constants";
import PlayerControl from "../input/PlayerControl";
import TileCollision from "../level/TileCollision";
import {Camera} from "./Camera";
import {ResolveMove} from "./PlayerMovement";

export class Player extends GameComponent {
    private controls: PlayerControl;
    private player: AnimatedSprite;
    private targetLayer: PIXI.tilemap.CompositeRectTileLayer;
    private velocity = new Vec2();
    private newPosition = new Vec2();

    constructor(
        private camera: Camera,
        private collision: TileCollision
    ) {
        super();

        this.player = AssetFactory.inst.CreateAnimatedSprite("chest_full_open_anim");
        this.player.play();
        this.player.animationSpeed = 0.1;

        this.controls = new PlayerControl(0);

        this.game.ticker.add(this.OnUpdate, this);

        this.AddToScene(Scenes.GAME);
    }

    Init(playerStartPosition: Vec2Like) {
        this.player.position.set(playerStartPosition.x * TileSize, playerStartPosition.y * TileSize);
        this.targetLayer = this.camera.root.getChildByName("player") as PIXI.tilemap.CompositeRectTileLayer;
    }

    private OnUpdate(dt: number): void {
        this.GetInput();

        this.Move(dt);

        this.camera.Follow(this.player.x, this.player.y, 0.05);

        this.Render();
    }

    private GetInput(): void {
        const n = this.controls.Get().direction;
        this.velocity.Offset(n.x, n.y);
    }

    private Move(dt: number): void {
        this.newPosition.Copy(this.player.position);
        ResolveMove(this.newPosition, this.velocity, dt, this.collision);
        this.player.position.set(this.newPosition.x, this.newPosition.y);
    }

    private Render(): void {
        this.targetLayer.clear();
        this.targetLayer.addFrame(
            this.player.texture,
            this.player.x - this.camera.ViewRect.x * TileSize,
            this.player.y - this.camera.ViewRect.y * TileSize
        );
    }
}
