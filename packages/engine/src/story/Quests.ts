/**
 * Quests: what a level asks of its players. Each has an id - what the level's pickups, bosses and dialog
 * scripts name it by - a name the player sees, and a goal (`QuestGoal`): collect the pickups marked for it,
 * kill the monsters marked for it, or whatever a dialog script says. A level's quests are in its file
 * (`LevelFile.levelData.quests`). One marked `start` is under way as the level starts - a level's own quest,
 * the kind there is in co-op and online, where there are no dialogs; the rest wait to be given by an NPC's
 * dialog (see `DialogScript`). What happens in play - a pickup collected, a monster killed - is `Record`ed in
 * the level's `QuestLog`, and moves on each quest it counts for. More kinds of goal can be added with
 * `RegisterQuestGoal`. Pure - no pixi - so it runs under the plain node test runner.
 */

import type { MonsterType } from "../level/entities/MonsterRoster";
import type { PickupValue } from "../level/entities/Pickups";

/** Where a quest has got to: not given yet, under way, its goal met, and handed in - done with (a dialog's `finish`). */
export type QuestState = "none" | "active" | "complete" | "finished";

/** Every state, in the order a quest goes through them. */
export const QuestStates: ReadonlyArray<QuestState> = ["none", "active", "complete", "finished"];

/** What a quest asks for: its `kind` is a registered goal's (see `QuestGoalKinds`), and the rest is that kind's own. */
export type QuestGoal = { kind: string; [field: string]: unknown };

/** Collect `count` of the pickups marked for the quest (their `quest`) - every one the level has, when left out or 0. */
export type CollectGoal = { kind: "collect"; count?: number };

/**
 * Kill `count` of the monsters marked for the quest (a boss's `quest`) - every one the level has, when left out or 0. With
 * `monster`, monsters of that type count too, once the quest is under way, and `count` is how many.
 */
export type KillGoal = { kind: "kill"; count?: number; monster?: MonsterType };

/** Met only when a dialog script says so (`complete`) - talk to someone, find something out. */
export type ScriptGoal = { kind: "script" };

/** One quest, as a level's file has it. */
export type QuestDef = {
    /** What the level's pickups, bosses and dialog scripts name it by: letters, digits, `-` and `_` (see `IsQuestId`). */
    id: string;
    /** What the player sees it called. */
    name: string;
    /** A line on what to do - under its name in the quest tracker. */
    text?: string;
    goal: QuestGoal;
    /** Under way as the level starts, rather than given by a dialog - a level's own quest, and the way to have one in co-op or online. */
    start?: boolean;
    /** Meeting its goal clears the level, as reaching a way out does - "kill the final boss". */
    ends?: boolean;
};

/** Something that happened in play which a quest may count. `quest` is the quest it was marked for, if any; the rest is the kind's own. */
export type QuestHappening = { kind: string; quest?: string; [field: string]: unknown };

/** A pickup collected (see `World`): what it gave. */
export type CollectHappening = { kind: "collect"; quest?: string; pickup: PickupValue };
/** A monster killed: its type. */
export type KillHappening = { kind: "kill"; quest?: string; monster: MonsterType };

/** What a level has for its quests: how many things of a kind (`collect` - pickups, `kill` - bosses) it marks for a quest. */
export interface QuestLevel {
    Marked(kind: string, quest: string): number;
}

/** One kind of quest goal - how it's counted. Register one with `RegisterQuestGoal`. */
export type QuestGoalType = {
    /** What the editor calls it. */
    label: string;
    /** A new goal of this kind, as the editor starts one. */
    Default(): QuestGoal;
    /** Whether `goal` (its `kind` this one) is well formed. */
    IsValid(goal: QuestGoal): boolean;
    /** How far the quest has to go to be complete: at least 1. `level` says what it has marked for the quest. */
    Target(goal: QuestGoal, quest: QuestDef, level: QuestLevel): number;
    /**
     * How far `happening` takes the quest - 0 for not at all. `active` is whether the quest is under way: a thing marked for
     * it counts before then, so a quest given once its things have all been found is complete at once.
     */
    Advance(goal: QuestGoal, quest: QuestDef, happening: QuestHappening, active: boolean): number;
};

