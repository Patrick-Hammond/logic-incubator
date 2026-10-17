import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DefaultBossValue, IsBossValue } from "./Bosses";
import MonsterRoster, { MonsterDef } from "./MonsterRoster";

const Ogre: MonsterDef = { idle: "ogre_idle", run: "ogre_run", hitPoints: 4, speed: 0.5, contactDamage: 1, contactCooldown: 1, behaviour: () => ({ Steer: () => ({ x: 0, y: 0 }) }) };

describe("Bosses", () => {
    beforeEach(() => MonsterRoster.inst.Load({ types: ["ogre"], defs: { ogre: Ogre } }));
    afterEach(() => MonsterRoster.Destroy());

    it("knows a boss's value", () => {
        expect(IsBossValue({ monster: "ogre" })).toBe(true);
        expect(IsBossValue({ monster: "ogre", hitPoints: 0, quest: "ogre-king" })).toBe(true);
        expect(IsBossValue({ monster: "ogre", hitPoints: -1 })).toBe(false);
        expect(IsBossValue({ monster: "ogre", quest: "the king" })).toBe(false);
        // A spawner's value has a list of monsters, not one.
        expect(IsBossValue({ monsters: ["ogre"] })).toBe(false);
    });

    it("starts a new boss as the roster's first monster, three times as tough", () => {
        expect(DefaultBossValue()).toEqual({ monster: "ogre", hitPoints: 12 });
    });
});
