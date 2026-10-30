/**
 * The height layer's sums (see `HEIGHT_LAYER_ID`): the cells' heights as painted, what painting one with
 * a set, raise or lower brush makes it, and the colour it's drawn in on the editor's heatmap. Pure - no pixi -
 * so it runs under the plain node test runner (see Heights.test.ts).
 */

import { Vec2Like } from "@logic-incubator/lib/math/Geometry";
import { IsHeightGap } from "@logic-incubator/engine/level/Depth";
import { Brush, DataBrushName, HEIGHT_LAYER_ID } from "@logic-incubator/engine/level/LevelFormat";

/** How high or low a cell can be painted - what the +/- keys and the raise and lower brushes stop at. */
export const MaxHeight = 999;

export function ClampHeight(height: number): number {
    return Math.max(-MaxHeight, Math.min(MaxHeight, Math.round(height)));
}

export function CellKey(cell: Vec2Like): string {
    return cell.x + "," + cell.y;
}

/** Every painted cell's height, by `CellKey` - a cell that isn't in it is 0. */
export function HeightMap(levelData: ReadonlyArray<Brush>): Map<string, number> {
    const heights = new Map<string, number>();
    levelData.forEach(brush => {
        if (IsHeightBrush(brush)) {
            heights.set(CellKey(brush.position), brush.data as number);
        }
    });
    return heights;
}

/** A cell's height: what's painted there on the height layer, or 0. */
export function HeightAtCell(levelData: ReadonlyArray<Brush>, cell: Vec2Like): number {
    let height = 0;
    levelData.forEach(brush => {
        if (IsHeightBrush(brush) && brush.position.x === cell.x && brush.position.y === cell.y) {
            height = brush.data as number;
        }
    });
    return height;
}

/** A height on the height layer - the only kind of brush that's there. */
export function IsHeightBrush(brush: Brush): boolean {
    return brush.layerId === HEIGHT_LAYER_ID && brush.name === DataBrushName.Z_INDEX && typeof brush.data === "number";
}

/** The brush that makes `cell` `height` high. */
export function MakeHeightBrush(cell: Vec2Like, height: number): Brush {
    return {
        name: DataBrushName.Z_INDEX,
        position: { x: cell.x, y: cell.y },
        pixelOffset: { x: 0, y: 0 },
        rotation: 0,
        scale: { x: 1, y: 1 },
        layerId: HEIGHT_LAYER_ID,
        data: height
    };
}

/**
 * How painting changes heights: to `height`, or by `delta` - one of the two. `delta` is the raise and lower
 * brushes' (+1 and -1), `height` the set brush's and the eraser's (0).
 */
export type HeightChange = { height?: number; delta?: number };

/**
 * `levelData` with each of `cells` set to `change`'s height, or moved by its delta (once, however often it's
 * listed), within `MaxHeight`. A cell brought to 0 loses its brush, as unpainted is 0; every other brush stays
 * as it was, in order. The same array if no cell's height changes.
 */
export function WithHeights(levelData: Brush[], cells: ReadonlyArray<Vec2Like>, change: HeightChange): Brush[] {
    const wanted = new Map<string, Vec2Like>();
    cells.forEach(cell => wanted.set(CellKey(cell), cell));
    const was = new Map<string, number>();
    levelData.forEach(brush => {
        const key = CellKey(brush.position);
        if (IsHeightBrush(brush) && wanted.has(key)) {
            was.set(key, brush.data as number);
        }
    });
    const next = new Map<string, number>();
    wanted.forEach((cell, key) => {
        const before = was.get(key) || 0;
        const after = ClampHeight(change.delta != null ? before + change.delta : change.height || 0);
        if (after !== before) {
            next.set(key, after);
        }
    });
    if (!next.size) {
        return levelData;
    }
    const kept = levelData.filter(brush => !(IsHeightBrush(brush) && next.has(CellKey(brush.position))));
    const added: Brush[] = [];
    next.forEach((height, key) => {
        if (height !== 0) {
            added.push(MakeHeightBrush(wanted.get(key), height));
        }
    });
    return kept.concat(added);
}

/**
 * The heatmap's colour for a height: ground (0) isn't drawn at all; going up, teal through green, yellow, orange
 * and red to purple at 10 and above, a hue apart each step; going down, sky blue deepening to indigo at -6 and
 * below. Clamped at both ends, so a cell at 999 costs no more than one at 10 - the numbers say the rest.
 */
export function HeightColour(height: number): number {
    if (height > 0) {
        const step = Math.min(height, 10) - 1;
        return Hsl(160 - step * 15 * (step < 6 ? 1 : 1.2), 0.75, 0.5);
    }
    const step = Math.min(-height, 6) - 1;
    return Hsl(200 + step * 13, 0.7, 0.45 - step * 0.03);
}

/** Hue in degrees (any, wrapped), saturation and lightness 0-1, as 0xrrggbb. */
function Hsl(hue: number, saturation: number, lightness: number): number {
    const h = (((hue % 360) + 360) % 360) / 60;
    const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const x = c * (1 - Math.abs((h % 2) - 1));
    const m = lightness - c / 2;
    const [r, g, b] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
    const byte = (v: number) => Math.round((v + m) * 255);
    return (byte(r) << 16) | (byte(g) << 8) | byte(b);
}

/**
 * The edges between neighbouring cells whose heights differ by more than one - a step no hero can take (see
 * `IsHeightGap`) - each once, as the cell on its top or left side and which side of it. Only edges touching a
 * painted cell can be one, so it's as quick as the painted cells are few.
 */
export function BlockedEdges(heights: Map<string, number>): { x: number; y: number; side: "right" | "bottom" }[] {
    const edges: { x: number; y: number; side: "right" | "bottom" }[] = [];
    const seen = new Set<string>();
    const at = (x: number, y: number) => heights.get(x + "," + y) || 0;
    const check = (x: number, y: number, side: "right" | "bottom") => {
        const key = x + "," + y + side;
        if (seen.has(key)) {
            return;
        }
        seen.add(key);
        const other = side === "right" ? at(x + 1, y) : at(x, y + 1);
        if (IsHeightGap(at(x, y), other)) {
            edges.push({ x, y, side });
        }
    };
    heights.forEach((_, key) => {
        const comma = key.indexOf(",");
        const x = Number(key.slice(0, comma));
        const y = Number(key.slice(comma + 1));
        check(x, y, "right");
        check(x, y, "bottom");
        check(x - 1, y, "right");
        check(x, y - 1, "bottom");
    });
    return edges;
}