const IsCount = (value: unknown): boolean => value === undefined || (typeof value === "number" && Number.isInteger(value) && value >= 0);

const goals: { [kind: string]: QuestGoalType } = {
    collect: {
        label: "Collect",
        Default: () => ({ kind: "collect" }),
        IsValid: goal => IsCount(goal.count),
        Target: (goal, quest, level) => (goal.count as number) || level.Marked("collect", quest.id),
        Advance: (_goal, quest, happening) => (happening.kind === "collect" && happening.quest === quest.id ? 1 : 0)
    },
    kill: {
        label: "Kill",
        Default: () => ({ kind: "kill" }),
        IsValid: goal => IsCount(goal.count) && (goal.monster === undefined || typeof goal.monster === "string"),
        Target: (goal, quest, level) => (goal.count as number) || level.Marked("kill", quest.id),
        Advance: (goal, quest, happening, active) => {
            if (happening.kind !== "kill") {
                return 0;
            }
            return happening.quest === quest.id || (active && goal.monster !== undefined && happening.monster === goal.monster) ? 1 : 0;
        }
    },
    script: {
        label: "Dialog says",
        Default: () => ({ kind: "script" }),
        IsValid: () => true,
        Target: () => 1,
        Advance: () => 0
    }
};

/** Adds a kind of quest goal, or replaces one - a game's own, beside `collect`, `kill` and `script`. */
export function RegisterQuestGoal(kind: string, type: QuestGoalType): void {
    goals[kind] = type;
}

/** The kinds of goal there are, in the order they were registered - what the editor offers. */
export function QuestGoalKinds(): string[] {
    return Object.keys(goals);
}

/** The kind of goal called `kind`, if there is one. */
export function QuestGoalFor(kind: string): QuestGoalType | undefined {
    return Object.prototype.hasOwnProperty.call(goals, kind) ? goals[kind] : undefined;
}

/** Whether `id` can name a quest - one word, so a dialog script can name it too: letters, digits, `-` and `_`. */
export function IsQuestId(id: unknown): id is string {
    return typeof id === "string" && /^[A-Za-z0-9_-]+$/.test(id);
}

/** Whether `value` is a well-formed quest: an id, a name, and a goal of a kind there is, well formed. */
export function IsQuestDef(value: unknown): value is QuestDef {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const quest = value as Partial<QuestDef>;
    const goal = quest.goal;
    const type = goal && typeof goal === "object" && typeof goal.kind === "string" ? QuestGoalFor(goal.kind) : undefined;
    return (
        IsQuestId(quest.id) && typeof quest.name === "string" && !!type && type.IsValid(goal!) &&
        (quest.text === undefined || typeof quest.text === "string") &&
        (quest.start === undefined || typeof quest.start === "boolean") &&
        (quest.ends === undefined || typeof quest.ends === "boolean")
    );
}

/**
 * A level's quests, read from its file as the engine will play them: only the well-formed ones (see `IsQuestDef`), the
 * first of any with the same id. Anything else - a level saved before it had quests - is none.
 */
export function ReadQuests(value: unknown): QuestDef[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const seen = new Set<string>();
    return value.filter((quest): quest is QuestDef => {
        if (!IsQuestDef(quest) || seen.has(quest.id)) {
            return false;
        }
        seen.add(quest.id);
        return true;
    });
}

/** A new quest for the editor to start from. */
export function DefaultQuest(id: string): QuestDef {
    return { id, name: "NEW QUEST", goal: { kind: "collect" } };
}

/** Where one of a level's quests has got to. */
export type QuestStatus = {
    readonly def: QuestDef;
    state: QuestState;
    /** How far it has gone toward `target` - kept even before it's given (see `QuestGoalType.Advance`). */
    progress: number;
    /** How far it has to go to be complete. */
    target: number;
};

/** What a quest log tells of each change: the quest as it is now, the state it was in before, and its index in the log. */
export type QuestChange = (status: Readonly<QuestStatus>, was: QuestState, index: number) => void;

