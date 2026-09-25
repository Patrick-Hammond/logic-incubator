/**
 * Static point-light baking. Pure - no pixi - so it runs under the plain node
 * test runner, same reasoning as Doors.ts/Regions.ts.
 *
 * Baked once at level load (see `Level.LoadEditorData`), not recomputed per
 * frame - this project has no moving lights, so there's no reason to pay for
 * falloff math every frame when a per-cell lookup already avoids it.
 */

import { Vec2Like } from "../../../_lib/math/Geometry";

/** A light's authored properties - either painted with the `LIGHT` data brush, or intrinsic to a tile via `AssetMetadata.light` (see `Level.LoadEditorData`). */
export type LightValue = { brightness: number; tint: number; range: number };

/** Narrows a `Brush.data`/`DataBrush.value` to `LightValue`. Collision, z-index and player-start keep a plain number, but `SpawnerValue` is an object too, so this keys off `range` rather than just "is an object". Deliberately loose past that - callers that already trust the shape (e.g. a `LIGHT` brush placement) only need "is this the light variant"; see `IsCompleteLightValue` for untrusted input. */
export function IsLightValue(value: unknown): value is LightValue {
    return typeof value === "object" && value !== null && "range" in value;
}

/** Strict structural check, unlike `IsLightValue` above: catches a hand-edited `assets-meta.json` entry that's missing `brightness`/`tint`/`range` or has the wrong type for one - which would otherwise flow silently into `BakeLighting` as `NaN`/`undefined` and bake to a black tint rather than fail loudly. See `AssetMetadataStore.Load`. */
export function IsCompleteLightValue(value: unknown): value is LightValue {
    return (
        IsLightValue(value) &&
        typeof value.brightness === "number" && Number.isFinite(value.brightness) &&
        typeof value.tint === "number" && Number.isFinite(value.tint) &&
        typeof value.range === "number" && Number.isFinite(value.range)
    );
}

/** A single point light: painted position plus its `LightValue` - see `BakeLighting` for what each field drives. */
export type LightSource = Vec2Like & { value: LightValue };

/** A cell's baked lighting: brightness in `[0, 1]` and the colour multiply-tint of whichever light dominates that cell - see `TileMap.LightTint`. */
export type BakedLight = { brightness: number; tint: number };

/** Brightness of a cell no light reaches at all. Keeps unlit floor visible instead of going pure black. */
export const AMBIENT_LIGHT = 0.3;

/** Tint of a cell no light reaches - neutral, so ambient floor keeps its own texture colours rather than picking up a light's hue. */
export const AMBIENT_TINT = 0xffffff;

/**
 * Bakes a set of static point lights into a per-cell `BakedLight` lookup, ready for `TileMap.LightTint`.
 *
 * `brightness` (peak, at the light's own cell) and `range` (radius in tiles) are independent authored
 * fields, so a bigger torch isn't forced to also cast further. Falloff within `range` is linear
 * (`brightness * (1 - distance / range)`), not inverse-square - inverse-square spikes unrealistically
 * near the source, where linear reads better against this project's blocky, stylised tile art.
 *
 * Overlapping lights combine by keeping whichever contributes the higher brightness at each cell - and
 * that light's own `tint` - rather than blending colours, which avoids two different-coloured torches
 * producing a muddy average nobody authored.
 *
 * Deliberately has no occlusion - light passes through walls within its radius. True shadow-casting (e.g.
 * restricting a light to its own connected region, or full line-of-sight) is a meaningfully bigger feature
 * than baking itself; add it later if it's visually needed, rather than preemptively.
 */
export function BakeLighting(lights: ReadonlyArray<LightSource>, width: number, height: number): BakedLight[][] {
    const lightData: BakedLight[][] = [];

    lights.forEach(light => {
        const peak = Math.max(0, Math.min(1, light.value.brightness));
        const radius = light.value.range;
        const tint = light.value.tint;
        if (peak <= 0 || radius <= 0) {
            return;
        }

        const minX = Math.max(0, Math.floor(light.x - radius));
        const maxX = Math.min(width - 1, Math.ceil(light.x + radius));
        const minY = Math.max(0, Math.floor(light.y - radius));
        const maxY = Math.min(height - 1, Math.ceil(light.y + radius));

        for (let x = minX; x <= maxX; x++) {
            const column = lightData[x] ?? (lightData[x] = []);
            for (let y = minY; y <= maxY; y++) {
                const distance = Math.hypot(x - light.x, y - light.y);
                if (distance > radius) {
                    continue;
                }

                const brightness = Math.max(AMBIENT_LIGHT, peak * (1 - distance / radius));
                const existing = column[y];
                if (!existing || brightness > existing.brightness) {
                    column[y] = { brightness, tint };
                }
            }
        }
    });

    return lightData;
}
