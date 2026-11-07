/**
 * What the HUD shows, worked out apart from drawing it: what a weapon is called, how hit points and experience
 * read, and the quest journal's lines. Pure - no pixi - so it runs under the plain node test runner.
 */

import type { QuestStatus } from "../story/Quests";

/** Slots in each of the HUD's rows - the spells and the inventory. */
export const HudSlots = 5;

/** A count out of a most, as the HUD writes it: "48 / 60". */
export function OutOf(value: number, max: number): string {
    return Math.max(0, Math.round(value)) + " / " + Math.max(0, Math.round(max));
}

/** What the HUD calls a weapon: its own `name`, or its icon's sprite name made readable - "weapon_red_gem_sword" is RED GEM SWORD. */
export function WeaponName(weapon: { name?: string; icon: string }): string {
    const name = weapon.name || weapon.icon.replace(/^weapon_/, "").replace(/_/g, " ");
    return name.trim().toUpperCase();
}

/** `text`, cut short with ".." where it would run past `room` - as `measure` sizes it - or as it is, if it fits. */
export function CutToFit(text: string, room: number, measure: (text: string) => number): string {
    if (measure(text) <= room) {
        return text;
    }
    let cut = text;
    while (cut.length > 1 && measure(cut + "..") > room) {
        cut = cut.slice(0, -1);
    }
    return cut.replace(/\s+$/, "") + "..";
}

/** How a quest is marked in the journal: the one being followed (a "!"), one under way (an empty box), or one done (a ticked box). */
export type JournalMark = "current" | "open" | "done";

export type JournalLine = {
    id: string;
    name: string;
    mark: JournalMark;
    /** How far it has got, "2/3" - empty for one that is all or nothing, or done. */
    progress: string;
    /** What to do, and the last note a dialog gave it - shown under the quest being followed. */
    text: string;
    note: string | null;
};

/**
 * The quest journal's lines: the quest being followed first, then the rest under way, then those done - each lot in
 * the level's order. Quests not given yet aren't in it. `current` is the id of the one being followed - the last one
 * given or moved on (see `Hud`); when that isn't under way, the first under way is.
 */
export function JournalLines(quests: ReadonlyArray<Readonly<QuestStatus>>, current: string | null): JournalLine[] {
    const open = quests.filter(quest => quest.state === "active");
    const done = quests.filter(quest => quest.state === "complete" || quest.state === "finished");
    const followed = open.filter(quest => quest.def.id === current)[0] || open[0];
    const line = (quest: Readonly<QuestStatus>, mark: JournalMark): JournalLine => ({
        id: quest.def.id,
        name: quest.def.name,
        mark,
        progress: mark !== "done" && quest.target > 1 ? quest.progress + "/" + quest.target : "",
        text: quest.def.text || "",
        note: quest.note
    });
    const lines: JournalLine[] = followed ? [line(followed, "current")] : [];
    open.filter(quest => quest !== followed).forEach(quest => lines.push(line(quest, "open")));
    done.forEach(quest => lines.push(line(quest, "done")));
    return lines;
}
