import { describe, expect, it } from "vitest";
import { TEST_MONSTERS } from "../__fixtures__/TestMonsters";
import MonsterRoster from "./MonsterRoster";

describe("MonsterRoster", () => {
    it("has no monsters until the game loads its roster", () => {
        const roster = new MonsterRoster();
        expect(roster.Types).toEqual([]);
        expect(roster.DefaultPool).toEqual([]);
        expect(roster.Has("goblin")).toBe(false);
    });

    it("knows exactly the loaded monsters, and asks the game for their idle animation", () => {
        const roster = new MonsterRoster();
        roster.Load(TEST_MONSTERS);
        expect(roster.Types).toEqual(["goblin", "imp", "ogre"]);
        expect(roster.Has("imp")).toBe(true);
        expect(roster.Has("dragon")).toBe(false);
        expect(roster.Has(3)).toBe(false);
        expect(roster.IdleAnimation("ogre")).toBe("ogre_idle_anim");
    });

    it("defaults a new spawner's pool to the first monster when the game doesn't name one", () => {
        const roster = new MonsterRoster();
        roster.Load({ ...TEST_MONSTERS, defaultPool: undefined });
        expect(roster.DefaultPool).toEqual(["goblin"]);
        roster.Load({ ...TEST_MONSTERS, defaultPool: ["imp", "ogre"] });
        expect(roster.DefaultPool).toEqual(["imp", "ogre"]);
    });
});
