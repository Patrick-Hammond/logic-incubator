/**
 * Static point-light baking onto the corners of the tile grid. Pure - no pixi -
 * so it runs under the plain node test runner, same reasoning as Doors.ts/Regions.ts.
 *
 * Light is worked out at tile corners rather than per tile, and each tile is drawn
 * with its four corners' light (`TileOptions.cornerTints`), so the GPU blends it
 * smoothly across the tile instead of stepping a whole tile at a time. Baked once at
 * level load (see `Level.LoadLevel`), not recomputed per frame.
 *
 * Walls cast soft shadows (rays from across each light's flame to every corner it
 * reaches) and shade the floor at their foot (corner ambient occlusion). Each light's
 * shadowed reach is kept as its own `LightShape`, so the grid can be rebuilt cheaply
 * with lights at new strengths (`ComposeLighting`) without casting rays again.
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

/**
 * What stops light on a `width` x `height` grid, one entry per cell, row by row: `opaque` is 1 for a cell
 * light can't pass (see `LightBlockersFor`) and `floor` is the cell's painted height (see `Depth.ts`).
 */
export type LightBlockers = { width: number; height: number; opaque: Uint8Array; floor: Float32Array };

/** A grid nothing blocks: every cell clear and at height 0. */
export function OpenLightBlockers(width: number, height: number): LightBlockers {
    const cells = Math.max(0, width) * Math.max(0, height);
    return { width: Math.max(0, width), height: Math.max(0, height), opaque: new Uint8Array(cells), floor: new Float32Array(cells) };
}

/**
 * Works out which cells block light. A cell is opaque where `solid` says so (walls, painted collision), unless
 * a tile over it says otherwise with `AssetMetadata.blocksLight`: `true` from any tile there makes it opaque,
 * and otherwise `false` from any tile there lets light through. `floor` gives each cell's height.
 */
export function LightBlockersFor(
    width: number,
    height: number,
    solid: (x: number, y: number) => boolean,
    floor: (x: number, y: number) => number,
    overrides: ReadonlyArray<{ x: number; y: number; blocks: boolean }>
): LightBlockers {
    const blockers = OpenLightBlockers(width, height);
    const forced = new Map<number, boolean>();
    overrides.forEach(({ x, y, blocks }) => {
        if (x >= 0 && y >= 0 && x < blockers.width && y < blockers.height) {
            const cell = y * blockers.width + x;
            forced.set(cell, forced.get(cell) === true || blocks);
        }
    });
    for (let y = 0; y < blockers.height; y++) {
        for (let x = 0; x < blockers.width; x++) {
            const cell = y * blockers.width + x;
            const override = forced.get(cell);
            blockers.opaque[cell] = (override !== undefined ? override : solid(x, y)) ? 1 : 0;
            blockers.floor[cell] = floor(x, y) || 0;
        }
    }
    return blockers;
}

/** Off the grid nothing blocks. */
function IsOpaque(blockers: LightBlockers, x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < blockers.width && y < blockers.height && blockers.opaque[y * blockers.width + x] === 1;
}

function FloorAt(blockers: LightBlockers, x: number, y: number): number {
    return x >= 0 && y >= 0 && x < blockers.width && y < blockers.height ? blockers.floor[y * blockers.width + x] : 0;
}

/** How far above its cell's floor a light sits, in height steps. A step of height is taken to be as tall as a tile is wide, so a stair (one step per tile) slopes at 45 degrees. */
export const LIGHT_HEIGHT = 1.5;

/** Radius of a light's flame, in tiles. Light is cast from points across it, so a shadow's edge softens the further it falls from what casts it. */
export const LIGHT_RADIUS = 0.35;

/** How far a light on a cell that blocks light (a torch on a wall) is moved past that cell's edge - see `LightOrigin`. */
const WALL_LIGHT_OFFSET = 0.1;

/** How much higher than a light's path a cell's floor must be before it blocks the light. Leaves room for the path to clip the edge of a stair step. */
const HEIGHT_TOLERANCE = 0.5;

/** Points across a light's flame, as offsets in units of `LIGHT_RADIUS`: a sunflower spiral, so they cover the disc evenly. */
const FLAME_POINTS = (() => {
    const count = 16;
    const points: number[] = [];
    for (let i = 0; i < count; i++) {
        const r = Math.sqrt((i + 0.5) / count);
        const angle = i * 2.399963229728653;
        points.push(r * Math.cos(angle), r * Math.sin(angle));
    }
    return points;
})();

