import { Vec2Like } from "@logic-incubator/lib/math/Geometry";
import { UpperLimit } from "@logic-incubator/lib/math/Utils";
import { PlayerSpeed, TileSize } from "../../Constants";

export interface MoveCollider {
    /** Non-null = the X the player must stop at when stepping `dir` px horizontally from `from`. */
    TestX(from: Vec2Like, dir: number): number | null;
    /** Non-null = the Y the player must stop at when stepping `dir` px vertically from `from`. */
    TestY(from: Vec2Like, dir: number): number | null;
    /**
     * Called after TestY blocks a vertical step: non-null = the X to jump to so
     * the player drops through a one-tile column gap it is lined up with; null =
     * a real wall.
     */
    GapAlignX(from: Vec2Like, dir: number): number | null;
    /**
     * Called after TestX blocks a horizontal step: non-null = the Y to jump to
     * so the player slips through a one-tile row gap (a doorway) it is lined up
     * with; null = a real wall.
     */
    GapAlignY(from: Vec2Like, dir: number): number | null;
    /** True if `toTile`'s height differs too much from `fromTile`'s (see `IsHeightGap`) for the mover to step between them - blocked like a wall, but never gap-aligned through. */
    IsHeightBlocked(fromTile: Vec2Like, toTile: Vec2Like): boolean;
}

/** Per-frame velocity damping (raised to dt each frame). */
export const MoveDamping = 0.8;

/** The velocity a full push holds a hero at on bare floor - where adding the push each step and damping by `MoveDamping` settles. */
export const TopVelocity = 1 / (1 - MoveDamping);

/**
 * How the floor under someone changes how they move (see `Overlays.FootingAt`): `speed` multiplies how fast they go, and
 * `slipperiness` how long they take to slow down - when they let go, turn round, or come onto a slower floor at speed - each 1
 * on bare floor. 0.3 is a third of the speed; 3 takes three times as long to slow, so they slide on; 0 stops them dead.
 */
export type Footing = { speed: number; slipperiness: number };

/** Bare floor: as fast as ever, stopping as quickly as ever. */
export const BareFloor: Footing = { speed: 1, slipperiness: 1 };

/**
 * One axis of a hero's velocity (what `ResolveMove` moves them by) after a step of `dt` frames on `footing`, pushed `push` that way
 * (the input, -1 to 1) from `velocity`: it closes on what the push holds them at on that floor - `push` times its `speed` times
 * `TopVelocity` - a share `MoveDamping` of the gap left each frame while they're speeding up, as on bare floor, and stretched by the
 * floor's `slipperiness` while they're slowing down: letting go, turning round, or onto a slower floor at speed. So a hero who
 * runs onto slime skids on into it, and one who runs into mud stops short. On bare floor, at a frame a step, it's exactly the
 * old way: the push added, then damped by `MoveDamping`.
 */
export function AxisVelocity(velocity: number, push: number, footing: Footing, dt: number): number {
    const target = push * footing.speed * TopVelocity;
    // Going faster than the push holds them at, or the other way.
    const slowing = velocity * (velocity - target) > 0;
    const slipperiness = footing.slipperiness;
    const keep = !slowing ? Math.pow(MoveDamping, dt) : slipperiness > 0 ? Math.pow(MoveDamping, dt / slipperiness) : 0;
    return target + (velocity - target) * keep;
}

/** The tile under a one-tile box's centre, given its top-left in pixels - the cell the player (or a monster) counts as standing on. */
export function CentreTile(position: Vec2Like): Vec2Like {
    const half = (TileSize - 1) * 0.5;
    return {
        x: ((position.x + half) / TileSize) | 0,
        y: ((position.y + half) / TileSize) | 0
    };
}

/** Centre of a one-tile box, given its top-left in pixels. */
export function BoxCentre(position: Vec2Like): Vec2Like {
    const half = (TileSize - 1) * 0.5;
    return { x: position.x + half, y: position.y + half };
}