/**
 * How a level's quests stand, in a run of it: started over with each run (`Reset`), moved on by what happens in play
 * (`Record`) and by dialogs (`Give`, `Complete`, `Finish`). Each change is told to `changed`.
 */
export default class QuestLog {
    private quests: QuestStatus[] = [];
    private version = 0;

    constructor(private readonly changed: QuestChange = () => undefined) {}

    /** Every quest, in the level's order. */
    get Quests(): ReadonlyArray<Readonly<QuestStatus>> {
        return this.quests;
    }

    /** Goes up with every change - so something showing the log can tell when to show it again. */
    get Version(): number {
        return this.version;
    }

    /** Starts over with these quests: the `start` ones under way, the rest not given, nothing counted yet. Tells of none of it. */
    Reset(defs: ReadonlyArray<QuestDef>, level: QuestLevel): void {
        this.quests = defs.map(def => {
            const type = QuestGoalFor(def.goal.kind);
            const target = type ? Math.max(1, type.Target(def.goal, def, level)) : 1;
            return { def, state: def.start ? "active" : "none", progress: 0, target };
        });
        this.version++;
    }

    /** The quest with this id, if the level has one. */
    Get(id: string): Readonly<QuestStatus> | undefined {
        return this.quests[this.Index(id)];
    }

    /** Its place in the log, or -1. */
    Index(id: string): number {
        for (let i = 0; i < this.quests.length; i++) {
            if (this.quests[i].def.id === id) {
                return i;
            }
        }
        return -1;
    }

    /** Where the quest with this id has got to - `none` for one the level hasn't got. */
    State(id: string): QuestState {
        const quest = this.Get(id);
        return quest ? quest.state : "none";
    }

    /** Gives a quest not yet given: it's under way - or complete at once, if what it asks for has already been done. Returns whether it was given. */
    Give(id: string): boolean {
        const quest = this.quests[this.Index(id)];
        if (!quest || quest.state !== "none") {
            return false;
        }
        this.Set(quest, quest.progress >= quest.target ? "complete" : "active", quest.progress);
        return true;
    }

    /** Has a quest's goal met, whatever it is - given or not. Returns whether it wasn't already. */
    Complete(id: string): boolean {
        const quest = this.quests[this.Index(id)];
        if (!quest || quest.state === "complete" || quest.state === "finished") {
            return false;
        }
        this.Set(quest, "complete", quest.target);
        return true;
    }

    /** Hands a quest in: done with. Returns whether it wasn't already. */
    Finish(id: string): boolean {
        const quest = this.quests[this.Index(id)];
        if (!quest || quest.state === "finished") {
            return false;
        }
        this.Set(quest, "finished", quest.target);
        return true;
    }

    /** Counts something that happened in play toward every quest it moves on: one under way that gets to its target is complete. */
    Record(happening: QuestHappening): void {
        this.quests.forEach(quest => {
            if (quest.state === "complete" || quest.state === "finished" || quest.progress >= quest.target) {
                return;
            }
            const type = QuestGoalFor(quest.def.goal.kind);
            const by = type ? type.Advance(quest.def.goal, quest.def, happening, quest.state === "active") : 0;
            if (by > 0) {
                const progress = Math.min(quest.target, quest.progress + by);
                this.Set(quest, quest.state === "active" && progress >= quest.target ? "complete" : quest.state, progress);
            }
        });
    }

    /**
     * Has quest `index` where it's said to be, without telling `changed` - for an online guest, whose quests are the
     * host's (see `GuestSession`). Returns the state it was in, or null for no such quest.
     */
    Follow(index: number, state: QuestState, progress: number): QuestState | null {
        const quest = this.quests[index];
        if (!quest) {
            return null;
        }
        const was = quest.state;
        quest.state = state;
        quest.progress = progress;
        this.version++;
        return was;
    }

    private Set(quest: QuestStatus, state: QuestState, progress: number): void {
        const was = quest.state;
        quest.state = state;
        quest.progress = progress;
        this.version++;
        this.changed(quest, was, this.quests.indexOf(quest));
    }
}
