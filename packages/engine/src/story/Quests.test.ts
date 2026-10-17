import { describe, expect, it } from "vitest";
import QuestLog, { IsQuestDef, QuestDef, QuestGoalKinds, QuestLevel, QuestState, ReadQuests, RegisterQuestGoal } from "./Quests";

const level = (marked: { [key: string]: number } = {}): QuestLevel => ({ Marked: (kind, quest) => marked[kind + ":" + quest] || 0 });

const rats: QuestDef = { id: "rats", name: "RATS", goal: { kind: "kill" } };
const mushrooms: QuestDef = { id: "mushrooms", name: "MUSHROOMS", goal: { kind: "collect", count: 2 } };
const smith: QuestDef = { id: "smith", name: "SEE THE SMITH", goal: { kind: "script" } };
const boss: QuestDef = { id: "boss", name: "THE KING", goal: { kind: "kill" }, start: true, ends: true };

function Log(defs: QuestDef[], marked: { [key: string]: number } = {}) {
    const changes: Array<{ id: string; state: QuestState; was: QuestState; progress: number; index: number }> = [];
    const log = new QuestLog((status, was, index) => changes.push({ id: status.def.id, state: status.state, was, progress: status.progress, index }));
    log.Reset(defs, level(marked));
    return { log, changes };
}

describe("QuestDef", () => {
    it("takes a well-formed quest", () => {
        expect(IsQuestDef(rats)).toBe(true);
        expect(IsQuestDef({ ...mushrooms, text: "Six of them", start: false, ends: true })).toBe(true);
    });

    it("turns down a bad id, a missing name or a goal of no kind there is", () => {
        expect(IsQuestDef({ ...rats, id: "two words" })).toBe(false);
        expect(IsQuestDef({ id: "rats", goal: { kind: "kill" } })).toBe(false);
        expect(IsQuestDef({ ...rats, goal: { kind: "dance" } })).toBe(false);
        expect(IsQuestDef({ ...rats, goal: { kind: "collect", count: -1 } })).toBe(false);
        expect(IsQuestDef({ ...rats, start: "yes" })).toBe(false);
    });

    it("reads a level's quests, leaving out bad ones and repeats - and none from a level without", () => {
        expect(ReadQuests([rats, { id: "bad" }, { ...rats, name: "AGAIN" }, smith]).map(q => q.name)).toEqual(["RATS", "SEE THE SMITH"]);
        expect(ReadQuests(undefined)).toEqual([]);
    });

    it("can be given more kinds of goal", () => {
        RegisterQuestGoal("gold", {
            label: "Gold",
            Default: () => ({ kind: "gold", amount: 10 }),
            IsValid: goal => typeof goal.amount === "number",
            Target: goal => goal.amount as number,
            Advance: (_goal, _quest, happening) => (happening.kind === "collect" && (happening.pickup as { kind: string }).kind === "gold" ? (happening.pickup as { amount: number }).amount : 0)
        });
        expect(QuestGoalKinds()).toContain("gold");
        const { log } = Log([{ id: "rich", name: "RICH", goal: { kind: "gold", amount: 10 }, start: true }]);
        log.Record({ kind: "collect", pickup: { kind: "gold", amount: 6 } });
        log.Record({ kind: "collect", pickup: { kind: "gold", amount: 6 } });
        expect(log.Get("rich")).toMatchObject({ state: "complete", progress: 10 });
    });
});

