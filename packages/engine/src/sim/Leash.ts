/**
 * The screen's edge holding heroes back on a shared screen: no hero may get further than a span from any
 * other, so the party always fits the camera at its furthest zoom (see `PartyFrame`). It's a collider
 * wrapped round the walls' (see `MoveCollider`), so the edge stops a hero the way a wall does - on the
 * axis they push against it, sliding along the other. Pure - no pixi - so it runs under the plain node
 * test runner.
 */

import { Vec2Like } from "@logic-incubator/lib/math/Geometry";
import { MoveCollider } from "../view/helpers/PlayerMovement";

/** Where a hero's top-left may go, in pixels. */
export type LeashBox = { minX: number; minY: number; maxX: number; maxY: number };

/**
 * Where a hero may go so that no one else (`others`' top-lefts) is further than `span` pixels from them
 * across, or down - null when there's no one else to stay near.
 */
export function LeashBoxFor(others: ReadonlyArray<Vec2Like>, span: { width: number; height: number }): LeashBox | null {
    if (!others.length) {
        return null;
    }
    let minX = others[0].x;
    let maxX = minX;
    let minY = others[0].y;
    let maxY = minY;
    others.forEach(p => {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
    });
    return { minX: maxX - span.width, maxX: minX + span.width, minY: maxY - span.height, maxY: minY + span.height };
}

/** Where a step of `dir` from `from` along one axis stops at the edges `min`/`max` - null if it doesn't reach them. Never back past `from`: one already outside just can't go further out. */
function Edge(from: number, dir: number, min: number, max: number): number | null {
    const to = from + dir;
    if (dir > 0 && to > max) {
        return Math.max(from, max);
    }
    if (dir < 0 && to < min) {
        return Math.min(from, min);
    }
    return null;
}

/** Whichever of a wall and an edge a step of `dir` meets first - null for neither. */
function Nearest(wall: number | null, edge: number | null, dir: number): number | null {
    if (wall == null || edge == null) {
        return wall == null ? edge : wall;
    }
    return dir > 0 ? Math.min(wall, edge) : Math.max(wall, edge);
}

/** `collider`, with the edges of `box` as walls too - ones no gap is ever lined up through. */
export function Leashed(collider: MoveCollider, box: LeashBox): MoveCollider {
    const edgeX = (from: Vec2Like, dir: number) => Edge(from.x, dir, box.minX, box.maxX);
    const edgeY = (from: Vec2Like, dir: number) => Edge(from.y, dir, box.minY, box.maxY);
    /** Whether the edge, not a wall, is what stops this step - so there's no gap to line up with. */
    const edgeFirst = (wall: number | null, edge: number | null, dir: number) => edge != null && (wall == null || Nearest(wall, edge, dir) === edge);
    return {
        TestX: (from, dir) => Nearest(collider.TestX(from, dir), edgeX(from, dir), dir),
        TestY: (from, dir) => Nearest(collider.TestY(from, dir), edgeY(from, dir), dir),
        GapAlignX: (from, dir) => (edgeFirst(collider.TestY(from, dir), edgeY(from, dir), dir) ? null : collider.GapAlignX(from, dir)),
        GapAlignY: (from, dir) => (edgeFirst(collider.TestX(from, dir), edgeX(from, dir), dir) ? null : collider.GapAlignY(from, dir)),
        IsHeightBlocked: (fromTile, toTile) => collider.IsHeightBlocked(fromTile, toTile)
    };
}
