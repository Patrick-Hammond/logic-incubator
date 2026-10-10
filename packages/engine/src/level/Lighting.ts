/**
 * Static point-light baking onto the corners of the tile grid. Pure - no pixi -
 * so it runs under the plain node test runner, same reasoning as Doors.ts/Regions.ts.
 *
 * Light is worked out at tile corners rather than per tile, and each tile is drawn
 * with its four corners' light (`TileOptions.cornerTints`), so the GPU blends it
 * smoothly across the tile instead of stepping a whole tile at a time. Baked once at
 * level load (see `Level.LoadLevel`), not recomputed per frame.
 */

import { Vec2Like } from "@logic-incubator/lib/math/Geometry";

/** A light's authored properties - either painted with the `LIGHT` data brush, or intrinsic to a tile via `AssetMetadata.light` (see `Level.LoadLevel`). */
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

/**
 * Baked light at every corner of the tile grid: red, green and blue per corner, row by row,
 * `(width + 1) * (height + 1)` corners for a `width` x `height` map. Corner `(x, y)` is the
 * top-left corner of cell `(x, y)`. A value of 1 leaves a texture's colour as it is; above 1
 * brightens it (up to `MAX_LIGHT`).
 */
export type LightGrid = { width: number; height: number; data: Float32Array };

/** Brightness of a corner no light reaches at all. Keeps unlit floor readable instead of going black. */
export const AMBIENT_LIGHT = 0.3;

/** Colour of the ambient light - a cool blue, so warm torchlight stands out against the dark around it. */
export const AMBIENT_TINT = 0xa0b2ff;

/** Highest light any channel can reach once lights add up. Above 1 a light warms and lifts a texture past its own colours; the cap stops a cluster of torches washing the art out to white. */
export const MAX_LIGHT = 1.6;

/** Highest `brightness` a light can have. Brightness is the light's strength at its own cell, added on top of the ambient light. */
export const MAX_BRIGHTNESS = 2;

/** Highest light a sprite takes (see `FootLight`) - lower than `MAX_LIGHT`, so a hero standing by a torch is lit by it without being bleached. */
export const MAX_SPRITE_LIGHT = 1.25;

/**
 * Share of a light's brightness that reaches `distance` tiles from it: `(1 - (d / range)^2)^2`.
 * Full at the light, and both the value and its slope reach zero at `range`, so a light fades out
 * without a visible rim. (A straight-line falloff keeps the same slope right up to its edge, which
 * reads as a hard ring; inverse-square never reaches zero, so it needs a cut that brings the ring back.)
 */
export function LightFalloff(distance: number, range: number): number {
    if (range <= 0 || distance >= range) {
        return 0;
    }
    const q = 1 - (distance * distance) / (range * range);
    return q * q;
}

function Channels(colour: number, scale: number, out: number[]): number[] {
    out[0] = ((colour >> 16) & 0xff) / 255 * scale;
    out[1] = ((colour >> 8) & 0xff) / 255 * scale;
    out[2] = (colour & 0xff) / 255 * scale;
    return out;
}

/** A grid of `width` x `height` cells lit only by the ambient light. */
export function AmbientLightGrid(width: number, height: number): LightGrid {
    return BakeLighting([], width, height);
}

/**
 * Bakes a set of static point lights onto the corners of a `width` x `height` grid, ready for
 * `CellCornerLight`/`SampleLight`.
 *
 * Each light sits at the centre of its cell. `brightness` (clamped to `[0, MAX_BRIGHTNESS]`) is its
 * strength there and `range` how far it reaches in tiles; the two are independent, so a brighter torch
 * isn't forced to also cast further. Within `range` it fades by `LightFalloff`.
 *
 * Every corner starts at the ambient light and each light's `tint * brightness * falloff` is added on
 * top, capped per channel at `MAX_LIGHT`. Adding (rather than keeping the brightest) means two torches
 * brighten the space between them instead of meeting in a crease.
 *
 * No occlusion yet - light passes through walls within its range.
 */
export function BakeLighting(lights: ReadonlyArray<LightSource>, width: number, height: number): LightGrid {
    const columns = Math.max(0, width) + 1;
    const rows = Math.max(0, height) + 1;
    const data = new Float32Array(columns * rows * 3);
    const rgb = [0, 0, 0];

    Channels(AMBIENT_TINT, AMBIENT_LIGHT, rgb);
    for (let c = 0; c < data.length; c += 3) {
        data[c] = rgb[0];
        data[c + 1] = rgb[1];
        data[c + 2] = rgb[2];
    }

    lights.forEach(light => {
        const brightness = Math.max(0, Math.min(MAX_BRIGHTNESS, light.value.brightness));
        const range = light.value.range;
        if (!(brightness > 0) || !(range > 0)) {
            return;
        }
        Channels(light.value.tint, brightness, rgb);

        const lightX = light.x + 0.5;
        const lightY = light.y + 0.5;
        const minX = Math.max(0, Math.ceil(lightX - range));
        const maxX = Math.min(columns - 1, Math.floor(lightX + range));
        const minY = Math.max(0, Math.ceil(lightY - range));
        const maxY = Math.min(rows - 1, Math.floor(lightY + range));

        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                const share = LightFalloff(Math.hypot(x - lightX, y - lightY), range);
                if (share > 0) {
                    const c = (y * columns + x) * 3;
                    data[c] += rgb[0] * share;
                    data[c + 1] += rgb[1] * share;
                    data[c + 2] += rgb[2] * share;
                }
            }
        }
    });

    for (let c = 0; c < data.length; c++) {
        if (data[c] > MAX_LIGHT) {
            data[c] = MAX_LIGHT;
        }
    }

    return { width: Math.max(0, width), height: Math.max(0, height), data };
}