/**
 * One frame of input-driven movement + tile collision.
 *
 * `position` and `velocity` are mutated in place: `position` is advanced by the
 * current velocity (clamped to one tile per axis per frame) and pushed back out
 * of anything solid, then `velocity` is zeroed on any axis that hit something
 * and damped. An axis whose wall-test is clear can still be blocked separately
 * by `IsHeightBlocked` - a coarse per-move check (the mover's and the
 * destination's centre tile), not part of the corner-sampled wall collision
 * above, so it's never gap-aligned through the way a tight doorway can be.
 *
 * Extracted from what used to live inline in Player.Move, kept pure so it can
 * be unit-tested without a pixi/Game runtime. Both axes are tested from the
 * frame's start position (`from`).
 *
 * Gap head-start: a one-tile gap is only 1px wider than the player, and while
 * driving diagonally the two axis steps grow together, so on the frame the step
 * into the wall is finally big enough for the Test to see it, the step *along*
 * the wall has already pushed a corner back past the gap edge - the player can
 * never land inside the 1px window. When a Test blocks but the blocker is
 * actually a gap the player is lined up with, we jump the player straight onto
 * the gap's row/column and let the step through this same frame (a head-start),
 * rather than easing toward it over several frames (which the coupling undoes).
 *
 * The vertical axis is resolved first; if it takes a head-start, the horizontal
 * axis is skipped for the frame so the two can't fight (and vice-versa is not
 * needed because X is last).
 *
 * Monsters move the same way, with their own `speed` in place of the player's. `damping` is the share of the velocity kept
 * after the move - left out, `MoveDamping` raised to `dt`; a hero's velocity is worked out for the floor they're on before the
 * move instead (see `AxisVelocity`), so theirs is 1.
 */
export function ResolveMove(
    position: Vec2Like,
    velocity: Vec2Like,
    dt: number,
    collider: MoveCollider,
    speed: number = PlayerSpeed,
    damping: number = Math.pow(MoveDamping, dt),
): void {
    const deltaX = UpperLimit(velocity.x * dt * speed, TileSize - 1);
    const deltaY = UpperLimit(velocity.y * dt * speed, TileSize - 1);

    const from = { x: position.x, y: position.y };
    let newX = from.x + deltaX;
    let newY = from.y + deltaY;

    let headStarted = false;
    const fromTile = CentreTile(from);

    if (deltaY !== 0) {
        const hit = collider.TestY(from, deltaY);
        if (hit != null) {
            const gapX = collider.GapAlignX(from, deltaY);
            if (gapX != null) {
                // Head-start into a column gap: snap onto its column, keep
                // falling, kill sideways drift so alignment holds until the
                // player is clear of the wall row.
                newX = gapX;
                velocity.x = 0;
                headStarted = true;
            } else {
                velocity.y = 0;
                newY = hit;
            }
        } else if (collider.IsHeightBlocked(fromTile, CentreTile({ x: from.x, y: newY }))) {
            velocity.y = 0;
            newY = from.y;
        }
    }

    if (!headStarted && deltaX !== 0) {
        const hit = collider.TestX(from, deltaX);
        if (hit != null) {
            const gapY = collider.GapAlignY(from, deltaX);
            if (gapY != null) {
                // Head-start through a doorway: snap onto its row, keep moving
                // sideways, kill vertical drift.
                newY = gapY;
                velocity.y = 0;
            } else {
                velocity.x = 0;
                newX = hit;
            }
        } else if (collider.IsHeightBlocked(fromTile, CentreTile({ x: newX, y: from.y }))) {
            velocity.x = 0;
            newX = from.x;
        }
    }

    position.x = newX;
    position.y = newY;

    // Raised to dt, not multiplied by it: the same at 60fps (dt 1), but a slow frame (dt past
    // 1.25) no longer stops velocity decaying at all and lets it grow without bound.
    velocity.x *= damping;
    velocity.y *= damping;

    if (Math.abs(velocity.x) < 0.001) {
        velocity.x = 0;
    }
    if (Math.abs(velocity.y) < 0.001) {
        velocity.y = 0;
    }
}
