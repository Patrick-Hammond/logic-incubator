/**
 * A hero's state and one fixed step of it: moving, facing, shooting, casting,
 * picking things up and taking hits. It reads only the input it is handed, never
 * a keyboard or pad, so the same step can run for a hero on this machine or one
 * whose input came from elsewhere. `Player` draws it; `DungeonMain` steps it.
 * Pure - no pixi - so it runs under the plain node test runner.
 */

import { Vec2, Vec2Like } from "@logic-incubator/lib/math/Geometry";
import { TileSize } from "../../Constants";
import type { PlayerSetup } from "../../DungeonMain";
import type { IPlayerInput } from "../../input/PlayerControl";
import type { CollectedPickup } from "../Level";
import { BoxCentre, MoveCollider, ResolveMove } from "../../view/helpers/PlayerMovement";
import { CarriedLight, CreateCarriedLight, TickCarriedLight } from "./CarriedLight";
import { AddGold, CreateGold, Gold } from "./Gold";
import { CreateHealth, DamageHealth, Health, HealHealth, TickHealth } from "./Health";
import { AddItem, CreateInventory, Inventory } from "./Inventory";
import { AddKey, CreateKeyRing, KeyRing } from "./Keys";
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
    velocity: Vec2;
    facingX: number;
    health: Health;
    gold: Gold;
    inventory: Inventory;
    keys: KeyRing;
    /** Their loadout, the first equipped at the start - a copy of the setup's, so a weapon picked up is gone again when the level starts over. */
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

/** A hero as a level starts: on tile `start`, facing right, at full health, with the setup's loadout, `lightSpell` if any, and nothing collected. */
export function CreatePlayerState(setup: Pick<PlayerSetup, "hitPoints" | "weapons">, start: Vec2Like, lightSpell?: LightSpell): PlayerState {
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
        weapons: setup.weapons.slice(),
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
 * timers tick, `input` turns and moves them (`collider` keeps them out of walls), and their mage-light
 * drifts after them. A shot fired waits in `shot` for `TakePlayerShot`.
 */
export function StepPlayer(state: PlayerState, input: IPlayerInput, dt: number, seconds: number, collider: MoveCollider): void {
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
    ResolveMove(state.position, state.velocity, dt, collider);
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
 * Gold adds to the count; health restores hit points, up to the maximum; a key joins the ones carried
 * (shown as the tile it was); a weapon is added to the loadout and equipped immediately; an item goes to
 * the first free inventory slot (dropped if it's full) - as its own sprite, or as the tile it was; a light
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
            state.weapons.push(value.weapon);
            state.equippedIndex = state.weapons.length - 1;
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
    state.velocity.Offset(n.x, n.y);

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
