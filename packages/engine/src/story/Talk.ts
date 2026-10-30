/**
 * NPCs to talk to: the value of a `DIALOG` brush - painted over an NPC's tile, it makes that cell solid and gives
 * it a dialog script (see `DialogScript`) - and how a hero starts a talk: by walking into one and staying by them
 * while a bubble over them counts up three dots (`TalkCountdown`), so an NPC walked into by mistake can be walked
 * away from. Talking is for a game of one hero on one machine (a Quest): in co-op or online an NPC just stands
 * there. Pure - no pixi - so it runs under the plain node test runner.
 */

import type { Vec2Like } from "@logic-incubator/lib/math/Geometry";
import { DialogContext, DialogScript, EndTarget, TestCondition } from "./DialogScript";

/** A `DIALOG` brush's value: the script its NPC talks by, as typed. */
export type DialogValue = { script: string };

/** How far past a hero's box, in pixels, an NPC they're walking into is felt - they stop against it, so it's never inside. */
const Reach = 2;
/** How much of a stick's push along an axis counts as walking that way. */
const Push = 0.3;
/** How far, as a share of a tile, a hero may draw back from the NPC they walked into while the dots count up, before it's called off. */
const Stay = 0.5;
/** The most steps a look through a script may take - one that jumps round in a circle ends there. */
const MaxSteps = 1000;

/** Dots the bubble over an NPC counts up to - one, two, three - before their talk starts. */
export const TalkDots = 3;
/** Seconds from one dot to the next, and from the last to the talk. */
export const TalkDotSeconds = 1;

/** Whether `value` is a dialog brush's value. */
export function IsDialogValue(value: unknown): value is DialogValue {
    return typeof value === "object" && value !== null && typeof (value as DialogValue).script === "string";
}

/** What a new `DIALOG` brush starts with: one line, to show where the script goes. */
export function DefaultDialogValue(): DialogValue {
    return { script: "NPC: Hello there." };
}

/**
 * The NPC cell a hero is walking into: their one-tile box at `position` (its top-left, in pixels), pushed `direction`
 * (their input, -1 to 1 on each axis), against a cell `isNpc` says has one - the first such cell, or null for none.
 */
export function BumpedNpc(position: Vec2Like, direction: Vec2Like, isNpc: (tileX: number, tileY: number) => boolean, tileSize: number): Vec2Like | null {
    const dx = direction.x > Push ? Reach : direction.x < -Push ? -Reach : 0;
    const dy = direction.y > Push ? Reach : direction.y < -Push ? -Reach : 0;
    if (!dx && !dy) {
        return null;
    }
    const x0 = Math.floor((position.x + dx) / tileSize);
    const y0 = Math.floor((position.y + dy) / tileSize);
    const x1 = Math.floor((position.x + dx + tileSize - 1) / tileSize);
    const y1 = Math.floor((position.y + dy + tileSize - 1) / tileSize);
    for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) {
            if (isNpc(x, y)) {
                return { x, y };
            }
        }
    }
    return null;
}

/**
 * Whether a hero whose one-tile box is at `position` (its top-left, in pixels) is still by the NPC on `cell`: their box,
 * grown by half a tile, overlaps the NPC's cell. Stepping back, or walking on past, takes them out of it.
 */
export function BesideNpc(position: Vec2Like, cell: Vec2Like, tileSize: number): boolean {
    const stay = Stay * tileSize;
    const left = cell.x * tileSize;
    const top = cell.y * tileSize;
    return position.x + tileSize + stay > left && position.x - stay < left + tileSize && position.y + tileSize + stay > top && position.y - stay < top + tileSize;
}

/**
 * Whether a talk by `script` says anything, as things stand by `context`: its top runs, past the actions (which aren't run)
 * and through the jumps whose `if`s hold, to a line said. A script that's all shout part doesn't.
 */
export function SaysAnything(script: DialogScript, context: DialogContext): boolean {
    let at = 0;
    for (let taken = 0; taken < MaxSteps; taken++) {
        const step = script.steps[at];
        if (!step || step.kind === "end") {
            return false;
        }
        at++;
        if (step.kind === "say") {
            return true;
        }
        if (step.kind === "goto" && (!step.condition || TestCondition(step.condition, context))) {
            if (step.target === EndTarget || !Object.prototype.hasOwnProperty.call(script.parts, step.target)) {
                return false;
            }
            at = script.parts[step.target];
        }
    }
    return false;
}

/** A talk that's due to start: which hero, and the NPC's cell. */
export type DueTalk = Vec2Like & { hero: number };

/**
 * The wait between a hero walking into an NPC and their talk starting: `Begin` it as they walk into one, then `Update` it
 * every frame of play. The bubble over the NPC shows `Dots` - one, then two, then three, `TalkDotSeconds` apart - and a dot's
 * time after the third the talk is due. A hero who draws back from the NPC (`BesideNpc`) before then calls it off.
 */
export class TalkCountdown {
    private waiting: (DueTalk & { seconds: number }) | null = null;

    /** The talk being counted down to, or null. */
    get Waiting(): DueTalk | null {
        return this.waiting;
    }

    /** Seconds it has counted, so far. */
    get Seconds(): number {
        return this.waiting ? this.waiting.seconds : 0;
    }

    /** The dots in the bubble: 1 to `TalkDots` while it counts, 0 while it doesn't. */
    get Dots(): number {
        return this.waiting ? Math.min(TalkDots, 1 + Math.floor(this.waiting.seconds / TalkDotSeconds)) : 0;
    }

    /** `hero` walked into the NPC on `cell`: the count starts from one dot - or carries on, if it's already theirs. */
    Begin(hero: number, cell: Vec2Like): void {
        const waiting = this.waiting;
        if (waiting && waiting.hero === hero && waiting.x === cell.x && waiting.y === cell.y) {
            return;
        }
        this.waiting = { hero, x: cell.x, y: cell.y, seconds: 0 };
    }

    /**
     * Counts on by `seconds`, with `beside` whether its hero is still by the NPC: the talk, once it's due - which ends the
     * count, as walking away does - and null until then.
     */
    Update(seconds: number, beside: boolean): DueTalk | null {
        const waiting = this.waiting;
        if (!waiting) {
            return null;
        }
        if (!beside) {
            this.Cancel();
            return null;
        }
        waiting.seconds += seconds;
        if (waiting.seconds < TalkDots * TalkDotSeconds) {
            return null;
        }
        this.Cancel();
        return { hero: waiting.hero, x: waiting.x, y: waiting.y };
    }

    /** Stops counting - the level starts over, or ends. */
    Cancel(): void {
        this.waiting = null;
    }
}