/**
 * Where light leaves a light placed on cell `(x, y)`: the cell's centre. A light on a cell that blocks light,
 * such as a torch hung on a wall, shines from just past the edge of the first open side - south, east, west,
 * then north - so it lights the room it faces and not whatever is behind the wall. With no open side it stays
 * at the centre and lights only its own cell.
 */
export function LightOrigin(blockers: LightBlockers, x: number, y: number): Vec2Like {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    if (IsOpaque(blockers, cx, cy)) {
        const sides = [[0, 1], [1, 0], [-1, 0], [0, -1]];
        for (let i = 0; i < sides.length; i++) {
            const dx = sides[i][0];
            const dy = sides[i][1];
            if (!IsOpaque(blockers, cx + dx, cy + dy)) {
                return { x: cx + 0.5 + dx * (0.5 + WALL_LIGHT_OFFSET), y: cy + 0.5 + dy * (0.5 + WALL_LIGHT_OFFSET) };
            }
        }
    }
    return { x: cx + 0.5, y: cy + 0.5 };
}

/**
 * Whether light gets from `(sx, sy)`, at height `sourceHeight`, to `(tx, ty)`. Walks every cell the line
 * crosses after the first: an opaque one stops it, and so does one whose floor stands above the line by more
 * than `HEIGHT_TOLERANCE` - the line runs from the light down (or up) to the floor of the cell it ends in. A
 * line through the exact point where two cells meet corner to corner is stopped only if both are opaque.
 */
function IsPathClear(blockers: LightBlockers, sx: number, sy: number, sourceHeight: number, tx: number, ty: number): boolean {
    let cx = Math.floor(sx);
    let cy = Math.floor(sy);
    const ex = Math.floor(tx);
    const ey = Math.floor(ty);
    const dx = tx - sx;
    const dy = ty - sy;
    const stepX = dx > 0 ? 1 : -1;
    const stepY = dy > 0 ? 1 : -1;
    const deltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
    const deltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
    let nextX = dx !== 0 ? (dx > 0 ? cx + 1 - sx : sx - cx) * deltaX : Infinity;
    let nextY = dy !== 0 ? (dy > 0 ? cy + 1 - sy : sy - cy) * deltaY : Infinity;
    const targetHeight = FloorAt(blockers, ex, ey);
    // A line can't cross more cells than this; it's only a guard against rounding stepping past the end.
    let steps = Math.abs(ex - cx) + Math.abs(ey - cy) + 2;

    while ((cx !== ex || cy !== ey) && steps-- > 0) {
        let entered: number;
        if (Math.abs(nextX - nextY) < 1e-9) {
            if (IsOpaque(blockers, cx + stepX, cy) && IsOpaque(blockers, cx, cy + stepY)) {
                return false;
            }
            cx += stepX;
            cy += stepY;
            entered = nextX;
            nextX += deltaX;
            nextY += deltaY;
        } else if (nextX < nextY) {
            cx += stepX;
            entered = nextX;
            nextX += deltaX;
        } else {
            cy += stepY;
            entered = nextY;
            nextY += deltaY;
        }
        if (IsOpaque(blockers, cx, cy)) {
            return false;
        }
        if (cx === ex && cy === ey) {
            return true;
        }
        const middle = (entered + Math.min(nextX, nextY, 1)) / 2;
        const lineHeight = sourceHeight + (targetHeight - sourceHeight) * middle;
        if (FloorAt(blockers, cx, cy) - lineHeight > HEIGHT_TOLERANCE) {
            return false;
        }
    }
    return true;
}

/**
 * One light's reach, baked against what blocks it: `corners` lists the grid corners it reaches (as indexes,
 * row by row) and `shares` the part of its light that gets to each - `LightFalloff` times how much of its flame
 * the corner can see. `rgb` is its colour times its brightness. Kept per light so its strength can change, for a
 * flickering torch, without casting its rays again: see `ComposeLighting`.
 */
export type LightShape = { origin: Vec2Like; rgb: number[]; corners: Uint32Array; shares: Float32Array };

/** How much of a light reaches corner `(x, y)` past the walls, from 0 to 1: the share of `flame` points (pairs of x, y) with a clear line to it. */
function CornerVisibility(blockers: LightBlockers, flame: number[], sourceHeight: number, x: number, y: number): number {
    let clear = 0;
    for (let i = 0; i < flame.length; i += 2) {
        // Aim just short of the corner, so the line ends in the cell beside it on the light's side: a wall's
        // corners facing the light are lit and the ones behind it aren't, and no light leaks past a wall's far edge.
        const toLightX = flame[i] - x;
        const toLightY = flame[i + 1] - y;
        const length = Math.sqrt(toLightX * toLightX + toLightY * toLightY);
        const nudge = length > 0 ? 0.01 / length : 0;
        if (IsPathClear(blockers, flame[i], flame[i + 1], sourceHeight, x + toLightX * nudge, y + toLightY * nudge)) {
            clear++;
        }
    }
    return clear / (flame.length / 2);
}

