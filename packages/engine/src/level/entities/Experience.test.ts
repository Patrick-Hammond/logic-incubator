import { describe, expect, it } from "vitest";
import { AddPoints, CreateExperience, DefaultExperienceRules, ExperienceRulesOf, MonsterPoints, PointsToLevel } from "./Experience";

describe("Experience", () => {
    const rules = DefaultExperienceRules;

    it("starts at level 1 with no points", () => {
        expect(CreateExperience(rules)).toEqual({ level: 1, xp: 0, next: 100 });
    });

    it("needs more points for each level", () => {
        expect(PointsToLevel(rules, 1)).toBe(100);
        expect(PointsToLevel(rules, 2)).toBe(200);
        expect(PointsToLevel(rules, 3)).toBe(300);
    });

    it("counts points toward the next level", () => {
        const experience = CreateExperience(rules);
        expect(AddPoints(experience, rules, 60)).toBe(0);
        expect(experience).toEqual({ level: 1, xp: 60, next: 100 });
    });

    it("goes up a level, keeping what's left over", () => {
        const experience = CreateExperience(rules);
        AddPoints(experience, rules, 60);
        expect(AddPoints(experience, rules, 70)).toBe(1);
        expect(experience).toEqual({ level: 2, xp: 30, next: 200 });
    });

    it("goes up several levels at once for enough points", () => {
        const experience = CreateExperience(rules);
        expect(AddPoints(experience, rules, 350)).toBe(2);
        expect(experience).toEqual({ level: 3, xp: 50, next: 300 });
    });

    it("ignores nothing, and less", () => {
        const experience = CreateExperience(rules);
        expect(AddPoints(experience, rules, 0)).toBe(0);
        expect(AddPoints(experience, rules, -5)).toBe(0);
        expect(experience).toEqual({ level: 1, xp: 0, next: 100 });
    });

    it("rates a monster by its hit points", () => {
        expect(MonsterPoints(rules, 3)).toBe(30);
        expect(MonsterPoints(rules, 20)).toBe(200);
    });

    it("fills in the rules a game leaves out", () => {
        expect(ExperienceRulesOf({ perQuest: 50 })).toEqual({ ...rules, perQuest: 50 });
        expect(ExperienceRulesOf()).toEqual(rules);
    });
});
