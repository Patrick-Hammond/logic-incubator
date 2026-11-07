/**
 * A hero's state and one fixed step of it: moving, facing, shooting, casting,
 * picking things up and taking hits. It reads only the input it is handed, never
 * a keyboard or pad, so the same step can run for a hero on this machine or one
 * whose input came from elsewhere. `Player` draws it; `DungeonMain` steps it.
 * Pure - no pixi - so it runs under the plain node test runner.
 */

import { Vec2, Vec2Like } from "@logic-incubator/lib/math/Geometry";
import { PlayerSpeed, TileSize } from "../../Constants";
import type { PlayerSetup } from "../../DungeonMain";
import type { IPlayerInput } from "../../input/PlayerControl";
import type { CollectedPickup } from "../Level";
import { AxisVelocity, BareFloor, BoxCentre, Footing, MoveCollider, ResolveMove } from "../../view/helpers/PlayerMovement";
import { CarriedLight, CreateCarriedLight, TickCarriedLight } from "./CarriedLight";
import { AddGold, CreateGold, Gold } from "./Gold";
import { CreateHealth, DamageHealth, Health, HealHealth, IsDead, TickHealth } from "./Health";
import { AddItem, CreateInventory, Inventory } from "./Inventory";
import { AddKey, CreateKeyRing, KeyRing } from "./Keys";
import { AddPoints, CreateExperience, Experience, ExperienceRules, ExperienceRulesOf } from "./Experience";
import { CastLightSpell, CreateLightSpellState, LightSpell, LightSpellState, TickLightSpell } from "./LightSpell";
import { WeaponDef } from "./Projectiles";

/** How far behind a hero (away from where they face) their mage-light floats, in tiles. */
const OrbSide = 0.45;
/** Share of the way their mage-light drifts to its place behind them each step - it trails them rather than being stuck to them. */
const OrbFollow = 0.12;

export type PlayerState = {
    /** Top-left of their one-tile collision box, in pixels. */
    position: Vec2;
    /** Where `position` was before the last step - what drawing between steps starts from. */
    previous: Vec2;
    /** What they moved by in the last step, in steps of `PlayerSpeed` pixels a frame - see `AxisVelocity`. */
    velocity: Vec2;
    facingX: number;
    health: Health;
    gold: Gold;
    inventory: Inventory;
    keys: KeyRing;
    /** Their level and the points toward the next - see `GainExperience`. */
    experience: Experience;
    /**
     * The weapon they carry - one at a time: the setup's first, until one picked up takes its place (see `ApplyPickup`).
     * A list, with `equippedIndex` always 0, as the online snapshots have it.
     */
    weapons: WeaponDef[];
    equippedIndex: number;
    fireCooldown: number;
    /** The direction of a shot fired in the last step, until it's taken (see `TakePlayerShot`). */
    shot: Vec2Like | null;
    /** The torch they're carrying, if they've picked one up and it hasn't burnt out. */
    carried: CarriedLight | null;
    /** Their light spell in play - null for a hero without one. */
    spell: LightSpellState | null;
    /** The floor under their mage-light, in world pixels. */
    orb: Vec2;
    /** Where `orb` was before the last step. */
    previousOrb: Vec2;
    /** Seconds their mage-light has been lit, which it bobs by. */
    orbTime: number;
};

/** A hero as a level starts: on tile `start`, facing right, at full health and level 1, with the setup's first weapon, `lightSpell` if any, and nothing collected. */
export function CreatePlayerState(setup: Pick<PlayerSetup, "hitPoints" | "weapons" | "experience">, start: Vec2Like, lightSpell?: LightSpell): PlayerState {
    const x = start.x * TileSize;
    const y = start.y * TileSize;
    return {
        position: new Vec2(x, y),
        previous: new Vec2(x, y),
        velocity: new Vec2(),
        facingX: 1,
        health: CreateHealth(setup.hitPoints),
        gold: CreateGold(),
        inventory: CreateInventory(),
        keys: CreateKeyRing(),
        experience: CreateExperience(ExperienceRulesOf(setup.experience)),
        weapons: setup.weapons.slice(0, 1),
        equippedIndex: 0,
        fireCooldown: 0,
        shot: null,
        carried: null,
        spell: lightSpell ? CreateLightSpellState(lightSpell) : null,
        orb: new Vec2(),
        previousOrb: new Vec2(),
        orbTime: 0
    };
}

/**
 * One step: `dt` in frames (what movement is tuned to - 1 at 60 a second), `seconds` for timers. Their
 * timers tick, `input` turns and moves them (`collider` keeps them out of walls) as the floor they're on lets
 * them (`footing` - see `Footing`, `AxisVelocity`: a floor overlay's, bare floor's when left out), and their
 * mage-light drifts after them. A shot fired waits in `shot` for `TakePlayerShot`.
 */
