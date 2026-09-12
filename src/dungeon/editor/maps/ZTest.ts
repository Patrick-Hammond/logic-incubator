import { Brush } from "../stores/LevelDataStore";

/**
 * A hand-built map for exercising height / scaling without editor painting.
 * One flat walkable grid; height comes from `data-3` brushes on a data layer
 * (same as the editor workflow), covering every cell of the raised areas:
 *
 *   low room    x  2..18   h 0   -- player spawns here, door on the right
 *   step strip  x 19..24   h 1,1,2,2,3,3   -- walled top & bottom
 *   high room   x 25..41   h 3   -- door on the left
 *
 * Walking the strip snaps the world a geometric notch per height change; the
 * band under the player stays 1:1 and the level below recedes.
 */

const TILE_LAYER = 0;
const DATA_LAYER = 999; // any id not used by a tile layer -> parsed as data
const ROW = 8;
const STEP_H = [1, 1, 2, 2, 3, 3]; // height for strip columns x = 19..24
const HIGH_H = 3;

function mk(name: string, x: number, y: number, layerId: number, data: number = null): Brush {
    return {
        name,
        position: { x, y },
        pixelOffset: { x: 0, y: 0 },
        rotation: 0,
        scale: { x: 1, y: 1 },
        layerId,
        data
    };
}

/** Paint a data-3 (height) brush - skipped for height 0 (the unpainted default). */
function height(out: Brush[], x: number, y: number, h: number): void {
    if (h > 0) {
        out.push(mk("data-3", x, y, DATA_LAYER, h));
    }
}

function room(out: Brush[], x0: number, y0: number, x1: number, y1: number, h: number, door: "left" | "right"): void {
    const doorY = (y0 + y1) >> 1;
    for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) {
            const perimeter = x === x0 || x === x1 || y === y0 || y === y1;
            const isDoor = (door === "right" && x === x1 && y === doorY) || (door === "left" && x === x0 && y === doorY);
            if (perimeter && !isDoor) {
                out.push(mk("wall_mid", x, y, TILE_LAYER));
                out.push(mk("data-2", x, y, DATA_LAYER));
            } else {
                out.push(mk("floor_1", x, y, TILE_LAYER));
            }
            height(out, x, y, h);
        }
    }
}

export function GenerateZTest(): Brush[] {
    const out: Brush[] = [];

    room(out, 2, 2, 18, 14, 0, "right");
    out.push(mk("data-1", 5, ROW, DATA_LAYER)); // spawn

    STEP_H.forEach((h, i) => {
        const x = 19 + i;
        out.push(mk("floor_1", x, ROW, TILE_LAYER));
        out.push(mk("wall_mid", x, ROW - 1, TILE_LAYER));
        out.push(mk("data-2", x, ROW - 1, DATA_LAYER));
        out.push(mk("wall_mid", x, ROW + 1, TILE_LAYER));
        out.push(mk("data-2", x, ROW + 1, DATA_LAYER));
        // height covers the whole strip footprint so walls scale with the floor
        height(out, x, ROW - 1, h);
        height(out, x, ROW, h);
        height(out, x, ROW + 1, h);
    });

    room(out, 25, 2, 41, 14, HIGH_H, "left");

    return out;
}
