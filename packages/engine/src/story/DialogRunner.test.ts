import { describe, expect, it } from "vitest";
import DialogRunner from "./DialogRunner";
import { DialogContext, ParseDialog } from "./DialogScript";
import QuestLog from "./Quests";

const Miner = [
    "if rats finished -> after",
    "if rats complete -> thanks",
    "if rats active -> waiting",
    "MINER: Rats! The cellar's crawling with them.",
    "> I'll clear them out. -> accept",
    "> Not now.",
    "MINER: Suit yourself.",
    "",
    "accept:",
    "give rats",
    "MINER: Good. Mind the big one.",
    "",
    "waiting:",
    "MINER: Still squeaking down there...",
    "",
    "thanks:",
    "finish rats",
    "reward gold 50",
    "MINER: You did it! Here, for your trouble.",
    "",
    "after:",
    "MINER: Quiet as a tomb now."
].join("\n");

function Talk(text: string) {
    const quests = new QuestLog();
    quests.Reset([{ id: "rats", name: "RATS", goal: { kind: "kill" } }], { Marked: () => 1 });
    const rewards: unknown[] = [];
    const context: DialogContext = { quests, flags: new Set<string>(), Reward: (value, sprite) => rewards.push({ value, sprite }) };
    const { script, errors } = ParseDialog(text, { quests: ["rats"] });
    expect(errors).toEqual([]);
    return { runner: new DialogRunner(script, context), quests, rewards, context };
}

describe("DialogRunner", () => {
    it("says each line in turn, then ends", () => {
        const { runner } = Talk("A: one\ntwo");
        expect(runner.Start()).toEqual({ speaker: "A", text: "one", choices: [] });
        expect(runner.Next()).toEqual({ speaker: "", text: "two", choices: [] });
        expect(runner.Next()).toBeNull();
        expect(runner.Ended).toBe(true);
        expect(runner.Next()).toBeNull();
    });

    it("offers choices under the line before them, and goes where the one picked leads", () => {
        const { runner, quests } = Talk(Miner);
        expect(runner.Start()).toEqual({ speaker: "MINER", text: "Rats! The cellar's crawling with them.", choices: ["I'll clear them out.", "Not now."] });
        // It waits for a choice.
        expect(runner.Next()!.choices.length).toBe(2);
        expect(runner.Choose(0)).toEqual({ speaker: "MINER", text: "Good. Mind the big one.", choices: [] });
        expect(quests.State("rats")).toBe("active");
        expect(runner.Next()).toBeNull();
    });

    it("carries on after the menu for a choice that goes nowhere", () => {
        const { runner, quests } = Talk(Miner);
        runner.Start();
        expect(runner.Choose(1)!.text).toBe("Suit yourself.");
        expect(runner.Next()).toBeNull();
        expect(quests.State("rats")).toBe("none");
    });

    it("goes its own way as the quest goes on - and hands over the reward once", () => {
        const { runner, quests, rewards } = Talk(Miner);
        quests.Give("rats");
        expect(runner.Start()!.text).toBe("Still squeaking down there...");
        quests.Record({ kind: "kill", quest: "rats", monster: "rat" });
        expect(runner.Start()!.text).toBe("You did it! Here, for your trouble.");
        expect(quests.State("rats")).toBe("finished");
        expect(rewards).toEqual([{ value: { kind: "gold", amount: 50 }, sprite: null }]);
        expect(runner.Start()!.text).toBe("Quiet as a tomb now.");
        expect(rewards.length).toBe(1);
    });

    it("offers only the choices whose condition holds - and with none, carries on", () => {
        const { runner, context } = Talk("A: Hm?\n> Hello -> end if not met\n> Again -> end if met\nA: Bye.");
        expect(runner.Start()!.choices).toEqual(["Hello"]);
        context.flags.add("met");
        expect(runner.Start()!.choices).toEqual(["Again"]);
        const { runner: lone } = Talk("A: Hm?\n> Only once -> end if met\nA: Bye.");
        expect(lone.Start()!.choices).toEqual([]);
        expect(lone.Next()!.text).toBe("Bye.");
    });

    it("remembers what's set for the next talk", () => {
        const { runner } = Talk("if met -> again\nset met\nA: Hello, stranger.\nagain:\nA: You again.");
        expect(runner.Start()!.text).toBe("Hello, stranger.");
        expect(runner.Next()).toBeNull();
        expect(runner.Start()!.text).toBe("You again.");
    });

    it("shows choices that come after an action with the last line said", () => {
        const { runner } = Talk("A: Pick one.\nset asked\n> This -> end\n> That -> end");
        expect(runner.Start()).toEqual({ speaker: "A", text: "Pick one.", choices: [] });
        expect(runner.Next()).toEqual({ speaker: "A", text: "Pick one.", choices: ["This", "That"] });
    });

    it("ends a script that says nothing, or goes round in a circle", () => {
        expect(Talk("give rats").runner.Start()).toBeNull();
        expect(Talk("a:\n-> a").runner.Start()).toBeNull();
    });
});
