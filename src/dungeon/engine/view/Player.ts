import {AnimatedSprite, Texture} from "pixi.js";
import GameComponent from "../../../_lib/game/GameComponent";
import AssetFactory from "../../../_lib/loading/AssetFactory";
import {Vec2, Vec2Like} from "../../../_lib/math/Geometry";
import {Scenes, TileSize} from "../../Constants";
import type {PlayerSetup} from "../DungeonMain";
import PlayerControl from "../input/PlayerControl";
import {CreateHealth, DamageHealth, Health, TickHealth} from "../level/entities/Health";
import Level from "../level/Level";
import TileCollision from "../level/TileCollision";
import {Camera} from "./Camera";
import {BoxCentre, CentreTile, ResolveMove} from "./helpers/PlayerMovement";

/** The player: moving, shooting and taking hits. Driven one frame at a time by `DungeonMain`; `EntityRenderer` draws it. */
export class Player extends GameComponent {
    private controls: PlayerControl;
    private player: AnimatedSprite;
    private velocity = new Vec2();
    private newPosition = new Vec2();
    private facingX = 1;
    private health: Health;
    private fireCooldown = 0;
    private shot: Vec2Like | null = null;

    constructor(
        private camera: Camera,
        private collision: TileCollision,
        private level: Level,
        private setup: PlayerSetup
    ) {
        super();

        this.player = AssetFactory.inst.CreateAnimatedSprite(setup.sprite);
        this.player.play();
        this.player.animationSpeed = 0.1;

        this.controls = new PlayerControl(0);
        this.health = CreateHealth(setup.hitPoints);

        this.AddToScene(Scenes.GAME);
    }

    /** Top-left of the player's one-tile collision box, in pixels. */
    get Position(): Vec2Like {
        return this.player.position;
    }

    get Centre(): Vec2Like {
        return BoxCentre(this.player.position);
    }

    /** The tile the player's centre currently sits over - shared by height lookup, door triggering and monsters' path finding. */
    get Tile(): Vec2Like {
        return CentreTile(this.player.position);
    }

    get Texture(): Texture {
        return this.player.texture;
    }

    get FacingX(): number {
        return this.facingX;
    }

    get Health(): Health {
        return this.health;
    }

    Init(playerStartPosition: Vec2Like | undefined) {
        if (!playerStartPosition) {
            throw new Error("Player start position is not defined. Define it in the level data.");
        }
        this.player.position.set(playerStartPosition.x * TileSize, playerStartPosition.y * TileSize);
        this.velocity.Set(0, 0);
        this.facingX = 1;
        this.health = CreateHealth(this.setup.hitPoints);
        this.fireCooldown = 0;
        this.shot = null;
    }

    /** One frame: `dt` in frames (the ticker's delta, which movement is tuned to), `seconds` of real time for timers. */
    Update(dt: number, seconds: number): void {
        TickHealth(this.health, seconds);
        this.GetInput(seconds);
        this.Move(dt);
        const tile = this.Tile;
        this.MoveCamera(tile);
        this.level.UpdateDoors(tile.x, tile.y);
        this.level.UpdateVisibleRegions(tile.x, tile.y);
    }

    /** The direction of a shot fired this frame, handed over once - null if none was. */
    TakeShot(): Vec2Like | null {
        const shot = this.shot;
        this.shot = null;
        return shot;
    }

    /** Returns whether the hit landed - not while invulnerable from the last one, or already dead. */
    Damage(damage: number): boolean {
        return DamageHealth(this.health, damage);
    }

    private GetInput(seconds: number): void {
        const input = this.controls.Get();
        const n = input.direction;
        if (n.x !== 0) {
            this.facingX = n.x < 0 ? -1 : 1;
        }
        this.velocity.Offset(n.x, n.y);

        this.fireCooldown = Math.max(0, this.fireCooldown - seconds);
        const fire = input.fire;
        if (!fire.IsZero()) {
            // Face the way you shoot - Robotron style, moving one way while firing another.
            if (fire.x !== 0) {
                this.facingX = fire.x < 0 ? -1 : 1;
            }
            if (this.fireCooldown === 0) {
                this.shot = { x: fire.x, y: fire.y };
                this.fireCooldown = this.setup.shot.cooldown;
            }
        }
    }

    private Move(dt: number): void {
        this.newPosition.Copy(this.player.position);
        ResolveMove(this.newPosition, this.velocity, dt, this.collision);
        this.player.position.set(this.newPosition.x, this.newPosition.y);
    }

    private MoveCamera(tile: Vec2Like): void {
        const z = this.level.HeightAt(tile.x, tile.y);
        this.camera.SetZ(z);
        this.camera.UpdateZoom(this.game.ticker.deltaMS / 1000);

        this.camera.Follow(this.player.x, this.player.y, 0.05);
    }
}
