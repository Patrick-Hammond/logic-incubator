import { describe, expect, it } from "vitest";
import DialogRunner from "./DialogRunner";
import { DialogContext, ParseDialog } from "./DialogScript";
import QuestLog from "./Quests";
import Shouter, { HasShouts, InEarshot, ShoutDelay, ShoutGapMax, ShoutGapMin, ShoutLines, ShoutRange, ShoutSeconds } from "./Shouts";

const Brog = [
    "if hoard finished -> after",
    "BROG: Thieves took my gold!",
    "",
    "after:",
    "BROG: Safe home now.",
    "",
    "shout:",
    "if hoard finished -> shout-after",
    "Help, help! Thieves!",
    "give hoard",
    "> A choice no one sees",
    "BROG: Oh dear, where did I put it?!",
    "",
    "shout-after:",
    "Gold, glorious gold."
].join("\n");

function Read(text: string) {
    const quests = new QuestLog();
    quests.Reset([{ id: "hoard", name: "HOARD", goal: { kind: "collect" } }], { Marked: () => 1 });
    const context: DialogContext = { quests, flags: new Set<string>(), Reward: () => undefined };
    const { script, errors } = ParseDialog(text, { quests: ["hoard"] });
    expect(errors).toEqual([]);
    return { script, quests, context };
}

describe("what an NPC shouts", () => {
    it("is every line said in the shout part - not who says it, and passing over actions and choices", () => {
        const { script, quests, context } = Read(Brog);
        expect(HasShouts(script)).toBe(true);
        expect(ShoutLines(script, context)).toEqual(["Help, help! Thieves!", "Oh dear, where did I put it?!"]);
        expect(quests.State("hoard")).toBe("none");
    });

    it("follows the part's ifs, so it changes with the quests", () => {
        const { script, quests, context } = Read(Brog);
        quests.Finish("hoard");
        expect(ShoutLines(script, context)).toEqual(["Gold, glorious gold."]);
    });

    it("is nothing for a script without a shout part", () => {
        const { script, context } = Read("BROG: Hello.");
        expect(HasShouts(script)).toBe(false);
        expect(ShoutLines(script, context)).toEqual([]);
    });

    it("stops at a part that goes round in a circle", () => {
        const { script, context } = Read("shout:\nHey!\n-> shout");
        expect(ShoutLines(script, context).length).toBeLessThanOrEqual(1000);
    });

    it("is kept out of the talk - even when the script starts with it", () => {
        const { script, context } = Read(Brog);
        expect(new DialogRunner(script, context).Start()!.text).toBe("Thieves took my gold!");
        const only = Read("shout:\nHelp, help!");
        expect(new DialogRunner(only.script, only.context).Start()).toBeNull();
        expect(ShoutLines(only.script, only.context)).toEqual(["Help, help!"]);
    });
});

describe("who hears a shout", () => {
    it("is a hero within ShoutRange tiles of the NPC, centre to centre", () => {
        const npc = { x: 10, y: 10 };
        const centre = (tiles: number) => ({ x: 10.5 * 16 + tiles * 16, y: 10.5 * 16 });
        expect(InEarshot(centre(ShoutRange), npc, 16)).toBe(true);
        expect(InEarshot(centre(ShoutRange + 0.1), npc, 16)).toBe(false);
        // Not a square: the corner of one is further than the range.
        expect(InEarshot({ x: 10.5 * 16 + ShoutRange * 16, y: 10.5 * 16 + ShoutRange * 16 }, npc, 16)).toBe(false);
    });
});

describe("a shouter", () => {
    const lines = () => ["Help!", "Over here!", "Anyone?"];
    /** A shouter whose random numbers come from `rolls`, round and round. */
    const make = (rolls: number[] = [0]) => {
        let i = 0;
        return new Shouter(() => rolls[i++ % rolls.length]);
    };

    it("says nothing while no hero is near", () => {
        const shouter = make();
        for (let t = 0; t < 20; t++) {
            expect(shouter.Update(1, false, lines)).toBeNull();
        }
    });

    it("shouts a moment after a hero comes near, keeps it up, then waits before the next", () => {
        const shouter = make([0]);
        shouter.Update(10, false, lines);
        expect(shouter.Update(ShoutDelay / 2, true, lines)).toBeNull();
        expect(shouter.Update(ShoutDelay / 2, true, lines)).toBe("Help!");
        expect(shouter.Fade).toBe(0);
        expect(shouter.Update(0.5, true, lines)).toBe("Help!");
        expect(shouter.Fade).toBe(1);
        expect(shouter.Update(ShoutSeconds("Help!"), true, lines)).toBeNull();
        // The least gap (the rolls are all 0), then the next - not the same line again.
        expect(shouter.Update(ShoutGapMin - 0.01, true, lines)).toBeNull();
        expect(shouter.Update(0.02, true, lines)).toBe("Over here!");
    });

    it("finishes a shout once the hero has gone, and doesn't start another", () => {
        const shouter = make([0.5]);
        shouter.Update(ShoutDelay, true, lines);
        expect(shouter.Text).not.toBeNull();
        expect(shouter.Update(1, false, lines)).not.toBeNull();
        expect(shouter.Update(5, false, lines)).toBeNull();
        expect(shouter.Update(ShoutGapMax + 1, false, lines)).toBeNull();
    });

    it("asks what to shout only as a shout starts, and waits again when there's nothing", () => {
        const shouter = make([0]);
        let asked = 0;
        const none = () => {
            asked++;
            return [];
        };
        shouter.Update(ShoutDelay, true, none);
        expect(asked).toBe(1);
        shouter.Update(ShoutGapMin / 2, true, none);
        expect(asked).toBe(1);
        expect(shouter.Update(ShoutGapMin, true, lines)).toBe("Help!");
    });

    it("hushes at once, and stays quiet a while", () => {
        const shouter = make([0]);
        shouter.Update(ShoutDelay, true, lines);
        shouter.Hush();
        expect(shouter.Text).toBeNull();
        expect(shouter.Update(ShoutGapMin - 0.1, true, lines)).toBeNull();
        expect(shouter.Update(0.2, true, lines)).not.toBeNull();
    });
});
