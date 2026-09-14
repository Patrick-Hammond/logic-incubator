import { describe, expect, it } from "vitest";
import { CameraZoom } from "../level/Depth";
import { ViewOrigin } from "./CameraWindow";

/**
 * Regression test for the "moving up a z-index puts the player in the wrong
 * relative position" bug: TileMapView scales every band - including the
 * player's own - by `CameraZoom(currentZ)`, but Player.Render() used to pass
 * the raw `camera.ViewRect` (which ignores that zoom) as the sprite's window
 * origin instead of deriving it the same way TileMapView derives the origin
 * for the z === currentZ band. The two origins are identical at z 0
 * (CameraZoom(0) === 1) - which is why the bug was invisible before
 * CameraZoom existed, and only shows up once the player is standing at a
 * non-zero z.
 */
describe("ViewOrigin", () => {
    const centre = { x: 20, y: 15 };
    const baseWidth = 40;
    const baseHeight = 22;

    it("matches the naive (unzoomed) window origin when zScale is 1", () => {
        const origin = ViewOrigin(centre, baseWidth, baseHeight, 1);
        expect(origin.x).toBe(centre.x - baseWidth * 0.5);
        expect(origin.y).toBe(centre.y - baseHeight * 0.5);
    });

    it("shrinks the window (moves the origin toward centre) as zScale grows past 1", () => {
        const unzoomed = ViewOrigin(centre, baseWidth, baseHeight, 1);
        const zoomed = ViewOrigin(centre, baseWidth, baseHeight, 1.5);
        expect(zoomed.x).toBeGreaterThan(unzoomed.x);
        expect(zoomed.y).toBeGreaterThan(unzoomed.y);
    });

    it("player's own z-band origin (TileMapView: zScale = ZScale(0) * CameraZoom(z) = CameraZoom(z)) diverges from the naive origin for any z != 0 - this is exactly what Player.Render() must now match, not camera.ViewRect", () => {
        for (const z of [1, 2, 3]) {
            const zoom = CameraZoom(z);
            expect(zoom).not.toBe(1); // sanity: this z actually zooms

            const naiveOrigin = ViewOrigin(centre, baseWidth, baseHeight, 1); // the old, buggy formula
            const correctOrigin = ViewOrigin(centre, baseWidth, baseHeight, zoom); // what TileMapView uses for this band

            expect(correctOrigin.x, `z ${z}`).not.toBeCloseTo(naiveOrigin.x, 5);
            expect(correctOrigin.y, `z ${z}`).not.toBeCloseTo(naiveOrigin.y, 5);
        }
    });

    it("is a no-op divergence at z 0, so the pre-CameraZoom behaviour is unchanged there", () => {
        const zoom = CameraZoom(0);
        expect(zoom).toBe(1);
        const origin = ViewOrigin(centre, baseWidth, baseHeight, zoom);
        expect(origin.x).toBe(centre.x - baseWidth * 0.5);
        expect(origin.y).toBe(centre.y - baseHeight * 0.5);
    });
});