export function StepPlayer(state: PlayerState, input: IPlayerInput, dt: number, seconds: number, collider: MoveCollider, footing: Footing = BareFloor): void {
    state.previous.Copy(state.position);
    state.previousOrb.Copy(state.orb);
    TickHealth(state.health, seconds);
    if (state.carried && !TickCarriedLight(state.carried, seconds)) {
        state.carried = null;
    }
    if (state.spell) {
        TickLightSpell(state.spell, seconds);
    }
    ReadInput(state, input, seconds);
    const push = input.direction;
    const velocity = state.velocity;
    velocity.Set(AxisVelocity(velocity.x, push.x, footing, dt), AxisVelocity(velocity.y, push.y, footing, dt));
    // Damped already, for the floor.
    ResolveMove(state.position, velocity, dt, collider, PlayerSpeed, 1);
    MoveOrb(state, dt, seconds);
}

/** The direction of a shot fired in the last step, handed over once - null if none was. */
export function TakePlayerShot(state: PlayerState): Vec2Like | null {
    const shot = state.shot;
    state.shot = null;
    return shot;
}

/** Returns whether the hit landed - not while invulnerable from the last one, or already dead. */
export function DamagePlayer(state: PlayerState, damage: number): boolean {
    return DamageHealth(state.health, damage);
}

export function EquippedWeapon(state: PlayerState): WeaponDef {
    return state.weapons[state.equippedIndex];
}

/**
 * Adds experience points (see `Experience`); each level they go up adds `rules.hitPointsPerLevel` to their most hit
 * points, and to what they have unless they're down. Returns how many levels they went up.
 */
export function GainExperience(state: PlayerState, rules: ExperienceRules, points: number): number {
    const levels = AddPoints(state.experience, rules, points);
    const more = levels * rules.hitPointsPerLevel;
    if (more > 0) {
        const down = IsDead(state.health);
        state.health.max += more;
        if (!down) {
            state.health.hitPoints += more;
        }
    }
    return levels;
}

/**
 * Gold adds to the count; health restores hit points, up to the maximum; a key joins the ones carried
 * (shown as the tile it was); a weapon takes the place of the one they carry; an item joins its stack in
 * the inventory, or the first free slot (dropped if there's neither) - as its own sprite, or as the tile it was; a light
 * is carried from then on, in place of any they had.
 */
export function ApplyPickup(state: PlayerState, pickup: CollectedPickup): void {
    const value = pickup.value;
    switch (value.kind) {
        case "gold":
            AddGold(state.gold, value.amount);
            break;
        case "health":
            HealHealth(state.health, value.amount);
            break;
        case "key":
            AddKey(state.keys, value.id, pickup.sprite);
            break;
        case "weapon":
            state.weapons = [value.weapon];
            state.equippedIndex = 0;
            break;
        case "item": {
            const sprite = value.sprite || pickup.sprite;
            if (sprite) {
                AddItem(state.inventory, sprite);
            }
            break;
        }
        case "light":
            state.carried = CreateCarriedLight(value.light, value.seconds);
            break;
    }
}

function ReadInput(state: PlayerState, input: IPlayerInput, seconds: number): void {
    const n = input.direction;
    if (n.x !== 0) {
        state.facingX = n.x < 0 ? -1 : 1;
    }

    state.fireCooldown = Math.max(0, state.fireCooldown - seconds);
    if (input.aimX !== 0) {
        // A gamepad's right stick can set facing independent of movement (Robotron style) - keyboard's
        // fire key has no direction of its own (aimX is always 0 there), so it just uses facing as-is.
        state.facingX = input.aimX < 0 ? -1 : 1;
    }
    if (input.casting && state.spell && CastLightSpell(state.spell)) {
        // It appears in its place behind them, then drifts after them from there - not from wherever it last went out.
        const target = OrbTarget(state);
        state.orb.Copy(target);
        state.previousOrb.Copy(target);
        state.orbTime = 0;
    }
    if (input.firing && state.fireCooldown === 0) {
        // Tutankham style: always straight left or right, whichever the player currently faces -
        // never up/down, and never anywhere the player isn't already facing.
        state.shot = { x: state.facingX, y: 0 };
        state.fireCooldown = EquippedWeapon(state).shot.cooldown;
    }
}

/** Where their mage-light floats over: just behind them, away from where they face. */
function OrbTarget(state: PlayerState): Vec2Like {
    const centre = BoxCentre(state.position);
    return { x: centre.x - state.facingX * OrbSide * TileSize, y: centre.y };
}

/** Lets their mage-light, while it's lit, drift after them. */
function MoveOrb(state: PlayerState, dt: number, seconds: number): void {
    if (!state.spell || !state.spell.lit) {
        return;
    }
    const target = OrbTarget(state);
    const follow = Math.min(1, OrbFollow * dt);
    state.orb.Set(state.orb.x + (target.x - state.orb.x) * follow, state.orb.y + (target.y - state.orb.y) * follow);
    state.orbTime += seconds;
}
