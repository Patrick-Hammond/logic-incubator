import { describe, expect, it } from "vitest";
import { TEST_MONSTERS } from "@logic-incubator/engine/level/__fixtures__/TestMonsters";
import MonsterRoster from "@logic-incubator/engine/level/entities/MonsterRoster";
import { DefaultQuest, IsQuestDef, QuestDef, QuestGoalKinds, RegisterQuestGoal } from "@logic-incubator/engine/story/Quests";
import { DescribeQuest, NewQuestId, QuestFields, QuestFromForm, QuestProblem, QuestToForm } from "./QuestEditor";
import { IsFieldVisible } from "./ui/dialog/FormDialog";

MonsterRoster.inst.Load(TEST_MONSTERS);

const noImages = { monster: () => undefined };
const visible = (form: ReturnType<typeof QuestToForm>) => QuestFields(noImages).filter(field => IsFieldVisible(field, form)).map(field => field.key);

const RATS: QuestDef = { id: "rats", name: "RATS IN THE CELLAR", text: "Clear the cellar.", goal: { kind: "kill", count: 5, monster: "imp" } };
const HOARD: QuestDef = { id: "hoard", name: "THE HOARD", goal: { kind: "collect" }, start: true };
const BOSS: QuestDef = { id: "boss", name: "THE FINAL BOSS", goal: { kind: "kill" }, start: true, ends: true };
const TALK: QuestDef = { id: "talk", name: "A WORD WITH THE MINER", goal: { kind: "script" } };

describe("the quest editor", () => {
    it("round-trips every built-in kind of quest", () => {
        [RATS, HOARD, BOSS, TALK, DefaultQuest("quest1")].forEach(quest => expect(QuestFromForm(QuestToForm(quest), quest), quest.id).toEqual(quest));
    });

    it("leaves out what's not set - no text, a count of 0, no monster, start and ends off", () => {
        const form = { ...QuestToForm(RATS), text: " ", count: 0, monster: "" };
        expect(QuestFromForm(form, RATS)).toEqual({ id: "rats", name: "RATS IN THE CELLAR", goal: { kind: "kill" } });
    });

    it("drops a kill goal's monster when the goal becomes another kind", () => {
        expect(QuestFromForm({ ...QuestToForm(RATS), goal: "collect" }, RATS).goal).toEqual({ kind: "collect", count: 5 });
        expect(QuestFromForm({ ...QuestToForm(RATS), goal: "script" }, RATS).goal).toEqual({ kind: "script" });
    });

    it("always makes a quest the engine will play", () => {
        QuestGoalKinds().forEach(kind => expect(IsQuestDef(QuestFromForm({ ...QuestToForm(RATS), goal: kind }, RATS)), kind).toBe(true));
    });

    it("shows a count for the goals that count things, and a monster for kill", () => {
        expect(visible(QuestToForm(RATS))).toEqual(["name", "text", "id", "goal", "count", "monster", "start", "ends"]);
        expect(visible(QuestToForm(HOARD))).toEqual(["name", "text", "id", "goal", "count", "start", "ends"]);
        expect(visible(QuestToForm(TALK))).toEqual(["name", "text", "id", "goal", "start", "ends"]);
    });

    // The kind it registers stays for the rest of this file - each test file has its own modules - and suits every test here.
    it("offers a game's own kind of goal, and keeps its fields as they were", () => {
        RegisterQuestGoal("escort", { label: "Escort", Default: () => ({ kind: "escort", who: "miner" }), IsValid: () => true, Target: () => 1, Advance: () => 0 });
        const goal = QuestFields(noImages).find(field => field.key === "goal");
        expect(goal.type === "choice" && goal.options.map(o => o.value)).toContain("escort");
        expect(QuestFromForm({ ...QuestToForm(TALK), goal: "escort" }, TALK).goal).toEqual({ kind: "escort", who: "miner" });
        const escort: QuestDef = { id: "escort", name: "ESCORT", goal: { kind: "escort", who: "smith" } };
        expect(QuestFromForm(QuestToForm(escort), escort)).toEqual(escort);
    });

    it("wants a name, and an id that's one word no other quest has", () => {
        const others = [HOARD, BOSS];
        const form = QuestToForm(RATS);
        expect(QuestProblem(form, others)).toBeNull();
        expect(QuestProblem({ ...form, name: " " }, others)).toMatch(/name/);
        expect(QuestProblem({ ...form, id: "" }, others)).toMatch(/Give the quest an id/);
        expect(QuestProblem({ ...form, id: "two words" }, others)).toMatch(/one word/);
        expect(QuestProblem({ ...form, id: "hoard" }, others)).toMatch(/Another quest is “hoard”/);
        expect(QuestProblem({ ...form, monster: "dragon" }, others)).toMatch(/Pick a monster/);
    });

    it("finds a new quest an id none has", () => {
        expect(NewQuestId([])).toBe("quest1");
        expect(NewQuestId([DefaultQuest("quest1"), DefaultQuest("quest3")])).toBe("quest2");
    });

    it("says each quest in a few words, for the list", () => {
        expect(DescribeQuest(RATS)).toBe("rats · kill 5 or any imp");
        expect(DescribeQuest(HOARD)).toBe("hoard · collect every one marked · from the start");
        expect(DescribeQuest(BOSS)).toBe("boss · kill every one marked · from the start · ends the level");
        expect(DescribeQuest(TALK)).toBe("talk · dialog says");
    });
});
