import {AnimatedSprite, Texture} from "pixi.js";
import Game from "@logic-incubator/lib/game/Game";
import AssetFactory from "@logic-incubator/lib/loading/AssetFactory";
import {Vec2, Vec2Like} from "@logic-incubator/lib/math/Geometry";
import { TileSize } from "../Constants";
import type {PlayerSetup} from "../DungeonMain";
import PlayerControl from "../input/PlayerControl";
import {AddGold, CreateGold, Gold} from "../level/entities/Gold";
import {CreateHealth, DamageHealth, Health, HealHealth, TickHealth} from "../level/entities/Health";
import {AddItem, CreateInventory, Inventory} from "../level/entities/Inventory";
import {AddKey, CanOpen, CreateKeyRing, KeyRing} from "../level/entities/Keys";
import {WeaponDef} from "../level/entities/Projectiles";
import Level, {CollectedPickup} from "../level/Level";
import TileCollision from "../level/TileCollision";
import {Camera} from "./Camera";
import {BoxCentre, CentreTile, ResolveMove} from "./helpers/PlayerMovement";

/**
 * The player: moving, shooting and taking hits. Driven one frame at a time by `DungeonMain`, which
 * `Reset`s it as each level starts and `Destroy`s it with the scene; `EntityRenderer` draws it.
 */
export class Player {
    private controls: PlayerControl;
    private player: AnimatedSprite;
    /** The animation `player` is drawn with. */
    private spriteName: string;
    private velocity = new Vec2();
    private newPosition = new Vec2();
    private facingX = 1;
    private health: Health;
    private gold: Gold;
    private inventory: Inventory;
    private keys: KeyRing;
    private weapons: WeaponDef[];
    private equippedIndex = 0;
    private fireCooldown = 0;
    private shot: Vec2Like | null = null;

    constructor(
        private camera: Camera,
        private collision: TileCollision,
        private level: Level,
        private setup: PlayerSetup
    ) {
        this.player = this.CreateSprite(setup.sprite);

        this.controls = new PlayerControl(0);
        this.health = CreateHealth(setup.hitPoints);
        this.gold = CreateGold();
        this.inventory = CreateInventory();
        this.keys = CreateKeyRing();
        this.weapons = setup.weapons;
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

    get Gold(): Gold {
        return this.gold;
    }

    get Inventory(): Inventory {
        return this.inventory;
    }

    /** The keys they're carrying - each opens the locked doors whose lock matches its id (see `Keys`). */
    get Keys(): KeyRing {
        return this.keys;
    }

    get EquippedWeapon(): WeaponDef {
        return this.weapons[this.equippedIndex];
    }

    /** Whether a door with this lock id opens for them: it's unlocked, or they carry its key. */
    HasKeyFor(lockId: number): boolean {
        return CanOpen(this.keys, lockId);
    }

    /** Whether the cell is a closed, locked door they've no key for - a wall to them, which their collider is given (see `DungeonMain`). */
    IsLockedOut(tileX: number, tileY: number): boolean {
        return this.level.IsDoorLocked(tileX, tileY, lock => this.HasKeyFor(lock));
    }

    /** Stops the player's animation, which would otherwise keep ticking on the shared ticker for good. */
    Destroy(): void {
        this.player.destroy();
    }

    /** Draws the player with another animation from now on - where they are is kept, and the one they already have is left alone. */
    SetSprite(name: string): void {
        if (name === this.spriteName) {
            return;
        }
        const previous = this.player;
        this.player = this.CreateSprite(name);
        this.player.position.copyFrom(previous.position);
        // Stops the old one, which would otherwise keep ticking on the shared ticker for good.
        previous.destroy();
    }

    /** Back to the start of a level: at its start position, with full health and nothing collected. Call on every `LEVEL_CREATED`. */
    Reset(playerStartPosition: Vec2Like | undefined) {
        if (!playerStartPosition) {
            throw new Error("Player start position is not defined. Define it in the level data.");
        }
        this.player.position.set(playerStartPosition.x * TileSize, playerStartPosition.y * TileSize);
        this.velocity.Set(0, 0);
        this.facingX = 1;
        this.health = CreateHealth(this.setup.hitPoints);
        this.gold = CreateGold();
        this.inventory = CreateInventory();
        this.keys = CreateKeyRing();
        this.equippedIndex = 0;
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
        this.level.UpdateDoors(tile.x, tile.y, lock => this.HasKeyFor(lock));
        this.level.UpdateVisibleRegions(tile.x, tile.y);
        this.level.CollectPickupsAt(tile.x, tile.y).forEach(value => this.ApplyPickup(value));
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

    private CreateSprite(name: string): AnimatedSprite {
        const sprite = AssetFactory.inst.CreateAnimatedSprite(name);
        sprite.play();
        sprite.animationSpeed = 0.1;
        this.spriteName = name;
        return sprite;
    }

    private GetInput(seconds: number): void {
        const input = this.controls.Get();
        const n = input.direction;
        if (n.x !== 0) {
            this.facingX = n.x < 0 ? -1 : 1;
        }
        this.velocity.Offset(n.x, n.y);

        this.fireCooldown = Math.max(0, this.fireCooldown - seconds);
        if (input.aimX !== 0) {
            // A gamepad's right stick can set facing independent of movement (Robotron style) - keyboard's
            // fire key has no direction of its own (aimX is always 0 there), so it just uses facing as-is.
            this.facingX = input.aimX < 0 ? -1 : 1;
        }
        if (input.firing && this.fireCooldown === 0) {
            // Tutankham style: always straight left or right, whichever the player currently faces -
            // never up/down, and never anywhere the player isn't already facing.
            this.shot = { x: this.facingX, y: 0 };
            this.fireCooldown = this.EquippedWeapon.shot.cooldown;
        }
    }

    /**
     * Gold adds to the count; health restores hit points, up to the maximum; a key joins the ones carried
     * (shown as the tile it was); a weapon is added to the loadout and equipped immediately; an item goes to
     * the first free inventory slot (dropped if it's full) - as its own sprite, or as the tile it was.
     */
    private ApplyPickup(pickup: CollectedPickup): void {
        const value = pickup.value;
        switch (value.kind) {
            case "gold":
                AddGold(this.gold, value.amount);
                break;
            case "health":
                HealHealth(this.health, value.amount);
                break;
            case "key":
                AddKey(this.keys, value.id, pickup.sprite);
                break;
            case "weapon":
                this.weapons.push(value.weapon);
                this.equippedIndex = this.weapons.length - 1;
                break;
            case "item": {
                const sprite = value.sprite || pickup.sprite;
                if (sprite) {
                    AddItem(this.inventory, sprite);
                }
                break;
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
        this.camera.UpdateZoom(Game.inst.ticker.deltaMS / 1000);

        this.camera.Follow(this.player.x, this.player.y, 0.05);
    }
}
