/**
 * Things a hero can push - a crate, a statue: the tile a `PUSHABLE` brush is painted over (see
 * `ImplicitData.FindPushables`). One is solid over its sprite's footprint wherever it is, and a hero who keeps
 * walking into it for `PushDelay` shoves it a cell on, the way they're walking - if every cell it would move
 * onto is open (see `CanMove`). In play it's there at once; it's drawn sliding there (`SlideSeconds`). Pure -
 * no pixi - so it runs under the plain node test runner.
 */

import { Vec2Like } from "@logic-incubator/lib/math/Geometry";

/**
 * A thing that can be pushed, where it is now: the cell its brush was painted on, moved with it, the cells it makes solid
 * - its tile's sprite footprint (see `DoorFootprint`), moved with it too - and the tile's name. See `Level.pushables`.
 */
export type Pushable = Vec2Like & { cells: Vec2Like[]; sprite: string };

/** Which way a hero is pushing, and against which cell - see `PushTarget`. */
export type PushAttempt = Vec2Like & { dx: number; dy: number };

/** Seconds a hero has to keep walking into a thing before it moves - so brushing past one doesn't shove it. */
export const PushDelay = 0.25;

/**
 * Seconds a pushed thing is drawn sliding to its new cell. Its cells are free the moment it's pushed, so this is quick, and
 * fastest at first (`SlideEase`): the hero who pushed it, setting off again from a standstill, stays just behind its picture.
 */
export const SlideSeconds = 0.15;

/** How far past a hero's box, in pixels, a thing they're walking into is felt - they stop against it, so it's never inside. */
const Reach = 2;
/** How much of a stick's push along an axis counts as walking that way. */
const Lean = 0.3;

/**
 * The cell of a pushable thing a hero is walking into, and the way that pushes it: their one-tile box at `position` (its
 * top-left, in pixels), walking `direction` (their input, -1 to 1 on each axis), against a cell `isPushable` says has one.
 * Only the cell straight ahead of their middle counts, so they have to be more than half in line with it, and only along
 * one axis at a time - the one they're walking the more along first, then the other. Null for none.
 */
export function PushTarget(position: Vec2Like, direction: Vec2Like, tileSize: number, isPushable: (tileX: number, tileY: number) => boolean): PushAttempt | null {
    const half = (tileSize - 1) * 0.5;
    const across = Math.floor((position.x + half) / tileSize);
    const down = Math.floor((position.y + half) / tileSize);
    const ahead = (from: number, along: number) => Math.floor((along > 0 ? from + tileSize - 1 + Reach : from - Reach) / tileSize);
    const tryX = (): PushAttempt | null => {
        if (Math.abs(direction.x) <= Lean) {
            return null;
        }
        const x = ahead(position.x, direction.x);
        return isPushable(x, down) ? { x, y: down, dx: direction.x > 0 ? 1 : -1, dy: 0 } : null;
    };
    const tryY = (): PushAttempt | null => {
        if (Math.abs(direction.y) <= Lean) {
            return null;
        }
        const y = ahead(position.y, direction.y);
        return isPushable(across, y) ? { x: across, y, dx: 0, dy: direction.y > 0 ? 1 : -1 } : null;
    };
    return Math.abs(direction.x) >= Math.abs(direction.y) ? tryX() || tryY() : tryY() || tryX();
}

/**
 * Whether `pushable` can move one cell `dx`, `dy`: each cell it would move onto that it isn't on already is `open`, and none of
 * its cells would go up or down more than a hero can step (`heightBlocked`, from a cell to the one it would move to - see
 * `IsHeightGap`).
 */
export function CanMove(
    pushable: Pushable,
    dx: number,
    dy: number,
    open: (tileX: number, tileY: number) => boolean,
    heightBlocked: (from: Vec2Like, to: Vec2Like) => boolean
): boolean {
    const own = new Set(pushable.cells.map(cell => cell.x + "," + cell.y));
    return pushable.cells.every(cell => {
        const to = { x: cell.x + dx, y: cell.y + dy };
        return (own.has(to.x + "," + to.y) || open(to.x, to.y)) && !heightBlocked(cell, to);
    });
}

/** Whether a one-tile box at `position` (its top-left, in pixels) - a hero's or a monster's - covers any of the cell, as collision samples it. */
export function BoxOnCell(position: Vec2Like, tileX: number, tileY: number, tileSize: number): boolean {
    const covers = (from: number, cell: number) => Math.floor(from / tileSize) <= cell && cell <= Math.floor((from + tileSize - 1) / tileSize);
    return covers(position.x, tileX) && covers(position.y, tileY);
}

/** How far along its slide a pushed thing is drawn, 0 to 1, `t` (0 to 1) of the way through `SlideSeconds`: quick at first, easing in to its cell. */
export function SlideEase(t: number): number {
    const left = 1 - Math.max(0, Math.min(1, t));
    return 1 - left * left;
}
