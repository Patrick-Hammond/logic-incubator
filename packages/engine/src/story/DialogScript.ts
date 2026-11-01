/**
 * NPC dialog scripts: what a `DIALOG` brush's NPC says, as its author types it into the editor's script box -
 * lines said, choices for the player, quests given and handed in, rewards. `ParseDialog` reads one; a
 * `DialogRunner` plays it. For example:
 *
 *     # The miner, at the cellar door.
 *     if rats finished -> after
 *     if rats complete -> thanks
 *     if rats active -> waiting
 *     MINER: Rats! The cellar's crawling with them.
 *     > I'll clear them out. -> accept
 *     > Not now.
 *
 *     accept:
 *     give rats
 *     MINER: Good. Mind the big one.
 *
 *     waiting:
 *     MINER: Still squeaking down there...
 *
 *     thanks:
 *     finish rats
 *     reward gold 50
 *     MINER: You did it! Here, for your trouble.
 *
 *     after:
 *     MINER: Quiet as a tomb down there now.
 *
 * A script is read a line at a time, top to bottom:
 * - `name:` starts a part of the talk, which `-> name` goes to. The talk starts at the top, and reaching the end of a part ends it.
 * - `WHO: text` is a line said, headed with who says it; a line of plain text is said with no name.
 * - `> text -> name` is a choice for the player, offered under the line said before it - the choices one after another make one
 *   menu. Without `-> name` it carries on after the menu; with `if CONDITION` at the end it's only offered when that holds.
 * - `-> name` goes there, and `-> end` (or `end`) ends the talk; `if CONDITION -> name` goes there only when it holds.
 * - A condition is a quest's id and a state - `rats active`, `rats complete` (see `QuestState`) - or a word a `set` has set; `not`
 *   before it turns it round.
 * - The rest are actions: `give QUEST`, `complete QUEST` (its goal met, whatever it was), `finish QUEST` (handed in), `notify QUEST text`
 *   (a hint or a comment on the quest, shown to the player), `reward gold N`, `reward health N` (half-hearts), `reward key N [SPRITE]`,
 *   `reward item SPRITE`, `set WORD` and `unset WORD`.
 * - `#` starts a comment; blank lines are skipped.
 * - A part called `shout` isn't part of the talk: it's what the NPC calls out when a hero comes near (see `Shouts`).
 *
 * More actions and conditions can be added with `RegisterDialogAction` and `RegisterDialogCondition`. Pure - no pixi - so it runs
 * under the plain node test runner.
 */

import type { PickupValue } from "../level/entities/Pickups";
import QuestLog, { QuestState, QuestStates } from "./Quests";

/** What a talk can change, as a `DialogRunner` plays it: the level's quests, the words its scripts have `set`, and the hero talking. */
export interface DialogContext {
    readonly quests: QuestLog;
    /** What scripts have `set` - remembered for the rest of the level. */
    readonly flags: Set<string>;
    /** Hands the hero something, as if they'd picked it up - `sprite` is the picture a key is shown as (see `CollectedPickup`). */
    Reward(value: PickupValue, sprite: string | null): void;
}

/** What a script is read against: the ids of the level's quests, to catch one misspelt - none given, any id goes. */
export type DialogCheck = { quests?: ReadonlyArray<string> };

/** What reading an action's or condition's words makes: what it runs with, or why it can't be read - a sentence a script's author can act on. */
export type DialogParse = { data: unknown } | { error: string };

/** One kind of action - `give`, `reward` - by its first word. */
export type DialogActionType = {
    /** Reads the words after its name. */
    Parse(words: ReadonlyArray<string>, check: DialogCheck): DialogParse;
    Run(data: unknown, context: DialogContext): void;
};

/** One kind of condition, by its first word - for anything beyond a quest's state and a word `set`. */
export type DialogConditionType = {
    Parse(words: ReadonlyArray<string>, check: DialogCheck): DialogParse;
    Test(data: unknown, context: DialogContext): boolean;
};

export type DialogCondition = { name: string; data: unknown; not: boolean };

export type DialogChoice = { line: number; text: string; target: string | null; condition: DialogCondition | null };