describe("QuestLog", () => {
    it("starts the start quests under way and the rest not given, each with its target", () => {
        const { log, changes } = Log([rats, mushrooms, boss], { "kill:rats": 3, "kill:boss": 1 });
        expect(log.Quests.map(q => [q.def.id, q.state, q.target])).toEqual([["rats", "none", 3], ["mushrooms", "none", 2], ["boss", "active", 1]]);
        expect(changes).toEqual([]);
    });

    it("needs at least one of something, even when the level marks nothing for it", () => {
        expect(Log([rats]).log.Get("rats")!.target).toBe(1);
    });

    it("gives a quest once, and tells of it", () => {
        const { log, changes } = Log([rats, mushrooms]);
        expect(log.Give("mushrooms")).toBe(true);
        expect(log.Give("mushrooms")).toBe(false);
        expect(log.Give("nothing")).toBe(false);
        expect(changes).toEqual([{ id: "mushrooms", state: "active", was: "none", progress: 0, index: 1 }]);
    });

    it("counts what's marked for a quest, and completes it at its target", () => {
        const { log } = Log([mushrooms]);
        log.Give("mushrooms");
        log.Record({ kind: "collect", quest: "mushrooms", pickup: { kind: "item" } });
        expect(log.Get("mushrooms")).toMatchObject({ state: "active", progress: 1 });
        log.Record({ kind: "collect", pickup: { kind: "item" } });
        log.Record({ kind: "collect", quest: "rats", pickup: { kind: "item" } });
        expect(log.Get("mushrooms")!.progress).toBe(1);
        log.Record({ kind: "collect", quest: "mushrooms", pickup: { kind: "item" } });
        expect(log.Get("mushrooms")).toMatchObject({ state: "complete", progress: 2 });
        log.Record({ kind: "collect", quest: "mushrooms", pickup: { kind: "item" } });
        expect(log.Get("mushrooms")!.progress).toBe(2);
    });

    it("counts marked things before the quest is given - and given then, it's complete at once", () => {
        const { log, changes } = Log([mushrooms]);
        log.Record({ kind: "collect", quest: "mushrooms", pickup: { kind: "item" } });
        log.Record({ kind: "collect", quest: "mushrooms", pickup: { kind: "item" } });
        expect(log.Get("mushrooms")).toMatchObject({ state: "none", progress: 2 });
        log.Give("mushrooms");
        expect(log.State("mushrooms")).toBe("complete");
        expect(changes[changes.length - 1]).toMatchObject({ state: "complete", was: "none" });
    });

    it("counts kills of a type only while the quest is under way", () => {
        const { log } = Log([{ id: "skeletons", name: "BONES", goal: { kind: "kill", monster: "skeleton", count: 2 } }]);
        log.Record({ kind: "kill", monster: "skeleton" });
        expect(log.Get("skeletons")!.progress).toBe(0);
        log.Give("skeletons");
        log.Record({ kind: "kill", monster: "skeleton" });
        log.Record({ kind: "kill", monster: "rat" });
        log.Record({ kind: "kill", monster: "skeleton" });
        expect(log.State("skeletons")).toBe("complete");
    });

    it("has a dialog complete and finish a quest", () => {
        const { log } = Log([smith]);
        log.Record({ kind: "kill", quest: "smith", monster: "rat" });
        expect(log.Get("smith")!.progress).toBe(0);
        expect(log.Complete("smith")).toBe(true);
        expect(log.Complete("smith")).toBe(false);
        expect(log.Finish("smith")).toBe(true);
        expect(log.Finish("smith")).toBe(false);
        expect(log.State("smith")).toBe("finished");
        expect(log.State("nothing")).toBe("none");
    });

    it("follows a quest where it's said to be without telling of it, and keeps a version", () => {
        const { log, changes } = Log([rats, mushrooms]);
        const version = log.Version;
        expect(log.Follow(1, "complete", 2)).toBe("none");
        expect(log.Follow(5, "active", 0)).toBeNull();
        expect(log.Get("mushrooms")).toMatchObject({ state: "complete", progress: 2 });
        expect(changes).toEqual([]);
        expect(log.Version).toBeGreaterThan(version);
    });

    it("starts over with each reset", () => {
        const { log } = Log([mushrooms]);
        log.Give("mushrooms");
        log.Reset([mushrooms], level());
        expect(log.Get("mushrooms")).toMatchObject({ state: "none", progress: 0 });
    });
});
