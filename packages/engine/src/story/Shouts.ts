/**
 * What an NPC calls out when a hero comes near - "Help, help!" - in a speech bubble over them: the lines said in their
 * script's `shout` part (`ShoutLines`), one picked at random each time, and when (`Shouter`). The part's `if` and `->`
 * lines work as they do in a talk, so what an NPC shouts can change with the quests:
 *
 *     shout:
 *     if hoard finished -> shout-after
 *     Help, help! Thieves!
 *     Oh dear, where did I put it?!
 *
 *     shout-after:
 *     Gold, glorious gold.
 *
 * Shouting changes nothing: the actions and choices on the way are passed over. Pure - no pixi - so it runs under the
 * plain node test runner.
 */

import type { Vec2Like } from "@logic-incubator/lib/math/Geometry";
import { DialogContext, DialogScript, EndTarget, ShoutPart, TestCondition } from "./DialogScript";

/** How near, in tiles (as the crow flies, centre to centre), a hero comes to an NPC in sight before they shout. */
export const ShoutRange = 5;
/** Seconds between a hero coming near and the first shout - long enough to see who it is. */
export const ShoutDelay = 0.6;
/** Seconds of quiet between one shout and the next, while a hero stays near: at least, and at most. */
export const ShoutGapMin = 5;
export const ShoutGapMax = 9;
/** Seconds a bubble takes to come and to go. */
export const ShoutFadeIn = 0.15;
export const ShoutFadeOut = 0.3;

/** The most steps the part may take - a part that jumps round in a circle ends there. */
const MaxSteps = 1000;

/** Whether a hero whose centre is at `centre` (in pixels) is near enough to cell `cell`'s NPC to hear them shout - within `ShoutRange` tiles. */
export function InEarshot(centre: Vec2Like, cell: Vec2Like, tileSize: number): boolean {
    const dx = centre.x - (cell.x + 0.5) * tileSize;
    const dy = centre.y - (cell.y + 0.5) * tileSize;
    const range = ShoutRange * tileSize;
    return dx * dx + dy * dy <= range * range;
}

/** Whether the NPC has anything to shout - a `shout` part. */
export function HasShouts(script: DialogScript): boolean {
    return Object.prototype.hasOwnProperty.call(script.parts, ShoutPart);
}

/** What the NPC may shout now: the text of every line said in their `shout` part, following its `if`s and `->`s - none without one. */
export function ShoutLines(script: DialogScript, context: DialogContext): string[] {
    const lines: string[] = [];
    if (!HasShouts(script)) {
        return lines;
    }
    let at = script.parts[ShoutPart];
    for (let taken = 0; taken < MaxSteps; taken++) {
        const step = script.steps[at];
        if (!step || step.kind === "end") {
            break;
        }
        at++;
        if (step.kind === "say") {
            lines.push(step.text);
        } else if (step.kind === "goto" && (!step.condition || TestCondition(step.condition, context))) {
            if (step.target === EndTarget || !Object.prototype.hasOwnProperty.call(script.parts, step.target)) {
                break;
            }
            at = script.parts[step.target];
        }
    }
    return lines;
}

/** How long a shout stays up, in seconds: longer for more to read. */
export function ShoutSeconds(text: string): number {
    return Math.min(5, 2 + text.length * 0.05);
}

/**
 * When one NPC shouts, and what: `Update` it every frame with whether a hero is near. A short while after one comes near
 * it shouts a line picked at random - not the same one twice running, when it has others - and keeps it up a few
 * seconds (`ShoutSeconds`), then is quiet for a while before the next, for as long as a hero stays.
 */
export default class Shouter {
    private text: string | null = null;
    /** Seconds the shout has been up, and has left. */
    private age = 0;
    private left = 0;
    /** Seconds until it may shout again. */
    private quiet = ShoutDelay;
    private wasNear = false;
    private last = -1;

    /** `random` gives a number from 0 up to (not including) 1 - `Math.random`, or a test's own. */
    constructor(private readonly random: () => number = Math.random) {}

    /** What it's shouting, or null. */
    get Text(): string | null {
        return this.text;
    }

    /** How much of the bubble shows, 0 to 1 - as it comes and goes. */
    get Fade(): number {
        return this.text === null ? 0 : Math.max(0, Math.min(1, this.age / ShoutFadeIn, this.left / ShoutFadeOut));
    }

    /**
     * Moves it on by `seconds`. `near` is whether a hero is near now; `lines` is what it may shout - asked for only as a
     * shout starts, so it says what's true then. Returns what it's shouting, or null.
     */
    Update(seconds: number, near: boolean, lines: () => ReadonlyArray<string>): string | null {
        if (near && !this.wasNear) {
            this.quiet = Math.max(this.quiet, ShoutDelay);
        }
        this.wasNear = near;
        if (this.text !== null) {
            this.age += seconds;
            this.left -= seconds;
            if (this.left <= 0) {
                this.Quiet();
            }
        } else {
            this.quiet = Math.max(0, this.quiet - seconds);
        }
        if (this.text === null && near && this.quiet <= 0) {
            const all = lines();
            if (all.length) {
                this.Shout(all);
            } else {
                this.quiet = this.Gap();
            }
        }
        return this.text;
    }

    /** Stops the shout now, if there is one, and stays quiet for a while - as a talk starts. */
    Hush(): void {
        this.Quiet();
    }

    private Shout(lines: ReadonlyArray<string>): void {
        let pick = Math.min(lines.length - 1, Math.floor(this.random() * lines.length));
        if (lines.length > 1 && pick === this.last) {
            pick = (pick + 1 + Math.min(lines.length - 2, Math.floor(this.random() * (lines.length - 1)))) % lines.length;
        }
        this.last = pick;
        this.text = lines[pick];
        this.age = 0;
        this.left = ShoutSeconds(this.text);
    }

    private Quiet(): void {
        this.text = null;
        this.age = this.left = 0;
        this.quiet = this.Gap();
    }

    private Gap(): number {
        return ShoutGapMin + (ShoutGapMax - ShoutGapMin) * this.random();
    }
}
