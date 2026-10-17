/**
 * NPCs to talk to: the value of a `DIALOG` brush - painted over an NPC's tile, it makes that cell solid and gives
 * it a dialog script (see `DialogScript`) - and how a hero starts a talk, by walking into one. Talking is for a
 * game of one hero on one machine (a Quest): in co-op or online an NPC just stands there. Pure - no pixi - so it
 * runs under the plain node test runner.
 */

import type { Vec2Like } from "@logic-incubator/lib/math/Geometry";

/** A `DIALOG` brush's value: the script its NPC talks by, as typed. */
export type DialogValue = { script: string };

/** How far past a hero's box, in pixels, an NPC they're walking into is felt - they stop against it, so it's never inside. */
const Reach = 2;
/** How much of a stick's push along an axis counts as walking that way. */
const Push = 0.3;

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
