/**
 * A hero's experience: points (XP) for each monster they kill and each quest the party completes, and the level
 * those points have brought them to. Each level needs more points than the last, and raises the most hit points a
 * hero has. It is a run of a level's, like gold: a hero starts each run - and each start over - at level 1. Pure -
 * no pixi - so it runs under the plain node test runner.
 */

/** How experience is earned and what it brings - a game can change any of it (see `PlayerSetup.experience`). */
export type ExperienceRules = {
    /** Points for a monster killed, for each of its hit points - a tough one is worth more. To the hero whose shot killed it. */
    perMonsterHitPoint: number;
    /** Points for a quest completed (its goal met, or handed in) - to every hero, since a quest is the party's. */
    perQuest: number;
    /** Points the first level needs to reach the second; each level after needs this many more (100, 200, 300...). */
    perLevel: number;
    /** Hit points each level adds to a hero's most - and to what they have, so a level is a little healing too. */
    hitPointsPerLevel: number;
};

export const DefaultExperienceRules: Readonly<ExperienceRules> = {
    perMonsterHitPoint: 10,
    perQuest: 100,
    perLevel: 100,
    hitPointsPerLevel: 10
};

/** Where a hero has got to: their level, from 1, their points toward the next, and how many the next needs. */
export type Experience = {
    level: number;
    xp: number;
    next: number;
};

export function CreateExperience(rules: ExperienceRules): Experience {
    return { level: 1, xp: 0, next: PointsToLevel(rules, 1) };
}

/** The rules a game gives, with what it leaves out as `DefaultExperienceRules` has it. */
export function ExperienceRulesOf(rules?: Partial<ExperienceRules>): ExperienceRules {
    return { ...DefaultExperienceRules, ...(rules || {}) };
}

/** Points a hero at `level` needs to reach the next. */
export function PointsToLevel(rules: ExperienceRules, level: number): number {
    return Math.max(1, Math.round(rules.perLevel * level));
}

/** What a monster with this many hit points is worth. */
export function MonsterPoints(rules: ExperienceRules, hitPoints: number): number {
    return Math.max(0, Math.round(rules.perMonsterHitPoint * hitPoints));
}

/** Adds `points`, going up a level each time they reach the next; returns how many levels that was. */
export function AddPoints(experience: Experience, rules: ExperienceRules, points: number): number {
    if (points <= 0) {
        return 0;
    }
    experience.xp += Math.round(points);
    let levels = 0;
    while (experience.xp >= experience.next) {
        experience.xp -= experience.next;
        experience.level++;
        experience.next = PointsToLevel(rules, experience.level);
        levels++;
    }
    return levels;
}
