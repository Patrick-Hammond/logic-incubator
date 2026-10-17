import { describe, expect, it } from "vitest";
import { TileSize } from "../../Constants";
import { ZScale } from "../../level/Depth";
import { EffectsPlacement } from "./EffectsPlacement";
import { TileRect } from "./TilePlacement";

describe("TileRect", () => {
    const view = { centre: { x: 33.25, y: 17.5 }, baseWidth: 30, baseHeight: 20, scale: 2.5, zoom: 1.35, currentZ: 0 };

    it("on the heroes' own height, is where the entities and effects layers draw the same pixels", () => {
        const p = EffectsPlacement(view.centre, view.baseWidth, view.baseHeight, view.scale, view.zoom);
        const rect = TileRect(view, { x: 30, y: 15 }, 0, { width: TileSize, height: TileSize * 2 }, { x: 0, y: TileSize });
        expect(rect.x).toBeCloseTo(p.x + 30 * TileSize * p.scale, 6);
        expect(rect.y).toBeCloseTo(p.y + 14 * TileSize * p.scale, 6);
        expect(rect.width).toBeCloseTo(TileSize * p.scale, 6);
        expect(rect.height).toBeCloseTo(TileSize * 2 * p.scale, 6);
    });

    it("draws a higher cell bigger, from its own band's origin", () => {
        const level = TileRect(view, { x: 30, y: 15 }, 0, { width: TileSize, height: TileSize }, { x: 0, y: 0 });
        const above = TileRect(view, { x: 30, y: 15 }, 1, { width: TileSize, height: TileSize }, { x: 0, y: 0 });
        expect(above.width / level.width).toBeCloseTo(ZScale(1) / ZScale(0), 6);
        expect(above.x).not.toBeCloseTo(level.x, 1);
    });

    it("is the same for the same height difference, wherever the heroes stand", () => {
        const a = TileRect(view, { x: 30, y: 15 }, 2, { width: TileSize, height: TileSize }, { x: 0, y: 0 });
        const b = TileRect({ ...view, currentZ: 1 }, { x: 30, y: 15 }, 3, { width: TileSize, height: TileSize }, { x: 0, y: 0 });
        expect(b).toEqual(a);
    });
});
