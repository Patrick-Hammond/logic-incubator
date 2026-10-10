import {AnimatedSprite, Texture} from "pixi.js";
import AssetFactory from "@logic-incubator/lib/loading/AssetFactory";
import {Vec2, Vec2Like} from "@logic-incubator/lib/math/Geometry";
import { TileSize } from "../Constants";
import type {PlayerSetup} from "../DungeonMain";
import type {EncounterPlayer} from "../Encounter";
import {Between} from "../FixedStep";
import {IPlayerInput} from "../input/PlayerControl";
import {CarriedLightScale} from "../level/entities/CarriedLight";
import {Gold} from "../level/entities/Gold";
import {Health} from "../level/entities/Health";
import {Inventory} from "../level/entities/Inventory";
import {CanOpen, KeyRing} from "../level/entities/Keys";
import {LightSpell, LightSpellScale, LightSpellState} from "../level/entities/LightSpell";
import {ApplyPickup, CreatePlayerState, DamagePlayer, EquippedWeapon, PlayerState, StepPlayer, TakePlayerShot} from "../level/entities/PlayerState";
import {WeaponDef} from "../level/entities/Projectiles";
import Level, {CollectedPickup} from "../level/Level";
import {MovingLight} from "../level/SceneLights";
import TileCollision from "../level/TileCollision";
import {BoxCentre, CentreTile} from "./helpers/PlayerMovement";

/** How high over the floor their mage-light floats, in tiles - about their shoulder. */
const OrbHeight = 1;
/** How far their mage-light bobs up and down, in tiles, and how fast, in radians a second. */
const OrbBob = 0.06;
const OrbBobRate = 2.4;

/**
 * The player: their state (see `PlayerState`), stepped by `DungeonMain` with the input it hands in, and
 * how they look - where to draw them between steps, and the lights they carry. `DungeonMain` `Reset`s it
 * as each level starts and `Destroy`s it with the scene; `EntityRenderer` draws it.
 */
export class Player implements EncounterPlayer {
    private sprite: AnimatedSprite;
    /** The animation `sprite` is drawn with. */
    private spriteName: string;
    private state: PlayerState;
    /** The light spell they get at the next `Reset` - see `SetLightSpell`. */
    private lightSpell: LightSpell | undefined;
    /** Where they're drawn this frame, and their mage-light's floor - see `Place`. */
    private drawPosition = new Vec2();
    private drawOrb = new Vec2();
    /** What `Light` hands out, refilled each time rather than made anew every frame. */
    private light: MovingLight = { x: 0, y: 0, value: { brightness: 0, tint: 0, range: 0 }, key: this, scale: 1 };
    /** What `SpellLight` and `OrbPosition` hand out, refilled each time. Its key is itself, so it stays the same light frame to frame. */
    private spellLight: MovingLight = { x: 0, y: 0, value: { brightness: 0, tint: 0, range: 0 }, scale: 1 };
    private orbPosition = { x: 0, y: 0 };

    constructor(
        private collision: TileCollision,
        private level: Level,
        private setup: PlayerSetup
    ) {
        this.sprite = this.CreateSprite(setup.sprite);
        this.lightSpell = setup.lightSpell;
        this.state = CreatePlayerState(setup, { x: 0, y: 0 }, this.lightSpell);
        this.spellLight.key = this.spellLight;
    }

    /** Top-left of the player's one-tile collision box, in pixels, as of their last step. */
    get Position(): Vec2Like {
        return this.state.position;
    }

    get Centre(): Vec2Like {
        return BoxCentre(this.state.position);
    }

    /** The tile the player's centre currently sits over - shared by height lookup, door triggering and monsters' path finding. */
    get Tile(): Vec2Like {
        return CentreTile(this.state.position);
    }

    /** Where to draw them this frame: the top-left of their box, between their last two steps (see `Place`). */
    get DrawPosition(): Vec2Like {
        return this.drawPosition;
    }

    get Texture(): Texture {
        return this.sprite.texture;
    }

    get FacingX(): number {
        return this.state.facingX;
    }

    get Health(): Health {
        return this.state.health;
    }

    get Gold(): Gold {
        return this.state.gold;
    }

    get Inventory(): Inventory {
        return this.state.inventory;
    }

    /** The keys they're carrying - each opens the locked doors whose lock matches its id (see `Keys`). */
    get Keys(): KeyRing {
        return this.state.keys;
    }

    get EquippedWeapon(): WeaponDef {
        return EquippedWeapon(this.state);
    }

