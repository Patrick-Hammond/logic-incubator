import {AnimatedSprite, Texture} from "pixi.js";
import Game from "@logic-incubator/lib/game/Game";
import AssetFactory from "@logic-incubator/lib/loading/AssetFactory";
import {Vec2, Vec2Like} from "@logic-incubator/lib/math/Geometry";
import { TileSize } from "../Constants";
import type {PlayerSetup} from "../DungeonMain";
import PlayerControl from "../input/PlayerControl";
import {CarriedLight, CarriedLightScale, CreateCarriedLight, TickCarriedLight} from "../level/entities/CarriedLight";
import {AddGold, CreateGold, Gold} from "../level/entities/Gold";
import {CreateHealth, DamageHealth, Health, HealHealth, TickHealth} from "../level/entities/Health";
import {AddItem, CreateInventory, Inventory} from "../level/entities/Inventory";
import {AddKey, CanOpen, CreateKeyRing, KeyRing} from "../level/entities/Keys";
import {CastLightSpell, CreateLightSpellState, LightSpell, LightSpellScale, LightSpellState, TickLightSpell} from "../level/entities/LightSpell";
import {WeaponDef} from "../level/entities/Projectiles";
import Level, {CollectedPickup} from "../level/Level";
import {MovingLight} from "../level/SceneLights";
import TileCollision from "../level/TileCollision";
import {Camera} from "./Camera";
import {BoxCentre, CentreTile, ResolveMove} from "./helpers/PlayerMovement";

/** How far behind the player (away from where they face) their mage-light floats, in tiles. */
const OrbSide = 0.45;
/** How high over the floor their mage-light floats, in tiles - about their shoulder. */
const OrbHeight = 1;
/** How far their mage-light bobs up and down, in tiles, and how fast, in radians a second. */
const OrbBob = 0.06;
const OrbBobRate = 2.4;
/** Share of the way their mage-light drifts to its place behind them each frame - it trails them rather than being stuck to them. */
const OrbFollow = 0.12;

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
    /** The torch they're carrying, if they've picked one up and it hasn't burnt out. */
    private carried: CarriedLight | null = null;
    /** What `Light` hands out, refilled each time rather than made anew every frame. */
    private light: MovingLight = { x: 0, y: 0, value: { brightness: 0, tint: 0, range: 0 }, key: this, scale: 1 };
    /** The light spell they get at the next `Reset` - see `SetLightSpell`. */
    private lightSpell: LightSpell | undefined;
    /** Their light spell in play - null for a hero without one. */
    private spell: LightSpellState | null = null;
    /** The floor under their mage-light, in world pixels. */
    private orb = new Vec2();
    /** Seconds their mage-light has been lit, which it bobs by. */
    private orbTime = 0;
    /** What `SpellLight` and `OrbPosition` hand out, refilled each time. Its key is itself, so it stays the same light frame to frame. */
    private spellLight: MovingLight = { x: 0, y: 0, value: { brightness: 0, tint: 0, range: 0 }, scale: 1 };
    private orbPosition = { x: 0, y: 0 };

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
        this.lightSpell = setup.lightSpell;
        this.spellLight.key = this.spellLight;
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

    /** The light they carry, where they are now (see `Level.UpdateLights`) - null without one. */
    get Light(): MovingLight | null {
        if (!this.carried) {
            return null;
        }
        const centre = this.Centre;
        this.light.x = centre.x / TileSize;
        this.light.y = centre.y / TileSize;
        this.light.value = this.carried.value;
        this.light.scale = CarriedLightScale(this.carried);
        return this.light;
    }

    /** Their mage-light while it's lit, over the floor where it floats (see `Level.UpdateLights`) - null otherwise. */
    get SpellLight(): MovingLight | null {
        if (!this.spell || !this.spell.lit) {
            return null;
        }
        this.spellLight.x = this.orb.x / TileSize;
        this.spellLight.y = this.orb.y / TileSize;
        this.spellLight.value = this.spell.lit.value;
        this.spellLight.scale = LightSpellScale(this.spell);
        return this.spellLight;
    }

    /** Where their mage-light is drawn while it's lit, in world pixels: floating, and bobbing, over the floor it lights. Null otherwise. */
    get OrbPosition(): Vec2Like | null {
        if (!this.spell || !this.spell.lit) {
            return null;
        }
        this.orbPosition.x = this.orb.x;
        this.orbPosition.y = this.orb.y - (OrbHeight + Math.sin(this.orbTime * OrbBobRate) * OrbBob) * TileSize;
        return this.orbPosition;
    }

    /** Their light spell: lit, recharging or ready - null for a hero without one. */
    get Spell(): LightSpellState | null {
        return this.spell;
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

    /** Gives them this light spell from the next `Reset` on - none for null or undefined. */
    SetLightSpell(spell: LightSpell | null | undefined): void {
        this.lightSpell = spell || undefined;
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
        this.carried = null;
        this.spell = this.lightSpell ? CreateLightSpellState(this.lightSpell) : null;
    }

    /** One frame: `dt` in frames (the ticker's delta, which movement is tuned to), `seconds` of real time for timers. */
    Update(dt: number, seconds: number): void {
        TickHealth(this.health, seconds);
        if (this.carried && !TickCarriedLight(this.carried, seconds)) {
            this.carried = null;
        }
        if (this.spell) {
            TickLightSpell(this.spell, seconds);
        }
        this.GetInput(seconds);
        this.Move(dt);
        this.MoveOrb(dt, seconds);
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
        if (input.casting && this.spell && CastLightSpell(this.spell)) {
            // It appears in its place behind them, then drifts after them from there.
            this.orb.Copy(this.OrbTarget());
            this.orbTime = 0;
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
     * the first free inventory slot (dropped if it's full) - as its own sprite, or as the tile it was; a light
     * is carried from then on, in place of any they had.
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
            case "light":
                this.carried = CreateCarriedLight(value.light, value.seconds);
                break;
        }
    }

    private Move(dt: number): void {
        this.newPosition.Copy(this.player.position);
        ResolveMove(this.newPosition, this.velocity, dt, this.collision);
        this.player.position.set(this.newPosition.x, this.newPosition.y);
    }

    /** Where their mage-light floats over: just behind them, away from where they face. */
    private OrbTarget(): Vec2Like {
        const centre = this.Centre;
        return { x: centre.x - this.facingX * OrbSide * TileSize, y: centre.y };
    }

    /** Lets their mage-light, while it's lit, drift after them and bob. */
    private MoveOrb(dt: number, seconds: number): void {
        if (!this.spell || !this.spell.lit) {
            return;
        }
        const target = this.OrbTarget();
        const follow = Math.min(1, OrbFollow * dt);
        this.orb.Set(this.orb.x + (target.x - this.orb.x) * follow, this.orb.y + (target.y - this.orb.y) * follow);
        this.orbTime += seconds;
    }

    private MoveCamera(tile: Vec2Like): void {
        const z = this.level.HeightAt(tile.x, tile.y);
        this.camera.SetZ(z);
        this.camera.UpdateZoom(Game.inst.ticker.deltaMS / 1000);

        this.camera.Follow(this.player.x, this.player.y, 0.05);
    }
}
