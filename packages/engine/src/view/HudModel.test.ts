import { describe, expect, it } from "vitest";
import type { QuestState, QuestStatus } from "../story/Quests";
import { CutToFit, JournalLines, OutOf, WeaponName } from "./HudModel";

describe("OutOf", () => {
    it("writes a count out of a most", () => {
        expect(OutOf(48, 60)).toBe("48 / 60");
    });

    it("never writes less than nothing", () => {
        expect(OutOf(-2, 6)).toBe("0 / 6");
    });
});

describe("WeaponName", () => {
    it("is the weapon's own name, if it has one", () => {
        expect(WeaponName({ name: "Old Faithful", icon: "weapon_bow" })).toBe("OLD FAITHFUL");
    });

    it("is read from its icon's sprite name otherwise", () => {
        expect(WeaponName({ icon: "weapon_red_gem_sword" })).toBe("RED GEM SWORD");
        expect(WeaponName({ icon: "bow" })).toBe("BOW");
    });
});

describe("CutToFit", () => {
    // Each letter one wide.
    const measure = (text: string) => text.length;

    it("leaves text that fits as it is", () => {
        expect(CutToFit("SWORD MASTER", 12, measure)).toBe("SWORD MASTER");
    });

    it("cuts the rest off, with two dots, and no space before them", () => {
        expect(CutToFit("ELVEN HUNTRESS", 10, measure)).toBe("ELVEN HU..");
        expect(CutToFit("ELVEN HUNTRESS", 8, measure)).toBe("ELVEN..");
    });

    it("keeps a letter, however narrow the room", () => {
        expect(CutToFit("WITCH", 0, measure)).toBe("W..");
    });
});

describe("JournalLines", () => {
    const quest = (id: string, state: QuestState, progress = 0, target = 1, note: string | null = null): QuestStatus => ({
        def: { id, name: id.toUpperCase(), text: "do " + id, goal: { kind: "collect" } },
        state,
        progress,
        target,
        note
    });

    it("leaves out quests not given yet", () => {
        expect(JournalLines([quest("a", "none")], null)).toEqual([]);
    });

    it("puts the one being followed first, then the rest under way, then those done", () => {
        const quests = [quest("a", "complete"), quest("b", "active"), quest("c", "active"), quest("d", "finished")];
        const lines = JournalLines(quests, "c");
        expect(lines.map(line => line.id + ":" + line.mark)).toEqual(["c:current", "b:open", "a:done", "d:done"]);
    });

    it("follows the first under way when the one named isn't", () => {
        const quests = [quest("a", "complete"), quest("b", "active"), quest("c", "active")];
        expect(JournalLines(quests, "a")[0].id).toBe("b");
        expect(JournalLines(quests, null)[0].id).toBe("b");
    });

    it("counts progress toward a goal of more than one, until it's done", () => {
        const lines = JournalLines([quest("a", "active", 2, 3), quest("b", "active"), quest("c", "complete", 3, 3)], "a");
        expect(lines.map(line => line.progress)).toEqual(["2/3", "", ""]);
    });

    it("carries what to do and the last note", () => {
        const line = JournalLines([quest("a", "active", 0, 1, "Try the well")], null)[0];
        expect(line.text).toBe("do a");
        expect(line.note).toBe("Try the well");
    });
});
