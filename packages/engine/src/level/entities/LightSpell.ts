/**
 * A light the player calls up - a mage-light: it floats beside them for a while, then has to recharge before it
 * can be called up again. Pure - no pixi - so it runs under the plain node test runner, same as CarriedLight.ts.
 */

import { LightValue } from "../Lighting";
import { CarriedLight, CarriedLightScale, CreateCarriedLight, TickCarriedLight } from "./CarriedLight";

/** What a game gives a hero who can call up a light - see `PlayerSetup.lightSpell`. */
export type LightSpell = {
    light: LightValue;
    /** How long it stays lit, in seconds - it dims over its last few, like a torch burning out. 0 stays lit for the rest of the level. */
    seconds: number;
    /** Seconds after it goes out before it can be called up again. */
    recharge: number;
};

/** A hero's light spell in play: lit, recharging, or ready to cast. */
export type LightSpellState = {
    spell: LightSpell;
    /** The light while it's lit, burning down - null when it isn't. */
    lit: CarriedLight | null;
    /** Seconds until it can be cast again - 0 once it has recharged. */
    recharging: number;
};

export function CreateLightSpellState(spell: LightSpell): LightSpellState {
    return { spell, lit: null, recharging: 0 };
}

/** Whether it can be cast now: it isn't lit, and it has recharged. */
export function IsLightSpellReady(state: LightSpellState): boolean {
    return !state.lit && state.recharging <= 0;
}

/** Calls the light up if it's ready; returns whether it did. */
export function CastLightSpell(state: LightSpellState): boolean {
    if (!IsLightSpellReady(state)) {
        return false;
    }
    state.lit = CreateCarriedLight(state.spell.light, state.spell.seconds);
    return true;
}

/** Runs it on by `seconds`: a lit one burns down and starts to recharge when it goes out; one that's out recharges. */
export function TickLightSpell(state: LightSpellState, seconds: number): void {
    if (state.lit) {
        if (!TickCarriedLight(state.lit, seconds)) {
            state.lit = null;
            state.recharging = Math.max(0, state.spell.recharge);
        }
    } else if (state.recharging > 0) {
        state.recharging = Math.max(0, state.recharging - seconds);
    }
}

/** Its strength as a multiple of its own: 0 while it isn't lit, else as `CarriedLightScale`. */
export function LightSpellScale(state: LightSpellState): number {
    return state.lit ? CarriedLightScale(state.lit) : 0;
}

/**
 * How the HUD shows it: ready, lit or recharging; how full its bar is (lit: what's left of its burn; recharging:
 * how far it has recharged; ready: full); and the seconds that go with that (lit: left to burn, 0 for one that
 * stays lit; recharging: until it's ready; ready: 0).
 */
export type LightSpellStatus = { state: "ready" | "lit" | "recharging"; fill: number; seconds: number };

export function LightSpellStatusOf(state: LightSpellState): LightSpellStatus {
    if (state.lit) {
        const lit = state.lit;
        return lit.seconds > 0 ? { state: "lit", fill: lit.left / lit.seconds, seconds: lit.left } : { state: "lit", fill: 1, seconds: 0 };
    }
    if (state.recharging > 0) {
        const recharge = state.spell.recharge;
        return { state: "recharging", fill: recharge > 0 ? 1 - state.recharging / recharge : 1, seconds: state.recharging };
    }
    return { state: "ready", fill: 1, seconds: 0 };
}
