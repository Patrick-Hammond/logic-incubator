/**
 * Static point-light baking. Pure - no pixi - so it runs under the plain node
 * test runner, same reasoning as Doors.ts/Regions.ts.
 *
 * Baked once at level load (see `Level.LoadEditorData`), not recomputed per
 * frame - this project has no moving lights, so there's no reason to pay for
 * falloff math every frame when a per-cell lookup already avoids it.
 */

import { Vec2Like } from "../../../_lib/math/Geometry";

/** A `LIGHT` data brush placement: `value` is the raw, unnormalised brush value (this project's own level data uses small integers like 1, 3, 5, 9) - see `BakeLighting` for what it drives. */
export type LightSource = Vec2Like & { value: number };

/** Top of the `LIGHT` brush's raw value scale - see `BakeLighting`. */
const LIGHT_VALUE_SCALE = 10;

/** Brightness of a cell no light reaches at all. Keeps unlit floor visible instead of going pure black. */
export const AMBIENT_LIGHT = 0.2;

/**
 * Bakes a set of static point lights into a per-cell brightness lookup, `[0, 1]`, ready for `LightTint`.
 *
 * A light's raw brush `value` drives both its peak brightness (`value / LIGHT_VALUE_SCALE`, clamped to 1) and its
 * radius in tiles (`value` itself) - one authored number controls both, so a bigger torch is both brighter and
 * casts further, rather than needing a separate "radius" field on the brush. Falloff within that radius is linear
 * (`peak * (1 - distance / radius)`), not inverse-square - inverse-square spikes unrealistically near the source,
 * where linear reads better against this project's blocky, stylised tile art.
 *
 * Overlapping lights combine with `max`, not addition: summing would need clamping anyway to stop two nearby
 * torches blowing a tile out to solid white, and `max` is the simpler way to get that same ceiling.
 *
 * Deliberately has no occlusion - light passes through walls within its radius. True shadow-casting (e.g.
 * restricting a light to its own connected region, or full line-of-sight) is a meaningfully bigger feature than
 * baking itself; add it later if it's visually needed, rather than preemptively.
 */
export function BakeLighting(lights: ReadonlyArray<LightSource>, width: number, height: number): number[][] {
    const lightData: number[][] = [];

    lights.forEach(light => {
        const peak = Math.min(1, light.value / LIGHT_VALUE_SCALE);
        const radius = light.value;
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
                column[y] = Math.max(column[y] ?? 0, brightness);
            }
        }
    });

    return lightData;
}
