/**
 * Plays a dialog script (see `DialogScript`) a line at a time: `Start` runs it to the first line said, then `Next`
 * (after a line with no choices) or `Choose` (after one with) to the next - each running the actions and jumps on
 * the way, against the level's quests and the hero talking (`DialogContext`). What it hands back is what to show:
 * who says what, and the choices offered under it; null is the end of the talk. Pure - no pixi - so it runs
 * under the plain node test runner.
 */

import { DialogChoice, DialogContext, DialogScript, EndTarget, RunAction, TestCondition } from "./DialogScript";

/** A line to show: who says it ("" for no one), what, and the choices the player has - none, to go on with `Next`. */
export type DialogLine = { speaker: string; text: string; choices: string[] };

/** The most steps one go of a script may take without saying anything - a script that jumps round in a circle ends there. */
const MaxSteps = 1000;

export default class DialogRunner {
    /** The step to run next. */
    private at = 0;
    /** The choices shown with the last line - what `Choose` picks from. */
    private offered: DialogChoice[] = [];
    /** The last line said - shown again with choices that come after something other than a line. */
    private said = { speaker: "", text: "" };
    private ended = false;

    constructor(private readonly script: DialogScript, private readonly context: DialogContext) {}

    /** Whether the talk is over. */
    get Ended(): boolean {
        return this.ended;
    }

    /** Starts the talk from the top - the first line said, or null if it ends before saying anything. */
    Start(): DialogLine | null {
        this.at = 0;
        this.ended = false;
        this.offered = [];
        this.said = { speaker: "", text: "" };
        return this.Run();
    }

    /** Goes on from a line with no choices - null if that was the end. With choices showing, it waits for `Choose`. */
    Next(): DialogLine | null {
        if (this.ended) {
            return null;
        }
        if (this.offered.length) {
            return this.Shown(this.offered);
        }
        return this.Run();
    }

    /** Picks choice `index` of those shown, and goes where it leads - null if that's the end. */
    Choose(index: number): DialogLine | null {
        const choice = this.offered[index];
        if (this.ended || !choice) {
            return this.ended ? null : this.Next();
        }
        this.offered = [];
        if (choice.target !== null && !this.Jump(choice.target)) {
            return this.End();
        }
        return this.Run();
    }

    /** Runs steps to the next line said - or the end. */
    private Run(): DialogLine | null {
        const steps = this.script.steps;
        for (let taken = 0; taken < MaxSteps; taken++) {
            const step = steps[this.at];
            if (!step || step.kind === "end") {
                return this.End();
            }
            this.at++;
            switch (step.kind) {
                case "say": {
                    this.said = { speaker: step.speaker, text: step.text };
                    this.offered = [];
                    const next = steps[this.at];
                    if (next && next.kind === "choices") {
                        this.at++;
                        this.offered = this.Offered(next.choices);
                    }
                    return this.Shown(this.offered);
                }
                case "choices":
                    this.offered = this.Offered(step.choices);
                    if (this.offered.length) {
                        return this.Shown(this.offered);
                    }
                    break;
                case "goto":
                    if ((!step.condition || TestCondition(step.condition, this.context)) && !this.Jump(step.target)) {
                        return this.End();
                    }
                    break;
                case "action":
                    RunAction(step, this.context);
                    break;
            }
        }
        return this.End();
    }

    /** Goes to the part called `target` - false for the end, or a part the script hasn't got. */
    private Jump(target: string): boolean {
        if (target === EndTarget || !Object.prototype.hasOwnProperty.call(this.script.parts, target)) {
            return false;
        }
        this.at = this.script.parts[target];
        return true;
    }

    private Offered(choices: ReadonlyArray<DialogChoice>): DialogChoice[] {
        return choices.filter(choice => !choice.condition || TestCondition(choice.condition, this.context));
    }

    private Shown(choices: ReadonlyArray<DialogChoice>): DialogLine {
        return { speaker: this.said.speaker, text: this.said.text, choices: choices.map(choice => choice.text) };
    }

    private End(): null {
        this.ended = true;
        this.offered = [];
        return null;
    }
}