/** Whether anything in cells `[x0, x1] x [y0, y1]` could block light: an opaque cell, or floors at different heights. */
function AnyBlockerIn(blockers: LightBlockers, x0: number, y0: number, x1: number, y1: number): boolean {
    const height = FloorAt(blockers, x0, y0);
    for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
            if (IsOpaque(blockers, x, y) || FloorAt(blockers, x, y) !== height) {
                return true;
            }
        }
    }
    return false;
}

/**
 * Bakes one light against `blockers` (see `LightShape`). Its `brightness` is clamped to `[0, MAX_BRIGHTNESS]`; a
 * light with no brightness or range reaches nothing. Light leaves from `LightOrigin` and fades by `LightFalloff`
 * over `range` tiles. Each corner gets the share of the flame (`LIGHT_RADIUS` across) it has a clear line to, so
 * shadows have soft edges that widen with distance.
 */
export function BakeLightShape(light: LightSource, blockers: LightBlockers): LightShape {
    const brightness = Math.max(0, Math.min(MAX_BRIGHTNESS, light.value.brightness));
    const range = light.value.range;
    const origin = LightOrigin(blockers, light.x, light.y);
    const shape: LightShape = { origin, rgb: Channels(light.value.tint, brightness, [0, 0, 0]), corners: new Uint32Array(0), shares: new Float32Array(0) };
    if (!(brightness > 0) || !(range > 0)) {
        return shape;
    }

    const columns = blockers.width + 1;
    const rows = blockers.height + 1;
    const minX = Math.max(0, Math.ceil(origin.x - range));
    const maxX = Math.min(columns - 1, Math.floor(origin.x + range));
    const minY = Math.max(0, Math.ceil(origin.y - range));
    const maxY = Math.min(rows - 1, Math.floor(origin.y + range));

    // The flame's points that sit in open cells: a light pushed off a wall loses the half still inside it.
    const flame: number[] = [];
    for (let i = 0; i < FLAME_POINTS.length; i += 2) {
        const px = origin.x + FLAME_POINTS[i] * LIGHT_RADIUS;
        const py = origin.y + FLAME_POINTS[i + 1] * LIGHT_RADIUS;
        if (!IsOpaque(blockers, Math.floor(px), Math.floor(py))) {
            flame.push(px, py);
        }
    }
    if (flame.length === 0) {
        flame.push(origin.x, origin.y);
    }
    const sourceHeight = FloorAt(blockers, Math.floor(origin.x), Math.floor(origin.y)) + LIGHT_HEIGHT;
    const open = !AnyBlockerIn(blockers, minX - 1, minY - 1, maxX, maxY);

    const corners: number[] = [];
    const shares: number[] = [];
    for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
            const falloff = LightFalloff(Math.hypot(x - origin.x, y - origin.y), range);
            if (falloff > 0) {
                const share = open ? falloff : falloff * CornerVisibility(blockers, flame, sourceHeight, x, y);
                if (share > 0) {
                    corners.push(y * columns + x);
                    shares.push(share);
                }
            }
        }
    }
    shape.corners = new Uint32Array(corners);
    shape.shares = new Float32Array(shares);
    return shape;
}

/** Light left at a corner by how many of the four cells around it are walls (or floors well above the lowest of them): 0 through 4. Darkens the floor along the foot of a wall, more so in a room's corners. */
export const CORNER_OCCLUSION = [1, 0.85, 0.7, 0.6, 0.5];

/** How much higher than the lowest open cell at a corner a cell's floor must be to shade the corner like a wall. One step is a stair; two is a ledge. */
const OCCLUDING_HEIGHT = 2;

