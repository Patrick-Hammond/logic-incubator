import { describe, expect, it } from "vitest";
import { GutterTime } from "./CarriedLight";
import { CastLightSpell, CreateLightSpellState, IsLightSpellReady, LightSpell, LightSpellScale, LightSpellStatusOf, TickLightSpell } from "./LightSpell";

const MAGE_LIGHT: LightSpell = { light: { brightness: 1, tint: 0xa8c4ff, range: 8 }, seconds: 60, recharge: 20 };

describe("LightSpell", () => {
    it("starts ready, and is lit at full strength once cast", () => {
        const state = CreateLightSpellState(MAGE_LIGHT);
        expect(IsLightSpellReady(state)).toBe(true);
        expect(LightSpellScale(state)).toBe(0);
        expect(CastLightSpell(state)).toBe(true);
        expect(state.lit.value).toBe(MAGE_LIGHT.light);
        expect(LightSpellScale(state)).toBe(1);
    });

    it("can't be cast again while it's lit", () => {
        const state = CreateLightSpellState(MAGE_LIGHT);
        CastLightSpell(state);
        TickLightSpell(state, 30);
        expect(CastLightSpell(state)).toBe(false);
        expect(state.lit.left).toBe(30);
    });

    it("dims at the end, goes out, then recharges before it can be cast again", () => {
        const state = CreateLightSpellState(MAGE_LIGHT);
        CastLightSpell(state);
        TickLightSpell(state, 60 - GutterTime / 2);
        expect(LightSpellScale(state)).toBeCloseTo(0.5);
        TickLightSpell(state, GutterTime);
        expect(state.lit).toBeNull();
        expect(state.recharging).toBe(20);
        expect(CastLightSpell(state)).toBe(false);
        TickLightSpell(state, 19);
        expect(IsLightSpellReady(state)).toBe(false);
        TickLightSpell(state, 2);
        expect(state.recharging).toBe(0);
        expect(CastLightSpell(state)).toBe(true);
    });

    it("stays lit for good when it lasts 0 seconds", () => {
        const state = CreateLightSpellState({ ...MAGE_LIGHT, seconds: 0 });
        CastLightSpell(state);
        TickLightSpell(state, 10000);
        expect(LightSpellScale(state)).toBe(1);
    });

    it("is ready again at once with no recharge", () => {
        const state = CreateLightSpellState({ ...MAGE_LIGHT, seconds: 5, recharge: 0 });
        CastLightSpell(state);
        TickLightSpell(state, 6);
        expect(IsLightSpellReady(state)).toBe(true);
    });
});

describe("LightSpellStatusOf", () => {
    it("is full and ready before it's cast", () => {
        expect(LightSpellStatusOf(CreateLightSpellState(MAGE_LIGHT))).toEqual({ state: "ready", fill: 1, seconds: 0 });
    });

    it("empties as it burns, with the seconds it has left", () => {
        const state = CreateLightSpellState(MAGE_LIGHT);
        CastLightSpell(state);
        TickLightSpell(state, 15);
        expect(LightSpellStatusOf(state)).toEqual({ state: "lit", fill: 0.75, seconds: 45 });
    });

    it("fills back up as it recharges, with the seconds until it's ready", () => {
        const state = CreateLightSpellState(MAGE_LIGHT);
        CastLightSpell(state);
        TickLightSpell(state, 60);
        TickLightSpell(state, 5);
        expect(LightSpellStatusOf(state)).toEqual({ state: "recharging", fill: 0.25, seconds: 15 });
    });

    it("stays full while lit for good", () => {
        const state = CreateLightSpellState({ ...MAGE_LIGHT, seconds: 0 });
        CastLightSpell(state);
        expect(LightSpellStatusOf(state)).toEqual({ state: "lit", fill: 1, seconds: 0 });
    });
});
