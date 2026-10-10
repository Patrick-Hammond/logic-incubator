import { describe, expect, it } from "vitest";
import { TileSize } from "../../Constants";
import { MinPartyZoom, PartyBounds, PartyMargin, PartySpan, PartyZoom } from "./PartyFrame";

const VIEW = { width: 30, height: 22 };

function Box(tilesWide: number, tilesHigh: number) {
    return { minX: 0, minY: 0, maxX: tilesWide * TileSize, maxY: tilesHigh * TileSize };
}

describe("PartyFrame", () => {
    it("bounds the heroes' top-lefts", () => {
        expect(PartyBounds([{ x: 5, y: 40 }, { x: -3, y: 2 }, { x: 9, y: 7 }])).toEqual({ minX: -3, minY: 2, maxX: 9, maxY: 40 });
        expect(PartyBounds([])).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
    });

    it("keeps the usual zoom while the party fits", () => {
        expect(PartyZoom(Box(0, 0), VIEW)).toBe(1);
        expect(PartyZoom(Box(VIEW.width - 1 - PartyMargin * 2, 0), VIEW)).toBe(1);
    });

    it("zooms out as they spread - by whichever way is tighter - but no further than the minimum", () => {
        const wide = PartyZoom(Box(VIEW.width * 1.5 - 1 - PartyMargin * 2, 0), VIEW);
        expect(wide).toBeCloseTo(1 / 1.5);
        const tall = PartyZoom(Box(0, VIEW.height * 1.5 - 1 - PartyMargin * 2), VIEW);
        expect(tall).toBeCloseTo(1 / 1.5);
        expect(PartyZoom(Box(500, 500), VIEW)).toBe(MinPartyZoom);
    });

    it("lets them spread exactly as far as fits on screen at the minimum zoom", () => {
        const span = PartySpan(VIEW);
        expect(PartyZoom(Box(span.width, span.height), VIEW)).toBeCloseTo(MinPartyZoom);
        expect(PartyZoom(Box(span.width - 4, 0), VIEW)).toBeGreaterThan(MinPartyZoom);
    });
});