/** One step of a script, as read: `line` is where it was, from 1. */
export type DialogStep =
    | { kind: "say"; line: number; speaker: string; text: string }
    | { kind: "choices"; line: number; choices: DialogChoice[] }
    | { kind: "goto"; line: number; target: string; condition: DialogCondition | null }
    | { kind: "action"; line: number; name: string; data: unknown }
    | { kind: "end"; line: number };

/** A script, read: its steps, and where each part starts (an index into them). */
export type DialogScript = { steps: DialogStep[]; parts: { [name: string]: number } };

/** Something wrong with a line of a script: which, from 1, and what. */
export type DialogError = { line: number; message: string };

/** Where `-> end` goes. */
export const EndTarget = "end";
/** The part an NPC shouts from (see `Shouts`) - a talk never runs into it, even from the top. */
export const ShoutPart = "shout";

const actions: { [name: string]: DialogActionType } = {};
const conditions: { [name: string]: DialogConditionType } = {};

/** Adds an action scripts can use - by `name`, the first word of its line - or replaces one. */
export function RegisterDialogAction(name: string, type: DialogActionType): void {
    actions[name] = type;
}

/** Adds a condition scripts can use - by `name`, the first word after `if` - or replaces one. */
export function RegisterDialogCondition(name: string, type: DialogConditionType): void {
    conditions[name] = type;
}

function Own<T>(table: { [name: string]: T }, name: string): T | undefined {
    return Object.prototype.hasOwnProperty.call(table, name) ? table[name] : undefined;
}

/** Reads a quest's id, the only word after an action's name. */
function QuestWord(action: string, words: ReadonlyArray<string>, check: DialogCheck): DialogParse {
    if (words.length !== 1) {
        return { error: `"${action}" needs a quest's id, like "${action} rats".` };
    }
    return KnownQuest(words[0], check);
}

function KnownQuest(id: string, check: DialogCheck): DialogParse {
    if (check.quests && check.quests.indexOf(id) < 0) {
        return { error: `There's no quest called "${id}".` };
    }
    return { data: id };
}

const Whole = (word: string | undefined): number | null => (word !== undefined && /^\d+$/.test(word) ? parseInt(word, 10) : null);

RegisterDialogAction("give", {
    Parse: (words, check) => QuestWord("give", words, check),
    Run: (id, context) => void context.quests.Give(id as string)
});
RegisterDialogAction("complete", {
    Parse: (words, check) => QuestWord("complete", words, check),
    Run: (id, context) => void context.quests.Complete(id as string)
});
RegisterDialogAction("finish", {
    Parse: (words, check) => QuestWord("finish", words, check),
    Run: (id, context) => void context.quests.Finish(id as string)
});
RegisterDialogAction("notify", {
    Parse: (words, check) => {
        if (words.length < 2) {
            return { error: `"notify" needs a quest's id and what to tell the player, like "notify rats The big one hides by the barrels."` };
        }
        const quest = KnownQuest(words[0], check);
        return "error" in quest ? quest : { data: { id: words[0], text: words.slice(1).join(" ") } };
    },
    Run: (data, context) => {
        const note = data as { id: string; text: string };
        context.quests.Notify(note.id, note.text);
    }
});
RegisterDialogAction("reward", {
    Parse: words => {
        const kind = words[0];
        const amount = Whole(words[1]);
        switch (kind) {
            case "gold":
            case "health":
                return amount !== null && words.length === 2 ? { data: { value: { kind, amount }, sprite: null } } : { error: `"reward ${kind}" needs how much, like "reward ${kind} 10".` };
            case "key":
                return amount !== null && words.length <= 3
                    ? { data: { value: { kind, id: amount }, sprite: words[2] || null } }
                    : { error: `"reward key" needs the lock it opens, like "reward key 1".` };
            case "item":
                return words.length === 2 ? { data: { value: { kind, sprite: words[1] }, sprite: null } } : { error: `"reward item" needs the item's sprite, like "reward item potion_red".` };
            default:
                return { error: `"reward" gives gold, health, a key or an item, like "reward gold 10".` };
        }
    },
    Run: (data, context) => {
        const reward = data as { value: PickupValue; sprite: string | null };
        context.Reward(reward.value, reward.sprite);
    }
});
RegisterDialogAction("set", {
    Parse: words => (words.length === 1 ? { data: words[0] } : { error: `"set" needs one word to remember, like "set met".` }),
    Run: (word, context) => void context.flags.add(word as string)
});
RegisterDialogAction("unset", {
    Parse: words => (words.length === 1 ? { data: words[0] } : { error: `"unset" needs the word to forget, like "unset met".` }),
    Run: (word, context) => void context.flags.delete(word as string)
});

