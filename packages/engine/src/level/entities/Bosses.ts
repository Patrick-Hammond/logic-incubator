/**
 * Bosses: the value of a `BOSS` brush - one monster of the roster's, placed where it's painted rather than made
 * by a spawner, tougher if it's given more hit points, and marked for a quest if it's what one asks to kill (see
 * `Quests`). It sleeps where it stands until a hero comes near it in sight (see `Encounter`). Pure - no pixi - so
 * it runs under the plain node test runner, same as Spawners.ts.
 */

import type { Vec2Like } from "@logic-incubator/lib/math/Geometry";
import { IsQuestId } from "../../story/Quests";
import MonsterRoster, { MonsterType } from "./MonsterRoster";

export type BossValue = {
    /** Which of the roster's monsters it is. */
    monster: MonsterType;
    /** Its hit points, before a party's toughness (see `PartyToughness`) - 0 or left out: its kind's own. */
    hitPoints?: number;
    /** The quest killing it counts for, by id. */
    quest?: string;
};

/** A placed boss: its (normalised) map cell plus its value. See `Level.bosses`. */
export type Boss = Vec2Like & { value: BossValue };

/** Whether `value` is a boss's value - the only data brush value with a lone `monster`. */
export function IsBossValue(value: unknown): value is BossValue {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const boss = value as BossValue;
    return (
        typeof boss.monster === "string" &&
        (boss.hitPoints === undefined || (typeof boss.hitPoints === "number" && Number.isFinite(boss.hitPoints) && boss.hitPoints >= 0)) &&
        (boss.quest === undefined || IsQuestId(boss.quest))
    );
}

/** What a new `BOSS` brush starts with: the roster's first monster, three times as tough. A function, not a constant, as the roster is the game's, loaded at boot. */
export function DefaultBossValue(): BossValue {
    const monster = MonsterRoster.inst.DefaultPool[0] || "";
    const def = MonsterRoster.inst.Def(monster);
    return { monster, hitPoints: def ? def.hitPoints * 3 : 0 };
}
