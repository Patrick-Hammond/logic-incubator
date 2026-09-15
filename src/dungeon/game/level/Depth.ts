/**
 * Cell-height (z) maths. Pure - no pixi, no DOM - so it runs under the plain
 * node test runner (see Depth.test.ts).
 *
 * Height is painted per grid cell with the `Z_INDEX` (DepthBrushName) data brush
 * and is purely visual: movement and collision stay a single flat grid. The
 * renderer draws each cell's tiles grouped by that cell's z, each group at
 * `ZScale(z - playerZ)`, so the band the player stands on is always 1:1, bands
 * above it are larger and bands below recede. Because z is an integer, stepping
 * onto a new height snaps the whole relationship a geometric notch - no
 * interpolation.
 */

/** On-screen scale of a tile at z 0. */
export const BaseZScale = 1.4;
/** On-screen size multiplier per z step (tunable). */
export const ZScaleRatio = 1.04;
/** Alpha lost per z away from the z the player is standing on. */
export const ZFadeStep = 0.1;
/** Minimum alpha for a z-band. */
export const MinZFade = 0.05;

/** On-screen scale of a tile / band at the given height. */
export function ZScale(z: number): number {
    return BaseZScale * Math.pow(ZScaleRatio, z);
}

/** On-screen size multiplier per z step for the whole camera (tunable, gentler than ZScaleRatio). */
export const CameraZoomRatio = 1.08;
/** CameraZoom never grows past this, however high the player climbs. */
export const MaxCameraZoom = 2;
/** CameraZoom never shrinks past this, however low the player sinks. */
export const MinCameraZoom = 0.25;

function ClampZoom(zoom: number): number {
    if(zoom >= MaxCameraZoom) {
       return MaxCameraZoom -0.2;
    }
    return Math.min(MaxCameraZoom, Math.max(MinCameraZoom, zoom));
}

/**
 * Whole-scene camera zoom for the given player z. Unlike `ZScale` - which is
 * relative to the player's own band and so always renders that band at 1:1 -
 * this is driven by the player's absolute height, so the whole camera grows
 * a little as the player climbs (and would shrink a little descending),
 * clamped to [MinCameraZoom, MaxCameraZoom] so it never runs away.
 */
export function CameraZoom(z: number): number {
    return ClampZoom(Math.pow(CameraZoomRatio, z));
}

/**
 * Draw alpha (0..1) for a z-band, given the z under the player. The player's own
 * band is fully opaque; each step away loses `ZFadeStep`, floored at 0.
 */
export function ZBandAlpha(z: number, playerZ: number): number {
    if (z === playerZ) {
        return 1;
    }
    return Math.max(MinZFade, 1 - Math.abs(z - playerZ) * ZFadeStep);
}

/** Seconds the player must stay on one z before `StepZoom` starts easing the camera back to a neutral 1:1 zoom. */
export const ZoomSettleDelay = 0.1;
/** Ease-back speed once `ZoomSettleDelay` has elapsed, in zoom units/second (tunable - bigger settles faster). */
export const ZoomSettleSpeed = 0.75;

/** Eases `current` linearly toward a neutral 1 at `ZoomSettleSpeed`/second, without overshooting past it. */
function EaseZoomToRest(current: number, dt: number): number {
    const step = ZoomSettleSpeed * dt;
    if (Math.abs(current - 1) <= step) {
        return 1;
    }
    return current + step * (current < 1 ? 1 : -1);
}

/** `{ value: the on-screen camera zoom, z: the height "value" was last pinned against }`. */
export type ZoomState = { value: number; z: number };

/**
 * One frame of the camera's height-driven zoom.
 *
 * While `heldTime` (seconds since the player last changed z - callers reset
 * this to 0 on every `z` change) is under `ZoomSettleDelay`, the zoom tracks
 * height RELATIVELY and INCREMENTALLY: it multiplies `state.value` by
 * `CameraZoomRatio` for however far `z` has moved since the last call
 * (`z - state.z`), rather than jumping to a freshly-computed absolute
 * `CameraZoom(z)`. This matters because `state.value` might currently be
 * mid-ease (see below) rather than sitting exactly on a "resting" pin -
 * recomputing an absolute value from scratch would ignore that and produce a
 * visible snap the instant a z change interrupts an in-progress ease.
 * Stepping incrementally from wherever `value` actually is keeps the
 * transition continuous no matter when it's interrupted, while still
 * matching plain `CameraZoom(z)` for the common case of a fully-settled
 * start (1 * ratio^z == CameraZoom(z)).
 *
 * Once held past `ZoomSettleDelay` with no further z change, `value` eases
 * back toward 1 instead of staying pinned to height forever - see
 * `EaseZoomToRest`. Because that far outlives any single `z` change, a
 * player who rests long enough to fully settle (value back to exactly 1) and
 * then moves again starts the next increment from 1, not from their old
 * absolute height - so descending from a settled height zooms OUT, not
 * further in, matching the player's own sense of "up" and "down" from where
 * they last stood rather than from world-absolute z.
 */
export function StepZoom(state: ZoomState, z: number, heldTime: number, dt: number): ZoomState {
    if (heldTime < ZoomSettleDelay) {
        return { value: ClampZoom(state.value * Math.pow(CameraZoomRatio, z - state.z)), z };
    }
    return { value: EaseZoomToRest(state.value, dt), z };
}

/**
 * Height painted under a grid cell, or 0 if unpainted. `heightData` is the
 * `[x][y]` grid `Level` builds from `Z_INDEX` brushes (same shape as
 * `collisionData`). Heights are expected to be >= 0.
 */
export function HeightAt(heightData: ReadonlyArray<ReadonlyArray<number>>, tx: number, ty: number): number {
    const column = heightData[tx];
    const z = column && column[ty];
    return z || 0;
}
