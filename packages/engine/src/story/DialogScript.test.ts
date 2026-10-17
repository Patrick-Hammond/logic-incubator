import { describe, expect, it } from "vitest";
import { DescribeDialogErrors, DialogContext, ParseDialog, RegisterDialogAction, RegisterDialogCondition, TestCondition } from "./DialogScript";
import QuestLog from "./Quests";

const check = { quests: ["rats", "smith"] };

function Context(): DialogContext & { rewards: unknown[] } {
    const quests = new QuestLog();
    quests.Reset([{ id: "rats", name: "RATS", goal: { kind: "kill" } }], { Marked: () => 0 });
    const rewards: unknown[] = [];
    return { quests, flags: new Set<string>(), rewards, Reward: (value, sprite) => rewards.push({ value, sprite }) };
}

describe("ParseDialog", () => {
    it("reads lines said, with and without a name", () => {
        const { script, errors } = ParseDialog("OLD MINER: Rats!\n  The cellar's dark.  \n");
        expect(errors).toEqual([]);
        expect(script.steps).toEqual([
            { kind: "say", line: 1, speaker: "OLD MINER", text: "Rats!" },
            { kind: "say", line: 2, speaker: "", text: "The cellar's dark." }
        ]);
    });

    it("skips blank lines and comments", () => {
        const { script } = ParseDialog("# who\n\nMINER: Hi # waves\n");
        expect(script.steps).toEqual([{ kind: "say", line: 3, speaker: "MINER", text: "Hi" }]);
    });

    it("reads parts, each ending the talk where the next starts", () => {
        const { script, errors } = ParseDialog("A: one\nnext:\nA: two\n");
        expect(errors).toEqual([]);
        expect(script.parts).toEqual({ next: 2 });
        expect(script.steps[1]).toEqual({ kind: "end", line: 2 });
    });

    it("gathers choices one after another into one menu, with where each goes and when it's offered", () => {
        const { script, errors } = ParseDialog("A: Well?\n> Yes -> yes\n> Rats? -> yes if rats active\n> No\nyes:\nA: Good.");
        expect(errors).toEqual([]);
        expect(script.steps[1]).toEqual({
            kind: "choices",
            line: 2,
            choices: [
                { line: 2, text: "Yes", target: "yes", condition: null },
                { line: 3, text: "Rats?", target: "yes", condition: { name: "quest", data: { id: "rats", state: "active" }, not: false } },
                { line: 4, text: "No", target: null, condition: null }
            ]
        });
    });

    it("reads jumps, ends and ifs", () => {
        const { script, errors } = ParseDialog("if not met -> hello\nif rats complete -> end\n-> end\nend\nhello:\n-> hello");
        expect(errors).toEqual([]);
        expect(script.steps.slice(0, 4)).toEqual([
            { kind: "goto", line: 1, target: "hello", condition: { name: "flag", data: "met", not: true } },
            { kind: "goto", line: 2, target: "end", condition: { name: "quest", data: { id: "rats", state: "complete" }, not: false } },
            { kind: "end", line: 3 },
            { kind: "end", line: 4 }
        ]);
    });

    it("reads actions", () => {
        const { script, errors } = ParseDialog("give rats\ncomplete smith\nfinish rats\nreward gold 50\nreward key 2 key_gold\nreward item potion\nset met\nunset met", check);
        expect(errors).toEqual([]);
        expect(script.steps.map(step => (step.kind === "action" ? [step.name, step.data] : step.kind))).toEqual([
            ["give", "rats"],
            ["complete", "smith"],
            ["finish", "rats"],
            ["reward", { value: { kind: "gold", amount: 50 }, sprite: null }],
            ["reward", { value: { kind: "key", id: 2 }, sprite: "key_gold" }],
            ["reward", { value: { kind: "item", sprite: "potion" }, sprite: null }],
            ["set", "met"],
            ["unset", "met"]
        ]);
    });

    it("says what's wrong with a line, by its number, and leaves the line out", () => {
        const { script, errors } = ParseDialog(
            ["give rat", "-> nowhere", "if rats asleep -> a", "reward gold lots", "a:", "a:", "end:", "> -> a", "if rats complete", "> Go -> a then"].join("\n"),
            check
        );
        expect(DescribeDialogErrors(errors)).toEqual([
            'Line 1: There\'s no quest called "rat".',
            'Line 2: There\'s no part called "nowhere" to go to.',
            'Line 3: A quest is none, active, complete, finished - not "asleep".',
            'Line 4: "reward gold" needs how much, like "reward gold 10".',
            'Line 6: There\'s already a part called "a".',
            'Line 7: "end" can\'t be a part\'s name: "-> end" ends the talk.',
            "Line 8: A choice needs something for the player to say, like \"> Yes -> accept\".",
            "Line 9: \"if\" needs where to go, like \"if rats complete -> thanks\".",
            'Line 10: Only "if ..." can come after where a choice goes, not "then".'
        ]);
        expect(script.steps.map(step => step.kind)).toEqual(["goto", "end"]);
    });

    it("takes any quest's id when it isn't told the level's", () => {
        expect(ParseDialog("give anything").errors).toEqual([]);
    });

    it("can be given more actions and conditions", () => {
        RegisterDialogAction("shout", { Parse: words => ({ data: words.join(" ") }), Run: (data, context) => context.flags.add("shouted " + data) });
        RegisterDialogCondition("shouted", { Parse: words => ({ data: words.join(" ") }), Test: (data, context) => context.flags.has("shouted " + data) });
        const { script, errors } = ParseDialog("shout hey there\nif shouted hey there -> end");
        expect(errors).toEqual([]);
        const step = script.steps[1];
        const condition = step.kind === "goto" ? step.condition! : null!;
        const context = Context();
        expect(TestCondition(condition, context)).toBe(false);
        context.flags.add("shouted hey there");
        expect(TestCondition(condition, context)).toBe(true);
    });
});
