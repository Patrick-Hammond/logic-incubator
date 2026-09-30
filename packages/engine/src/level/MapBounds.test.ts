import { describe, expect, it } from "vitest";
import { FindMapBounds } from "./MapBounds";

describe("FindMapBounds", () => {
    it("returns zeroed bounds for an empty brush list, same as a single brush at the origin", () => {
        const empty = FindMapBounds([]);
        expect(empty).toEqual({ x1: 0, y1: 0, x2: 0, y2: 0 });
        expect(empty).toEqual(FindMapBounds([{ position: { x: 0, y: 0 } }]));
    });

    it("does not overflow when turned into a width/height, unlike the unguarded MAX_VALUE/MIN_VALUE sentinels", () => {
        const { x1, y1, x2, y2 } = FindMapBounds([]);
        expect(Number.isFinite(x2 - x1)).toBe(true);
        expect(Number.isFinite(y2 - y1)).toBe(true);
        expect(x2 - x1).toBeGreaterThanOrEqual(0);
        expect(y2 - y1).toBeGreaterThanOrEqual(0);
    });

    it("collapses to a point for a single brush", () => {
        expect(FindMapBounds([{ position: { x: 5, y: -3 } }])).toEqual({ x1: 5, y1: -3, x2: 5, y2: -3 });
    });

    it("spans the min/max cell on each axis independently across several brushes", () => {
        const bounds = FindMapBounds([
            { position: { x: 2, y: 10 } },
            { position: { x: -4, y: 1 } },
            { position: { x: 7, y: -6 } }
        ]);
        expect(bounds).toEqual({ x1: -4, y1: -6, x2: 7, y2: 10 });
    });
});
