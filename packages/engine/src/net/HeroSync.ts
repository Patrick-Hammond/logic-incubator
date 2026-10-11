/**
 * A hero to and from the host's snapshots: what the host sends of each hero
 * (`HeroSnapshotOf`), and setting a guest's copy of them to it
 * (`ApplyHeroSnapshot`). What they carry - keys, items, weapons, a torch - comes
 * from the pickups they're told of (see `GuestSession`); the rest is here.
 * Pure - no pixi - so it runs under the plain node test runner.
 */

import { CreateCarriedLight } from "../level/entities/CarriedLight";
import type Hero from "../sim/Hero";
import type { HeroSnapshot } from "./PlayMessages";

/** Hero `hero` as the host sends them; `ack` is the last of their player's inputs played. */
export function HeroSnapshotOf(hero: Hero, ack: number): HeroSnapshot {
    const state = hero.State;
    const spell = state.spell;
    const lit = spell && spell.lit;
    return {
        gone: hero.Gone,
        away: hero.Away,
        x: state.position.x,
        y: state.position.y,
        vx: state.velocity.x,
        vy: state.velocity.y,
        facingX: state.facingX,
        hitPoints: state.health.hitPoints,
        invulnerable: state.health.invulnerable,
        gold: state.gold.amount,
        equipped: state.equippedIndex,
        fireCooldown: state.fireCooldown,
        spellLit: lit ? lit.left : null,
        spellRecharging: spell ? spell.recharging : 0,
        carried: state.carried ? state.carried.left : null,
        orbX: state.orb.x,
        orbY: state.orb.y,
        orbTime: state.orbTime,
        ack
    };
}

/**
 * Sets a guest's copy of a hero to what the host's snapshot says - everything but what they carry, and their
 * position and mage-light, which a guest draws between snapshots (see `Replica.HeroAt`) or moves ahead itself
 * (see `Prediction`) and so sets for itself.
 */
export function ApplyHeroSnapshot(hero: Hero, snapshot: HeroSnapshot): void {
    if (snapshot.gone && !hero.Gone) {
        hero.Leave();
    }
    hero.SetAway(snapshot.away);
    const state = hero.Writable;
    state.velocity.Set(snapshot.vx, snapshot.vy);
    state.facingX = snapshot.facingX;
    state.health.hitPoints = snapshot.hitPoints;
    state.health.invulnerable = snapshot.invulnerable;
    state.gold.amount = snapshot.gold;
    if (snapshot.equipped < state.weapons.length) {
        state.equippedIndex = snapshot.equipped;
    }
    state.fireCooldown = snapshot.fireCooldown;
    const spell = state.spell;
    if (spell) {
        if (snapshot.spellLit !== null) {
            if (!spell.lit) {
                spell.lit = CreateCarriedLight(spell.spell.light, spell.spell.seconds);
            }
            spell.lit.left = snapshot.spellLit;
            spell.recharging = 0;
            state.orbTime = snapshot.orbTime;
        } else {
            spell.lit = null;
            spell.recharging = snapshot.spellRecharging;
        }
    }
    if (snapshot.carried === null) {
        state.carried = null;
    } else if (state.carried) {
        state.carried.left = snapshot.carried;
    }
}