/**
 * The light at the four corners of cell `(x, y)`, written into `out` as 12 numbers - red, green, blue
 * for the top-left, top-right, bottom-right and bottom-left corners, the order
 * `TileOptions.cornerTints` takes. A cell off the grid takes the nearest cell's corners.
 */
export function CellCornerLight(grid: LightGrid, x: number, y: number, out: number[] | Float32Array): number[] | Float32Array {
    if (grid.width <= 0 || grid.height <= 0) {
        const ambient = Channels(AMBIENT_TINT, AMBIENT_LIGHT, [0, 0, 0]);
        for (let k = 0; k < 12; k++) {
            out[k] = ambient[k % 3];
        }
        return out;
    }
    const columns = grid.width + 1;
    const cx = Math.max(0, Math.min(grid.width - 1, x | 0));
    const cy = Math.max(0, Math.min(grid.height - 1, y | 0));
    const topLeft = (cy * columns + cx) * 3;
    const bottomLeft = topLeft + columns * 3;
    const data = grid.data;
    out[0] = data[topLeft]; out[1] = data[topLeft + 1]; out[2] = data[topLeft + 2];
    out[3] = data[topLeft + 3]; out[4] = data[topLeft + 4]; out[5] = data[topLeft + 5];
    out[6] = data[bottomLeft + 3]; out[7] = data[bottomLeft + 4]; out[8] = data[bottomLeft + 5];
    out[9] = data[bottomLeft]; out[10] = data[bottomLeft + 1]; out[11] = data[bottomLeft + 2];
    return out;
}

/** The light at a point `(x, y)` in tile units (corner `(0, 0)` is the grid's top-left), blended between the four corners around it. A point off the grid takes the nearest edge. Written into `out` as red, green, blue. */
export function SampleLight(grid: LightGrid, x: number, y: number, out: number[]): number[] {
    const columns = grid.width + 1;
    if (grid.width <= 0 || grid.height <= 0) {
        return Channels(AMBIENT_TINT, AMBIENT_LIGHT, out);
    }
    const gx = Math.max(0, Math.min(grid.width, x));
    const gy = Math.max(0, Math.min(grid.height, y));
    const x0 = Math.min(grid.width - 1, Math.floor(gx));
    const y0 = Math.min(grid.height - 1, Math.floor(gy));
    const fx = gx - x0;
    const fy = gy - y0;
    const c00 = (y0 * columns + x0) * 3;
    const c01 = c00 + columns * 3;
    const data = grid.data;
    for (let k = 0; k < 3; k++) {
        const top = data[c00 + k] + (data[c00 + 3 + k] - data[c00 + k]) * fx;
        const bottom = data[c01 + k] + (data[c01 + 3 + k] - data[c01 + k]) * fx;
        out[k] = top + (bottom - top) * fy;
    }
    return out;
}

/**
 * Corner light for a sprite standing on the grid: the floor's light just inside its feet at `left`
 * and `right` (tile units, along the row `feetY`), so it shades across its width as it walks into a
 * light and never steps a tile at a time. Top corners take the same light as the bottom ones - a
 * standing figure is lit by the ground it stands on, not by whatever is drawn behind its head.
 * Capped at `MAX_SPRITE_LIGHT`. Written into `out` in `CellCornerLight`'s order.
 */
export function FootLight(grid: LightGrid, left: number, right: number, feetY: number, out: number[] | Float32Array): number[] | Float32Array {
    const l = SampleLight(grid, left, feetY, [0, 0, 0]);
    const r = SampleLight(grid, right, feetY, [0, 0, 0]);
    for (let k = 0; k < 3; k++) {
        const lk = Math.min(MAX_SPRITE_LIGHT, l[k]);
        const rk = Math.min(MAX_SPRITE_LIGHT, r[k]);
        out[k] = lk;
        out[3 + k] = rk;
        out[6 + k] = rk;
        out[9 + k] = lk;
    }
    return out;
}

/** Packs a red, green, blue light into a `0xRRGGBB` multiply tint for a plain pixi sprite, whose tint can only darken: channels above 1 are capped at 1. */
export function LightToTint(rgb: ArrayLike<number>): number {
    const channel = (v: number): number => Math.round(Math.max(0, Math.min(1, v)) * 255);
    return (channel(rgb[0]) << 16) | (channel(rgb[1]) << 8) | channel(rgb[2]);
}
