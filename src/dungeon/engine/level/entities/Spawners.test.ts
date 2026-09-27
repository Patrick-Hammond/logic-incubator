import { describe, expect, it } from "vitest";
import { TEST_MONSTERS } from "../__fixtures__/TestMonsters";
import { IsLightValue } from "../Lighting";
import MonsterRoster from "./MonsterRoster";
import { DefaultSpawnerValue, IsSpawnerValue, SanitiseSpawnerValue } from "./Spawners";

MonsterRoster.inst.Load(TEST_MONSTERS);

describe("SpawnerValue", () => {
    it("is told apart from a LightValue, both ways", () => {
        const light = { brightness: 0.5, tint: 0xff8100, range: 5 };
        expect(IsSpawnerValue(DefaultSpawnerValue())).toBe(true);
        expect(IsLightValue(DefaultSpawnerValue())).toBe(false);
        expect(IsSpawnerValue(light)).toBe(false);
        expect(IsLightValue(light)).toBe(true);
        expect(IsSpawnerValue(3)).toBe(false);
        expect(IsSpawnerValue(null)).toBe(false);
    });

    it("starts with the roster's default pool", () => {
        expect(DefaultSpawnerValue().monsters).toEqual(["goblin"]);
    });

    it("fills in fields missing from older saves", () => {
        expect(SanitiseSpawnerValue({ monsters: ["imp"], interval: 1 })).toEqual({ ...DefaultSpawnerValue(), monsters: ["imp"], interval: 1 });
        expect(SanitiseSpawnerValue(null)).toEqual(DefaultSpawnerValue());
    });

    it("drops monsters the roster doesn't know, falling back to the default pool if none survive", () => {
        expect(SanitiseSpawnerValue({ monsters: ["imp", "dragon"] }).monsters).toEqual(["imp"]);
        expect(SanitiseSpawnerValue({ monsters: ["dragon"] }).monsters).toEqual(["goblin"]);
    });

    it("floors numbers at 0, keeps maxAlive at least 1 and rounds counts", () => {
        const v = SanitiseSpawnerValue({ monsters: ["imp"], interval: -2, maxAlive: 0, total: 2.6, activationRange: NaN, hitPoints: -1 });
        expect(v).toEqual({ monsters: ["imp"], interval: 0, maxAlive: 1, total: 3, activationRange: DefaultSpawnerValue().activationRange, hitPoints: 0 });
    });

    it("doesn't share the roster's default pool array", () => {
        SanitiseSpawnerValue(null).monsters.push("ogre");
        DefaultSpawnerValue().monsters.push("ogre");
        expect(MonsterRoster.inst.DefaultPool).toEqual(["goblin"]);
    });
});