/** The share of light each grid corner keeps after ambient occlusion (see `CORNER_OCCLUSION`), row by row. */
export function CornerOcclusion(blockers: LightBlockers): Float32Array {
    const columns = blockers.width + 1;
    const rows = blockers.height + 1;
    const occlusion = new Float32Array(columns * rows);
    const around = [[-1, -1], [0, -1], [-1, 0], [0, 0]];
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < columns; x++) {
            let lowest = Infinity;
            around.forEach(([dx, dy]) => {
                if (!IsOpaque(blockers, x + dx, y + dy)) {
                    lowest = Math.min(lowest, FloorAt(blockers, x + dx, y + dy));
                }
            });
            let shading = 0;
            around.forEach(([dx, dy]) => {
                if (IsOpaque(blockers, x + dx, y + dy) || FloorAt(blockers, x + dx, y + dy) - lowest >= OCCLUDING_HEIGHT) {
                    shading++;
                }
            });
            occlusion[y * columns + x] = CORNER_OCCLUSION[shading];
        }
    }
    return occlusion;
}

/** Everything the light grid is built from: each light's baked shape and each corner's ambient occlusion. Kept by `Level` so the grid can be rebuilt with lights at new strengths - see `ComposeLighting`. */
export type LightBake = { width: number; height: number; occlusion: Float32Array; shapes: LightShape[] };

/** Bakes `lights` against `blockers`: one `LightShape` per light, in order, plus the corners' occlusion. */
export function BakeLights(lights: ReadonlyArray<LightSource>, blockers: LightBlockers): LightBake {
    return {
        width: blockers.width,
        height: blockers.height,
        occlusion: CornerOcclusion(blockers),
        shapes: lights.map(light => BakeLightShape(light, blockers))
    };
}

/**
 * Builds the light grid from a bake. Every corner starts at the ambient light and each light's colour times its
 * share there is added on top; then the corner's occlusion darkens the total, and each channel is capped at
 * `MAX_LIGHT`. Adding (rather than keeping the brightest) means two torches brighten the space between them
 * instead of meeting in a crease.
 *
 * `scales`, one per shape, multiplies each light's strength - 1 if left out - so a torch can flicker without
 * casting its rays again. Pass the grid from last time as `out` to fill it in place.
 */
export function ComposeLighting(bake: LightBake, scales?: ArrayLike<number>, out?: LightGrid): LightGrid {
    const columns = bake.width + 1;
    const rows = bake.height + 1;
    const grid = out && out.width === bake.width && out.height === bake.height
        ? out
        : { width: bake.width, height: bake.height, data: new Float32Array(columns * rows * 3) };
    const data = grid.data;
    const rgb = Channels(AMBIENT_TINT, AMBIENT_LIGHT, [0, 0, 0]);
    for (let c = 0; c < data.length; c += 3) {
        data[c] = rgb[0];
        data[c + 1] = rgb[1];
        data[c + 2] = rgb[2];
    }

    bake.shapes.forEach((shape, i) => {
        const scale = scales ? scales[i] : 1;
        if (!(scale > 0)) {
            return;
        }
        const r = shape.rgb[0] * scale;
        const g = shape.rgb[1] * scale;
        const b = shape.rgb[2] * scale;
        for (let k = 0; k < shape.corners.length; k++) {
            const c = shape.corners[k] * 3;
            const share = shape.shares[k];
            data[c] += r * share;
            data[c + 1] += g * share;
            data[c + 2] += b * share;
        }
    });

    for (let corner = 0, c = 0; corner < bake.occlusion.length; corner++, c += 3) {
        const keep = bake.occlusion[corner];
        data[c] = Math.min(MAX_LIGHT, data[c] * keep);
        data[c + 1] = Math.min(MAX_LIGHT, data[c + 1] * keep);
        data[c + 2] = Math.min(MAX_LIGHT, data[c + 2] * keep);
    }
    return grid;
}

/** A grid of `width` x `height` cells lit only by the ambient light. */
export function AmbientLightGrid(width: number, height: number): LightGrid {
    return BakeLighting([], width, height);
}

/**
 * Bakes a set of static point lights onto the corners of a `width` x `height` grid, ready for
 * `CellCornerLight`/`SampleLight`: `BakeLights` then `ComposeLighting`, in one go.
 *
 * Each light sits at the centre of its cell (see `LightOrigin`). `brightness` (clamped to `[0, MAX_BRIGHTNESS]`)
 * is its strength there and `range` how far it reaches in tiles; the two are independent, so a brighter torch
 * isn't forced to also cast further. `blockers`, the same size as the grid, casts shadows and shades corners
 * beside walls; leave it out and light passes everywhere.
 */
export function BakeLighting(lights: ReadonlyArray<LightSource>, width: number, height: number, blockers?: LightBlockers): LightGrid {
    return ComposeLighting(BakeLights(lights, blockers || OpenLightBlockers(width, height)));
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
