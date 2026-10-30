import { describe, expect, it } from "vitest";
import { DialogContext, ParseDialog } from "./DialogScript";
import QuestLog from "./Quests";
import { BesideNpc, BumpedNpc, IsDialogValue, SaysAnything, TalkCountdown, TalkDotSeconds, TalkDots } from "./Talk";

const T = 16;
const npcAt = (cx: number, cy: number) => (x: number, y: number) => x === cx && y === cy;

describe("Talk", () => {
    it("knows a dialog brush's value", () => {
        expect(IsDialogValue({ script: "A: hi" })).toBe(true);
        expect(IsDialogValue({ script: 3 })).toBe(false);
        expect(IsDialogValue(null)).toBe(false);
    });

    it("finds the NPC a hero standing against it walks into, whichever way", () => {
        // The hero's box is just left of the NPC's cell (3, 1), up against it.
        expect(BumpedNpc({ x: 2 * T, y: T }, { x: 1, y: 0 }, npcAt(3, 1), T)).toEqual({ x: 3, y: 1 });
        expect(BumpedNpc({ x: 4 * T, y: T }, { x: -1, y: 0 }, npcAt(3, 1), T)).toEqual({ x: 3, y: 1 });
        expect(BumpedNpc({ x: 3 * T, y: 2 * T }, { x: 0, y: -0.7 }, npcAt(3, 1), T)).toEqual({ x: 3, y: 1 });
    });

    it("finds none walking away, standing still, or a step short of it", () => {
        expect(BumpedNpc({ x: 2 * T, y: T }, { x: -1, y: 0 }, npcAt(3, 1), T)).toBeNull();
        expect(BumpedNpc({ x: 2 * T, y: T }, { x: 0.1, y: 0 }, npcAt(3, 1), T)).toBeNull();
        expect(BumpedNpc({ x: T, y: T }, { x: 1, y: 0 }, npcAt(3, 1), T)).toBeNull();
    });
});

describe("staying by an NPC", () => {
    it("holds against them, along their side, and half a tile back", () => {
        // Up against the NPC on (3, 1), from either side, above, and diagonally off a corner.
        expect(BesideNpc({ x: 2 * T, y: T }, { x: 3, y: 1 }, T)).toBe(true);
        expect(BesideNpc({ x: 4 * T, y: T }, { x: 3, y: 1 }, T)).toBe(true);
        expect(BesideNpc({ x: 3 * T, y: 0 }, { x: 3, y: 1 }, T)).toBe(true);
        expect(BesideNpc({ x: 2 * T, y: 1.5 * T }, { x: 3, y: 1 }, T)).toBe(true);
        expect(BesideNpc({ x: 2 * T - 7, y: T }, { x: 3, y: 1 }, T)).toBe(true);
    });

    it("ends half a tile away, or walked on past them", () => {
        expect(BesideNpc({ x: 2 * T - 8, y: T }, { x: 3, y: 1 }, T)).toBe(false);
        expect(BesideNpc({ x: 4 * T + 8, y: T }, { x: 3, y: 1 }, T)).toBe(false);
        expect(BesideNpc({ x: 2 * T, y: 2.5 * T }, { x: 3, y: 1 }, T)).toBe(false);
    });
});

describe("whether a talk says anything", () => {
    function Context(): DialogContext {
        const quests = new QuestLog();
        quests.Reset([{ id: "rats", name: "RATS", goal: { kind: "collect" } }], { Marked: () => 1 });
        return { quests, flags: new Set<string>(), Reward: () => undefined };
    }
    const Says = (lines: string[], context = Context()) => {
        const { script, errors } = ParseDialog(lines.join("\n"), { quests: ["rats"] });
        expect(errors).toEqual([]);
        return SaysAnything(script, context);
    };

    it("finds a line said, past actions and through the jumps that hold - running none of them", () => {
        const context = Context();
        expect(Says(["give rats", "MINER: Rats!"], context)).toBe(true);
        expect(context.quests.State("rats")).toBe("none");
        expect(Says(["if rats active -> waiting", "end", "waiting:", "MINER: Still squeaking."])).toBe(false);
        expect(Says(["if not rats active -> hello", "end", "hello:", "MINER: Hello."])).toBe(true);
    });

    it("finds none in a script that's all shout part, or only actions", () => {
        expect(Says(["shout:", "Help!"])).toBe(false);
        expect(Says(["give rats"])).toBe(false);
        expect(Says(["-> end", "MINER: Never said."])).toBe(false);
    });
});

describe("the countdown to a talk", () => {
    const Count = (countdown: TalkCountdown, seconds: number, beside = true) => {
        let due = null;
        for (let t = 0; t < seconds - 1e-9 && !due; t += 0.1) {
            due = countdown.Update(0.1, beside);
        }
        return due;
    };

    it("counts up a dot a second, and the talk is due a second after the third", () => {
        expect(TalkDots * TalkDotSeconds).toBe(3);
        const countdown = new TalkCountdown();
        expect(countdown.Dots).toBe(0);
        countdown.Begin(0, { x: 3, y: 1 });
        expect(countdown.Dots).toBe(1);
        expect(Count(countdown, 0.95)).toBeNull();
        expect(countdown.Dots).toBe(1);
        expect(Count(countdown, 0.1)).toBeNull();
        expect(countdown.Dots).toBe(2);
        expect(Count(countdown, 1)).toBeNull();
        expect(countdown.Dots).toBe(3);
        expect(Count(countdown, 1)).toEqual({ hero: 0, x: 3, y: 1 });
        expect(countdown.Waiting).toBeNull();
        expect(countdown.Dots).toBe(0);
    });

    it("is called off by walking away, and starts over on walking back", () => {
        const countdown = new TalkCountdown();
        countdown.Begin(0, { x: 3, y: 1 });
        Count(countdown, 2);
        expect(countdown.Update(0.1, false)).toBeNull();
        expect(countdown.Waiting).toBeNull();
        expect(countdown.Update(5, true)).toBeNull();
        countdown.Begin(0, { x: 3, y: 1 });
        expect(countdown.Dots).toBe(1);
    });

    it("carries on as the same hero walks into the same NPC again, and starts over for another", () => {
        const countdown = new TalkCountdown();
        countdown.Begin(0, { x: 3, y: 1 });
        Count(countdown, 1.5);
        countdown.Begin(0, { x: 3, y: 1 });
        expect(countdown.Dots).toBe(2);
        countdown.Begin(0, { x: 5, y: 1 });
        expect(countdown.Dots).toBe(1);
        expect(countdown.Waiting).toMatchObject({ hero: 0, x: 5, y: 1 });
        countdown.Cancel();
        expect(countdown.Waiting).toBeNull();
    });
});
