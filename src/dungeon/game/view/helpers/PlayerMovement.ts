import { Vec2Like } from "../../../../_lib/math/Geometry";
import { UpperLimit } from "../../../../_lib/math/Utils";
import { PlayerSpeed, TileSize } from "../../../Constants";

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
}

/** Per-frame velocity damping (multiplied by dt each frame). */
export const MoveDamping = 0.8;

/**
 * One frame of input-driven movement + tile collision.
 *
 * `position` and `velocity` are mutated in place: `position` is advanced by the
 * current velocity (clamped to one tile per axis per frame) and pushed back out
 * of anything solid, then `velocity` is zeroed on any axis that hit something
 * and damped.
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
 */
export function ResolveMove(
    position: Vec2Like,
    velocity: Vec2Like,
    dt: number,
    collider: MoveCollider,
): void {
    const deltaX = UpperLimit(velocity.x * dt * PlayerSpeed, TileSize - 1);
    const deltaY = UpperLimit(velocity.y * dt * PlayerSpeed, TileSize - 1);

    const from = { x: position.x, y: position.y };
    let newX = from.x + deltaX;
    let newY = from.y + deltaY;

    let headStarted = false;

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
        }
    }

    position.x = newX;
    position.y = newY;

    velocity.x *= MoveDamping * dt;
    velocity.y *= MoveDamping * dt;

    if (Math.abs(velocity.x) < 0.001) {
        velocity.x = 0;
    }
    if (Math.abs(velocity.y) < 0.001) {
        velocity.y = 0;
    }
}