    /** The light they carry, where they're drawn (see `Level.UpdateLights`) - null without one. */
    get Light(): MovingLight | null {
        const carried = this.state.carried;
        if (!carried) {
            return null;
        }
        const centre = BoxCentre(this.drawPosition);
        this.light.x = centre.x / TileSize;
        this.light.y = centre.y / TileSize;
        this.light.value = carried.value;
        this.light.scale = CarriedLightScale(carried);
        return this.light;
    }

    /** Their mage-light while it's lit, over the floor where it floats (see `Level.UpdateLights`) - null otherwise. */
    get SpellLight(): MovingLight | null {
        const spell = this.state.spell;
        if (!spell || !spell.lit) {
            return null;
        }
        this.spellLight.x = this.drawOrb.x / TileSize;
        this.spellLight.y = this.drawOrb.y / TileSize;
        this.spellLight.value = spell.lit.value;
        this.spellLight.scale = LightSpellScale(spell);
        return this.spellLight;
    }

    /** Where their mage-light is drawn while it's lit, in world pixels: floating, and bobbing, over the floor it lights. Null otherwise. */
    get OrbPosition(): Vec2Like | null {
        const spell = this.state.spell;
        if (!spell || !spell.lit) {
            return null;
        }
        this.orbPosition.x = this.drawOrb.x;
        this.orbPosition.y = this.drawOrb.y - (OrbHeight + Math.sin(this.state.orbTime * OrbBobRate) * OrbBob) * TileSize;
        return this.orbPosition;
    }

    /** Their light spell: lit, recharging or ready - null for a hero without one. */
    get Spell(): LightSpellState | null {
        return this.state.spell;
    }

    /** Whether a door with this lock id opens for them: it's unlocked, or they carry its key. */
    HasKeyFor(lockId: number): boolean {
        return CanOpen(this.state.keys, lockId);
    }

    /** Whether the cell is a closed, locked door they've no key for - a wall to them, which their collider is given (see `DungeonMain`). */
    IsLockedOut(tileX: number, tileY: number): boolean {
        return this.level.IsDoorLocked(tileX, tileY, lock => this.HasKeyFor(lock));
    }

    /** Stops the player's animation, which would otherwise keep ticking on the shared ticker for good. */
    Destroy(): void {
        this.sprite.destroy();
    }

    /** Draws the player with another animation from now on - the one they already have is left alone. */
    SetSprite(name: string): void {
        if (name === this.spriteName) {
            return;
        }
        const previous = this.sprite;
        this.sprite = this.CreateSprite(name);
        // Stops the old one, which would otherwise keep ticking on the shared ticker for good.
        previous.destroy();
    }

    /** Gives them this light spell from the next `Reset` on - none for null or undefined. */
    SetLightSpell(spell: LightSpell | null | undefined): void {
        this.lightSpell = spell || undefined;
    }

    /** Back to the start of a level: at its start position, with full health, the setup's weapons and nothing collected. Call on every `LEVEL_CREATED`. */
    Reset(playerStartPosition: Vec2Like | undefined) {
        if (!playerStartPosition) {
            throw new Error("Player start position is not defined. Define it in the level data.");
        }
        this.state = CreatePlayerState(this.setup, playerStartPosition, this.lightSpell);
        this.Place(1);
    }

    /** One step of play with this input: `dt` in frames (which movement is tuned to - 1 at 60 a second), `seconds` for timers. */
    Step(input: IPlayerInput, dt: number, seconds: number): void {
        StepPlayer(this.state, input, dt, seconds, this.collision);
    }

    /** Places them for drawing `alpha` (0 to 1) of the way from where their last step started to where it ended. Call each frame after the steps, before anything reads where they're drawn. */
    Place(alpha: number): void {
        Between(this.state.previous, this.state.position, alpha, this.drawPosition);
        Between(this.state.previousOrb, this.state.orb, alpha, this.drawOrb);
    }

    /** See `ApplyPickup` in PlayerState. */
    ApplyPickup(pickup: CollectedPickup): void {
        ApplyPickup(this.state, pickup);
    }

    /** The direction of a shot fired in the last step, handed over once - null if none was. */
    TakeShot(): Vec2Like | null {
        return TakePlayerShot(this.state);
    }

    /** Returns whether the hit landed - not while invulnerable from the last one, or already dead. */
    Damage(damage: number): boolean {
        return DamagePlayer(this.state, damage);
    }

    private CreateSprite(name: string): AnimatedSprite {
        const sprite = AssetFactory.inst.CreateAnimatedSprite(name);
        sprite.play();
        sprite.animationSpeed = 0.1;
        this.spriteName = name;
        return sprite;
    }
}
