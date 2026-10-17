/**
 * One hero in play: their state (see `PlayerState`) and what can happen to it -
 * a step with the input they're given, pickups, shots, hits, and the keys they
 * drop when they fall. `World` owns the heroes; `HeroView` draws one. Pure - no
 * pixi - so it runs under the plain node test runner.
 */

import { RectangleLike, Vec2Like } from "@logic-incubator/lib/math/Geometry";
import { TileSize } from "../Constants";
import type { PlayerSetup } from "../DungeonMain";
import type { EncounterPlayer } from "../Encounter";
import type { IPlayerInput } from "../input/PlayerControl";
import type { CollectedPickup } from "../level/Level";
import { Gold } from "../level/entities/Gold";
import { Health, IsDead } from "../level/entities/Health";
import { Inventory } from "../level/entities/Inventory";
import { CanOpen, HeldKey, KeyRing } from "../level/entities/Keys";
import { LightSpell, LightSpellState } from "../level/entities/LightSpell";
import { ApplyPickup, CreatePlayerState, DamagePlayer, EquippedWeapon, PlayerState, StepPlayer, TakePlayerShot } from "../level/entities/PlayerState";
import { FigureBox, SpriteSize, WeaponDef } from "../level/entities/Projectiles";
import { BoxCentre, CentreTile, MoveCollider } from "../view/helpers/PlayerMovement";

export default class Hero implements EncounterPlayer {
    private state: PlayerState;
    /** Whether their player has left an online game - see `Leave`. */
    private gone = false;
    /** Whether their player's connection to an online game has gone, for now - see `SetAway`. */
    private away = false;
    /** How big their sprite's frames are, and where its art is in them - see `SetFigure`. */
    private figure: SpriteSize = { width: TileSize, height: TileSize };

    /** `Index` is their slot, from 0; `setup` is what every hero starts a level with. */
    constructor(readonly Index: number, private setup: Pick<PlayerSetup, "hitPoints" | "weapons">) {
        this.state = CreatePlayerState(setup, { x: 0, y: 0 });
    }

    /** Everything about them, for drawing - change it through the hero, not here. */
    get State(): Readonly<PlayerState> {
        return this.state;
    }

    get Alive(): boolean {
        return !IsDead(this.state.health);
    }

    /** Whether their player has left the online game they were in (see `Leave`) - out of play, and not drawn. */
    get Gone(): boolean {
        return this.gone;
    }

    /**
     * Whether their player's connection to an online game has gone, for now (see `SetAway`): they stand where they
     * were, out of play - no monster goes for them, nothing hits them - until their player is back.
     */
    get Away(): boolean {
        return this.away;
    }

    /**
     * Their state, to change in place - for an online guest, whose heroes move as the host's snapshots say (see
     * `GuestSession`) rather than by steps of their own. Everything else goes through the hero.
     */
    get Writable(): PlayerState {
        return this.state;
    }

    /** Top-left of their one-tile collision box, in pixels, as of their last step. */
    get Position(): Vec2Like {
        return this.state.position;
    }

    get Centre(): Vec2Like {
        return BoxCentre(this.state.position);
    }

    /** The tile their centre sits over - what opens doors, collects pickups and draws the monsters. */
    get Tile(): Vec2Like {
        return CentreTile(this.state.position);
    }

    /**
     * What their sprite draws, in pixels, as of their last step (see `FigureBox`): their frame (see `SetFigure`) placed
     * as `SpriteDrawPosition` places it - feet on the bottom of their box, centred across it - less what's see-through
     * round its art. Any pickup it overlaps is theirs (see `World.Step`).
     */
    get Figure(): RectangleLike {
        return FigureBox(this.state.position, this.figure, TileSize);
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

    /** The keys they carry. Any hero's key opens its doors for the whole team (see `World.TeamCanOpen`). */
    get Keys(): KeyRing {
        return this.state.keys;
    }

    get EquippedWeapon(): WeaponDef {
        return EquippedWeapon(this.state);
    }

    /** Their light spell: lit, recharging or ready - null for a hero without one. */
    get Spell(): LightSpellState | null {
        return this.state.spell;
    }

    /** Whether they carry a key for this lock - or it's no lock at all. */
    HasKeyFor(lockId: number): boolean {
        return CanOpen(this.state.keys, lockId);
    }

    /** Back to the start of a level, on tile `start`: full health, the setup's weapons, `lightSpell` if any, nothing collected. */
    Reset(start: Vec2Like, lightSpell?: LightSpell): void {
        this.state = CreatePlayerState(this.setup, start, lightSpell);
        this.gone = false;
        this.away = false;
    }

    /** Their player has left the online game: they're out of play - down, as far as the rest of the party goes - and no longer drawn. */
    Leave(): void {
        this.gone = true;
        this.state.health.hitPoints = 0;
    }

    /** Their player's connection has gone (true) or come back (false) - see `Away`. `World.SetAway` is how the host's world does it. */
    SetAway(away: boolean): void {
        this.away = away;
    }

    /**
     * How big the frames they're drawn with are, and where in them the art is, in pixels (see `Figure`) - a whole tile
     * until told, and for `undefined`. `DungeonMain` tells each hero as a level starts, from every frame of the animation
     * they're drawn with (`ArtBounds`).
     */
    SetFigure(size: SpriteSize | undefined): void {
        const trim = size && size.trim;
        this.figure = size
            ? { width: size.width, height: size.height, trim: trim ? { x: trim.x, y: trim.y, width: trim.width, height: trim.height } : undefined }
            : { width: TileSize, height: TileSize };
    }

    /** Puts them at `position` (a top-left, in pixels) at once - nothing drawn between - their mage-light, if lit, moving with them. */
    WarpTo(position: Vec2Like): void {
        const state = this.state;
        const dx = position.x - state.position.x;
        const dy = position.y - state.position.y;
        state.position.Set(position.x, position.y);
        state.previous.Set(position.x, position.y);
        state.velocity.Set(0, 0);
        state.orb.Set(state.orb.x + dx, state.orb.y + dy);
        state.previousOrb.Copy(state.orb);
    }

    /** One step with this input: `dt` in frames (which movement is tuned to - 1 at 60 a second), `seconds` for timers; `collider` keeps them out of walls. */
    Step(input: IPlayerInput, dt: number, seconds: number, collider: MoveCollider): void {
        StepPlayer(this.state, input, dt, seconds, collider);
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

    /** Hands over every key they carry, leaving them none - what a fallen hero drops (see `World`). */
    DropKeys(): HeldKey[] {
        const keys = this.state.keys.keys;
        this.state.keys.keys = [];
        return keys;
    }
}
