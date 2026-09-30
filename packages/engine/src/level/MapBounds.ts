/**
 * Map bounds (in brush-grid cells) spanned by a level's brushes - the min/max
 * cell any brush is painted at, on each axis. Pure - no pixi - so it runs
 * under the plain node test runner (see MapBounds.test.ts). The only caller,
 * `Level.LoadLevel`, turns this into `boundRect` by padding each span by one
 * cell (`x2 - x1 + 2`) and normalises every brush position against `x1`/`y1`.
 */

import { Vec2Like } from "@logic-incubator/lib/math/Geometry";

export type MapBounds = { x1: number; y1: number; x2: number; y2: number };

/**
 * A brush-less level - no saved level yet - has nothing to span. Rather than
 * leave the min/max accumulator sitting at its unset sentinels, this reports
 * the same bounds a single brush at the origin would: the whole map is
 * "just" that one cell.
 */
const EMPTY_BOUNDS: MapBounds = { x1: 0, y1: 0, x2: 0, y2: 0 };

/** Min/max cell (inclusive) any brush is painted at, on each axis - `EMPTY_BOUNDS` if `brushes` is empty. */
export function FindMapBounds(brushes: ReadonlyArray<{ position: Vec2Like }>): MapBounds {
    if (brushes.length === 0) {
        return EMPTY_BOUNDS;
    }
    // -Number.MAX_VALUE, not Number.MIN_VALUE, which is the smallest *positive*
    // double: a Math.max sentinel of Number.MIN_VALUE would lose every brush
    // painted at a negative x or y (Math.max(MIN_VALUE, -3) is MIN_VALUE, not
    // -3), and an untouched Math.min/Math.max pair either way would leave x2 - x1
    // near -Number.MAX_VALUE - a "width" that overflows to +Infinity two
    // multiplications later, in FlowField's typed-array sizing.
    const bounds = { x1: Number.MAX_VALUE, y1: Number.MAX_VALUE, x2: -Number.MAX_VALUE, y2: -Number.MAX_VALUE };
    brushes.forEach(brush => {
        bounds.x1 = Math.min(bounds.x1, brush.position.x);
        bounds.y1 = Math.min(bounds.y1, brush.position.y);
        bounds.x2 = Math.max(bounds.x2, brush.position.x);
        bounds.y2 = Math.max(bounds.y2, brush.position.y);
    });
    return bounds;
}