/** Reads the words of a condition: `not` first turns it round; then a registered condition, a quest and a state, or a word `set`. */
function ParseCondition(words: ReadonlyArray<string>, check: DialogCheck): { condition: DialogCondition } | { error: string } {
    const not = words[0] === "not";
    const rest = not ? words.slice(1) : words;
    if (!rest.length) {
        return { error: "\"if\" needs something to check, like \"if rats complete\"." };
    }
    const registered = Own(conditions, rest[0]);
    if (registered) {
        const parsed = registered.Parse(rest.slice(1), check);
        return "error" in parsed ? parsed : { condition: { name: rest[0], data: parsed.data, not } };
    }
    if (rest.length === 2) {
        if (QuestStates.indexOf(rest[1] as QuestState) < 0) {
            return { error: `A quest is ${QuestStates.join(", ")} - not "${rest[1]}".` };
        }
        const quest = KnownQuest(rest[0], check);
        return "error" in quest ? quest : { condition: { name: "quest", data: { id: rest[0], state: rest[1] }, not } };
    }
    if (rest.length === 1) {
        return { condition: { name: "flag", data: rest[0], not } };
    }
    return { error: `Can't read "${words.join(" ")}" - check a quest, like "rats complete", or a word set, like "met".` };
}

/** Whether a condition holds now. */
export function TestCondition(condition: DialogCondition, context: DialogContext): boolean {
    let holds: boolean;
    if (condition.name === "quest") {
        const { id, state } = condition.data as { id: string; state: QuestState };
        holds = context.quests.State(id) === state;
    } else if (condition.name === "flag") {
        holds = context.flags.has(condition.data as string);
    } else {
        const type = Own(conditions, condition.name);
        holds = !!type && type.Test(condition.data, context);
    }
    return condition.not ? !holds : holds;
}

/** Runs an action. */
export function RunAction(step: { name: string; data: unknown }, context: DialogContext): void {
    const type = Own(actions, step.name);
    if (type) {
        type.Run(step.data, context);
    }
}

