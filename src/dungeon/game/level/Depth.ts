/**
 * Cell-height (z) maths. Pure - no pixi, no DOM - so it runs under the plain
 * node test runner (see Depth.test.ts).
 *
 * Height is painted per grid cell with the `data-3` (DepthBrushName) data brush
 * and is purely visual: movement and collision stay a single flat grid. The
 * renderer draws each cell's tiles grouped by that cell's z, each group at
 * `ZScale(z - playerZ)`, so the band the player stands on is always 1:1, bands
 * above it are larger and bands below recede. Because z is an integer, stepping
 * onto a new height snaps the whole relationship a geometric notch - no
 * interpolation.
 */

/** On-screen scale of a tile at z 0. */
export const BaseZScale = 1;
/** On-screen size multiplier per z step (tunable). */
export const ZScaleRatio = 1.04;
/** Alpha lost per z away from the z the player is standing on. */
export const ZFadeStep = 0.2;

/** On-screen scale of a tile / band at the given height. */
export function ZScale(z: number): number {
    return BaseZScale * Math.pow(ZScaleRatio, z);
}

/**
 * Draw alpha (0..1) for a z-band, given the z under the player. The player's own
 * band is fully opaque; each step away loses `ZFadeStep`, floored at 0.
 */
export function ZBandAlpha(z: number, playerZ: number): number {
    if (z === playerZ) {
        return 1;
    }
    return Math.max(0.05, 1 - Math.abs(z - playerZ) * ZFadeStep);
}

/**
 * Height painted under a grid cell, or 0 if unpainted. `heightData` is the
 * `[x][y]` grid `Level` builds from `data-3` brushes (same shape as
 * `collisionData`). Heights are expected to be >= 0.
 */
export function HeightAt(heightData: ReadonlyArray<ReadonlyArray<number>>, tx: number, ty: number): number {
    const column = heightData[tx];
    const z = column && column[ty];
    return z || 0;
}
