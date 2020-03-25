import CompositeRectTileLayer from "../../../_extern/pixi-tilemap/CompositeRectTileLayer";
import GameComponent from "../../../_lib/game/GameComponent";
import AssetFactory from "../../../_lib/loading/AssetFactory";
import {Vec2, Vec2Like} from "../../../_lib/math/Geometry";
import {UpperLimit} from "../../../_lib/math/Utils";
import {PlayerSpeed, Scenes, TileSize} from "../../Constants";
import PlayerControl from "../input/PlayerControl";
import TileCollision from "../level/TileCollision";
import {Camera} from "./Camera";

export class Player extends GameComponent {
    private controls: PlayerControl;
    private player: PIXI.extras.AnimatedSprite;
    private targetLayer: CompositeRectTileLayer;
    private velocity = new Vec2();
    private newPosition = new Vec2();
    private delta = new Vec2();

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
        this.targetLayer = this.camera.root.getChildByName("player") as CompositeRectTileLayer;
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
        this.delta.Set(
            UpperLimit(this.velocity.x * dt * PlayerSpeed, TileSize - 1),
            UpperLimit(this.velocity.y * dt * PlayerSpeed, TileSize - 1)
        );
        this.newPosition.Set(this.player.x + this.delta.x, this.player.y + this.delta.y);

        if (this.player.x !== this.newPosition.x) {
            const collision = this.collision.TestX(this.player.position, this.delta.x);
            if (collision != null) {
                this.velocity.x = 0;
                this.newPosition.x = collision;
            }
        }

        if (this.player.y !== this.newPosition.y) {
            const collision = this.collision.TestY(this.player.position, this.delta.y);
            if (collision != null) {
                this.velocity.y = 0;
                this.newPosition.y = collision;
            }
        }

        this.player.position.set(this.newPosition.x, this.newPosition.y);

        this.velocity.x *= 0.8 * dt;
        this.velocity.y *= 0.8 * dt;
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