const PartName = /^[A-Za-z0-9_-]+$/;
/** `WHO: text` - who is a few words, with nothing in them that means something else. */
const Said = /^([^:>#]{1,30}?):\s+(.*\S)\s*$/;

/** Splits `text -> target if condition` - either part may be missing. */
function SplitArrow(text: string): { before: string; target: string | null; after: string } {
    const arrow = text.indexOf("->");
    if (arrow < 0) {
        return { before: text.trim(), target: null, after: "" };
    }
    const tail = text.slice(arrow + 2).trim().split(/\s+/);
    return { before: text.slice(0, arrow).trim(), target: tail[0] || "", after: tail.slice(1).join(" ") };
}

/**
 * Reads a script: its steps, and what's wrong with any of its lines - a line that can't be read is left out, so the rest
 * still plays. `check` names the level's quests, so a misspelt one is caught.
 */
export function ParseDialog(text: string, check: DialogCheck = {}): { script: DialogScript; errors: DialogError[] } {
    const steps: DialogStep[] = [];
    const parts: { [name: string]: number } = {};
    const errors: DialogError[] = [];
    const gotos: Array<{ line: number; target: string }> = [];
    const fail = (line: number, message: string) => errors.push({ line, message });

    const lines = text.split(/\r?\n/);
    lines.forEach((raw, i) => {
        const line = i + 1;
        const hash = raw.indexOf("#");
        const content = (hash >= 0 ? raw.slice(0, hash) : raw).trim();
        if (!content) {
            return;
        }
        const words = content.split(/\s+/);

        if (/^[^\s:]+:$/.test(content)) {
            const name = content.slice(0, -1);
            if (!PartName.test(name)) {
                fail(line, `A part's name is one word of letters, digits, - and _ - not "${name}".`);
            } else if (name === EndTarget) {
                fail(line, `"end" can't be a part's name: "-> end" ends the talk.`);
            } else if (Object.prototype.hasOwnProperty.call(parts, name)) {
                fail(line, `There's already a part called "${name}".`);
            } else {
                // Reaching the end of a part ends the talk - it doesn't run on into the next. A script that starts with
                // what its NPC shouts has no talk before it, rather than starting the talk with the shouts.
                if (steps.length || name === ShoutPart) {
                    steps.push({ kind: "end", line });
                }
                parts[name] = steps.length;
            }
            return;
        }

        if (content.charAt(0) === ">") {
            const { before, target, after } = SplitArrow(content.slice(1));
            if (!before) {
                fail(line, "A choice needs something for the player to say, like \"> Yes -> accept\".");
                return;
            }
            if (target === "") {
                fail(line, "Say where the choice goes after the \"->\", like \"> Yes -> accept\".");
                return;
            }
            let condition: DialogCondition | null = null;
            if (after) {
                const ifWords = after.split(/\s+/);
                if (ifWords[0] !== "if") {
                    fail(line, `Only "if ..." can come after where a choice goes, not "${after}".`);
                    return;
                }
                const parsed = ParseCondition(ifWords.slice(1), check);
                if ("error" in parsed) {
                    fail(line, parsed.error);
                    return;
                }
                condition = parsed.condition;
            }
            if (target) {
                gotos.push({ line, target });
            }
            const choice: DialogChoice = { line, text: before, target, condition };
            const last = steps[steps.length - 1];
            if (last && last.kind === "choices") {
                last.choices.push(choice);
            } else {
                steps.push({ kind: "choices", line, choices: [choice] });
            }
            return;
        }

        if (content.slice(0, 2) === "->" || words[0] === "if") {
            const { before, target, after } = SplitArrow(content);
            const iffy = words[0] === "if";
            if (!target || after) {
                fail(line, iffy ? "\"if\" needs where to go, like \"if rats complete -> thanks\"." : "\"->\" needs one part to go to, like \"-> thanks\", or \"-> end\".");
                return;
            }
            let condition: DialogCondition | null = null;
            if (iffy) {
                const parsed = ParseCondition(before.split(/\s+/).slice(1), check);
                if ("error" in parsed) {
                    fail(line, parsed.error);
                    return;
                }
                condition = parsed.condition;
            } else if (before) {
                fail(line, `Can't read "${content}" - "->" goes at the start of a line, or after a choice or an "if".`);
                return;
            }
            gotos.push({ line, target });
            steps.push(target === EndTarget && !condition ? { kind: "end", line } : { kind: "goto", line, target, condition });
            return;
        }

        if (content === EndTarget) {
            steps.push({ kind: "end", line });
            return;
        }

        const action = Own(actions, words[0]);
        if (action) {
            const parsed = action.Parse(words.slice(1), check);
            if ("error" in parsed) {
                fail(line, parsed.error);
            } else {
                steps.push({ kind: "action", line, name: words[0], data: parsed.data });
            }
            return;
        }

        const said = Said.exec(content);
        steps.push(said ? { kind: "say", line, speaker: said[1].trim(), text: said[2] } : { kind: "say", line, speaker: "", text: content });
    });

    gotos.forEach(({ line, target }) => {
        if (target !== EndTarget && !Object.prototype.hasOwnProperty.call(parts, target)) {
            fail(line, `There's no part called "${target}" to go to.`);
        }
    });
    errors.sort((a, b) => a.line - b.line);
    return { script: { steps, parts }, errors };
}

/** What's wrong with a script, a line each - "Line 4: There's no part called ...". */
export function DescribeDialogErrors(errors: ReadonlyArray<DialogError>): string[] {
    return errors.map(error => `Line ${error.line}: ${error.message}`);
}
