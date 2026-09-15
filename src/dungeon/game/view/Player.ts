
import * as PIXI from "pixi.js"
window["PIXI"] = PIXI
import "pixi-tilemap";

import {AnimatedSprite} from "pixi.js";
import GameComponent from "../../../_lib/game/GameComponent";
import AssetFactory from "../../../_lib/loading/AssetFactory";
import {Vec2, Vec2Like} from "../../../_lib/math/Geometry";
import {Scenes, TileSize} from "../../Constants";
import PlayerControl from "../input/PlayerControl";
import Level from "../level/Level";
import TileCollision from "../level/TileCollision";
import {Camera} from "./Camera";
import {ViewOrigin} from "./CameraWindow";
import {ResolveMove} from "./PlayerMovement";
import {SpriteDrawPosition} from "./SpriteDrawOffset";
import {TileGD8Rotation} from "./TileMap";

export class Player extends GameComponent {
    private controls: PlayerControl;
    private player: AnimatedSprite;
    private targetLayer: PIXI.tilemap.CompositeRectTileLayer | undefined;
    private velocity = new Vec2();
    private newPosition = new Vec2();
    private facingX = 1;

    constructor(
        private camera: Camera,
        private collision: TileCollision,
        private level: Level
    ) {
        super();

        this.player = AssetFactory.inst.CreateAnimatedSprite("wizzart_m_run_anim");
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
        this.MoveCamera();
        this.Render();
    }

    private GetInput(): void {
        const n = this.controls.Get().direction;
        if (n.x !== 0) {
            this.facingX = n.x < 0 ? -1 : 1;
        }
        this.velocity.Offset(n.x, n.y);
    }

    private Move(dt: number): void {
        this.newPosition.Copy(this.player.position);
        ResolveMove(this.newPosition, this.velocity, dt, this.collision);
        this.player.position.set(this.newPosition.x, this.newPosition.y);
    }

    private MoveCamera(): void {
        const half = (TileSize - 1) * 0.5;
        const z = this.level.HeightAt(
            ((this.player.x + half) / TileSize) | 0,
            ((this.player.y + half) / TileSize) | 0
        );
        this.camera.SetZ(z);
        this.camera.UpdateZoom(this.game.ticker.deltaMS / 1000);

        this.camera.Follow(this.player.x, this.player.y, 0.05);
    }

    private Render(): void {
        if(!this.targetLayer) return;

        // The player's own z band is scaled by camera.EffectiveZoom (see
        // TileMapView), so its window origin must be computed the exact same
        // way - not the raw ViewRect, which ignores that zoom and would drift
        // the sprite away from its tile the moment EffectiveZoom moves off 1.
        const cameraZoom = this.camera.EffectiveZoom;
        const origin = ViewOrigin(this.camera.ViewRect.center, this.camera.BaseViewWidth, this.camera.BaseViewHeight, cameraZoom);

        this.targetLayer.clear();
        const draw = SpriteDrawPosition(this.player.position, origin, this.player.texture);
        this.targetLayer.addFrame(this.player.texture, draw.x, draw.y);
        if (this.facingX < 0) {
            this.targetLayer.tileRotate(TileGD8Rotation(0, this.facingX, 1));
        }
    }
}
