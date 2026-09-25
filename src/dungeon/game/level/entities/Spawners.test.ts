import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";
import { IsLightValue } from "../Lighting";
import { MonsterIdleAnimation, MonsterTypes } from "./Monsters";
import { DEFAULT_SPAWNER_VALUE, IsSpawnerValue, SanitiseSpawnerValue } from "./Spawners";

describe("SpawnerValue", () => {
    it("is told apart from a LightValue, both ways", () => {
        const light = { brightness: 0.5, tint: 0xff8100, range: 5 };
        expect(IsSpawnerValue(DEFAULT_SPAWNER_VALUE)).toBe(true);
        expect(IsLightValue(DEFAULT_SPAWNER_VALUE)).toBe(false);
        expect(IsSpawnerValue(light)).toBe(false);
        expect(IsLightValue(light)).toBe(true);
        expect(IsSpawnerValue(3)).toBe(false);
        expect(IsSpawnerValue(null)).toBe(false);
    });

    it("fills in fields missing from older saves", () => {
        expect(SanitiseSpawnerValue({ monsters: ["imp"], interval: 1 })).toEqual({ ...DEFAULT_SPAWNER_VALUE, monsters: ["imp"], interval: 1 });
        expect(SanitiseSpawnerValue(null)).toEqual(DEFAULT_SPAWNER_VALUE);
    });

    it("drops unknown monsters, falling back to the default pool if none survive", () => {
        expect(SanitiseSpawnerValue({ monsters: ["imp", "dragon"] as never }).monsters).toEqual(["imp"]);
        expect(SanitiseSpawnerValue({ monsters: ["dragon"] as never }).monsters).toEqual(DEFAULT_SPAWNER_VALUE.monsters);
    });

    it("floors numbers at 0, keeps maxAlive at least 1 and rounds counts", () => {
        const v = SanitiseSpawnerValue({ monsters: ["imp"], interval: -2, maxAlive: 0, total: 2.6, activationRange: NaN, hitPoints: -1 });
        expect(v).toEqual({ monsters: ["imp"], interval: 0, maxAlive: 1, total: 3, activationRange: DEFAULT_SPAWNER_VALUE.activationRange, hitPoints: 0 });
    });

    it("doesn't share the default pool array", () => {
        SanitiseSpawnerValue(null).monsters.push("ogre");
        expect(DEFAULT_SPAWNER_VALUE.monsters).toEqual(["goblin"]);
    });
});

describe("MonsterIdleAnimation", () => {
    it("uses the idle loop, or the single loop for monsters without one", () => {
        expect(MonsterIdleAnimation("goblin")).toBe("goblin_idle_anim");
        expect(MonsterIdleAnimation("swampy")).toBe("swampy_anim");
    });

    it("names an animation listed in assets-meta.json for every monster", () => {
        const meta = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "..", "assets", "assets-meta.json"), "utf8"));
        MonsterTypes.forEach(type => expect(meta, type).toHaveProperty(MonsterIdleAnimation(type)));
    });
});
