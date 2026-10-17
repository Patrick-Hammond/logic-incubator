/**
 * How one of a level's quests is edited in the `FormDialog` popup the quest list opens (see `QuestsDialog`):
 * its fields, and how a quest converts to and from the dialog's flat form values. The goal kinds offered are
 * whatever `QuestGoalKinds` has - a game's own registered kinds among them, started from their `Default()` and
 * kept as they are, since only collect's and kill's fields are known here.
 *
 * No pixi and no DOM - monster pictures come in through `QuestImages` - so it runs under the plain node test
 * runner (see QuestEditor.test.ts).
 */

import MonsterRoster, { MonsterType } from "@logic-incubator/engine/level/entities/MonsterRoster";
import { IsQuestId, QuestDef, QuestGoal, QuestGoalFor, QuestGoalKinds } from "@logic-incubator/engine/story/Quests";
import { ChoiceOption, FieldSpec, FormValues } from "./ui/dialog/FormDialog";

/** A picture of the monster for its chip, or undefined to show just its name. */
export type QuestImages = { monster: (type: MonsterType) => ChoiceOption["image"] | undefined };

/** The goals that count things - and so have a count. */
const Counted = (form: FormValues) => form.goal === "collect" || form.goal === "kill";

/** The quest form's fields. */
export function QuestFields(images: QuestImages): FieldSpec[] {
    return [
        { type: "text", key: "name", label: "Name", placeholder: "RATS IN THE CELLAR", hint: "What the player sees it called." },
        { type: "text", key: "text", label: "What to do", placeholder: "Clear the rats out of the cellar.", hint: "Under its name in the quest tracker. Optional." },
        {
            type: "text",
            key: "id",
            label: "Id",
            placeholder: "rats",
            hint: "What pickups, bosses and dialog scripts name it by (give rats). One word: letters, digits, - and _. Change it and they'll need changing too."
        },
        {
            type: "choice",
            key: "goal",
            label: "Goal",
            options: QuestGoalKinds().map(kind => ({ value: kind, label: QuestGoalFor(kind)!.label }))
        },
        {
            type: "number",
            key: "count",
            label: "How many",
            min: 0,
            max: 999,
            sliderMax: 30,
            zeroLabel: "every one marked",
            hint: "Collect counts the pickups marked for this quest; kill the bosses marked for it.",
            visibleWhen: Counted
        },
        {
            type: "choice",
            key: "monster",
            label: "Or kill any",
            options: [{ value: "", label: "Only those marked" } as ChoiceOption].concat(
                MonsterRoster.inst.Types.map(type => ({ value: type, label: type.replace(/_/g, " "), image: images.monster(type) }))
            ),
            hint: "Monsters of this type count too, once the quest is under way - set How many with it.",
            visibleWhen: form => form.goal === "kill"
        },
        {
            type: "toggle",
            key: "start",
            label: "Under way from the start",
            hint: "The level's own quest - the way to have one in co-op or online, where there are no dialogs. Otherwise an NPC's script gives it (give rats)."
        },
        { type: "toggle", key: "ends", label: "Completing it clears the level", hint: "As reaching a way out does - kill the final boss." }
    ];
}

/** A quest's values for `QuestFields`. */
export function QuestToForm(quest: QuestDef): FormValues {
    const goal = quest.goal;
    return {
        id: quest.id,
        name: quest.name,
        text: quest.text || "",
        goal: goal.kind,
        count: typeof goal.count === "number" ? goal.count : 0,
        monster: typeof goal.monster === "string" ? goal.monster : "",
        start: quest.start === true,
        ends: quest.ends === true
    };
}

/** The quest `QuestFields` were set to. `was` is the quest before - a goal of a kind not known here keeps what it had. */
export function QuestFromForm(form: FormValues, was: QuestDef): QuestDef {
    const kind = String(form.goal);
    const type = QuestGoalFor(kind);
    const base: QuestGoal = was.goal.kind === kind ? { ...was.goal } : type ? type.Default() : { kind };
    if (kind === "collect" || kind === "kill") {
        const count = Math.max(0, Math.round(Number(form.count)));
        delete base.count;
        if (count) {
            base.count = count;
        }
    }
    if (kind === "kill") {
        const monster = String(form.monster || "");
        delete base.monster;
        if (monster) {
            base.monster = monster;
        }
    }
    const quest: QuestDef = { id: String(form.id).trim(), name: String(form.name).trim(), goal: base };
    const text = String(form.text || "").trim();
    if (text) {
        quest.text = text;
    }
    if (form.start === true) {
        quest.start = true;
    }
    if (form.ends === true) {
        quest.ends = true;
    }
    return quest;
}

/** What's wrong with the quest form, if anything - `others` are the level's other quests, whose ids it can't share. */
export function QuestProblem(form: FormValues, others: ReadonlyArray<QuestDef>): string | null {
    const id = String(form.id).trim();
    if (!String(form.name).trim()) {
        return "Give the quest a name.";
    }
    if (!IsQuestId(id)) {
        return id ? "The id is one word: letters, digits, - and _." : "Give the quest an id.";
    }
    if (others.some(quest => quest.id === id)) {
        return `Another quest is “${id}”.`;
    }
    if (form.goal === "kill" && form.monster && !MonsterRoster.inst.Has(String(form.monster))) {
        return "Pick a monster, or Only those marked.";
    }
    return null;
}

/** An id none of `quests` has, for a new one: quest1, quest2... */
export function NewQuestId(quests: ReadonlyArray<QuestDef>): string {
    let n = 1;
    while (quests.some(quest => quest.id === "quest" + n)) {
        n++;
    }
    return "quest" + n;
}

/** A quest in a few words, for its row in the list: "rats · collect 5 · from the start · ends the level". */
export function DescribeQuest(quest: QuestDef): string {
    const goal = quest.goal;
    const type = QuestGoalFor(goal.kind);
    let what = type ? type.label.toLowerCase() : goal.kind;
    if (goal.kind === "collect" || goal.kind === "kill") {
        what += typeof goal.count === "number" && goal.count ? " " + goal.count : " every one marked";
        if (typeof goal.monster === "string" && goal.monster) {
            what += " or any " + goal.monster.replace(/_/g, " ");
        }
    }
    const parts = [quest.id, what];
    if (quest.start) {
        parts.push("from the start");
    }
    if (quest.ends) {
        parts.push("ends the level");
    }
    return parts.join(" · ");
}
