import { describe, expect, it } from "vitest";
import { TileSize } from "../../Constants";
import { ViewOrigin } from "./CameraWindow";
import { EffectsPlacement } from "./EffectsPlacement";

describe("EffectsPlacement", () => {
    it("at no zoom: the camera's scale, and the view origin in pixels (worked by hand)", () => {
        // A 30 x 20 tile window centred on (20, 10) starts at tile (5, 0).
        const p = EffectsPlacement({ x: 20, y: 10 }, 30, 20, 2, 1);

        expect(p.scale).toBe(2);
        expect(p.x).toBe(-5 * TileSize * 2);
        expect(p.y).toBeCloseTo(0, 9); // (-0 for an origin of 0)
    });

    it("multiplies the camera's scale by the zoom, and takes the origin of the zoomed window", () => {
        // Zoomed 2x the window is 15 x 10 tiles: centred on (20, 10) it starts at (12.5, 5).
        const p = EffectsPlacement({ x: 20, y: 10 }, 30, 20, 2, 2);

        expect(p.scale).toBe(4);
        expect(p.x).toBe(-12.5 * TileSize * 4);
        expect(p.y).toBe(-5 * TileSize * 4);
    });

    it("draws a world point where EntityRenderer's layer does: (world - origin * TileSize) * scale", () => {
        const centre = { x: 33.25, y: 17.5 };
        const [baseW, baseH, cameraScale, zoom] = [30, 20, 2.5, 1.35];
        const origin = ViewOrigin(centre, baseW, baseH, zoom);
        const p = EffectsPlacement(centre, baseW, baseH, cameraScale, zoom);

        [{ x: 0, y: 0 }, { x: 517, y: 288 }, { x: 40 * TileSize, y: 9.5 * TileSize }].forEach(world => {
            const entitiesLayer = {
                x: (world.x - origin.x * TileSize) * (cameraScale * zoom),
                y: (world.y - origin.y * TileSize) * (cameraScale * zoom),
            };
            expect(world.x * p.scale + p.x).toBeCloseTo(entitiesLayer.x, 9);
            expect(world.y * p.scale + p.y).toBeCloseTo(entitiesLayer.y, 9);
        });
    });

    it("keeps the middle of the view on the middle of the screen, whatever the zoom", () => {
        const centre = { x: 12.75, y: 8.25 };
        const [baseW, baseH, cameraScale] = [30, 20, 3];

        [1, 1.2, 0.8, 2].forEach(zoom => {
            const p = EffectsPlacement(centre, baseW, baseH, cameraScale, zoom);

            expect(centre.x * TileSize * p.scale + p.x).toBeCloseTo((baseW * TileSize * cameraScale) / 2, 9);
            expect(centre.y * TileSize * p.scale + p.y).toBeCloseTo((baseH * TileSize * cameraScale) / 2, 9);
        });
    });
});
