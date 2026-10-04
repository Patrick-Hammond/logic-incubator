import { describe, expect, it } from "vitest";
import { CenterView, ClampZoom, FitView, ImageCell, ImageToScreen, MaxZoom, MinZoom, PanBy, ScreenToImage, StepZoom, View, ZoomAt, ZoomLevels } from "./Viewport";

const view = (zoom: number, x: number, y: number): View => ({ zoom, x, y });

describe("coordinates", () => {
    it("maps screen to sprite pixels and back", () => {
        const v = view(8, 100, 50);
        expect(ScreenToImage(v, 100, 50)).toEqual({ x: 0, y: 0 });
        expect(ScreenToImage(v, 108, 66)).toEqual({ x: 1, y: 2 });
        expect(ScreenToImage(v, 104, 54)).toEqual({ x: 0.5, y: 0.5 });
        expect(ImageToScreen(v, 3, 4)).toEqual({ x: 124, y: 82 });
        const p = ScreenToImage(v, 333, 211);
        const back = ImageToScreen(v, p.x, p.y);
        expect(back.x).toBeCloseTo(333, 9);
        expect(back.y).toBeCloseTo(211, 9);
    });

    it("picks the cell under the pointer, rounding down - including left of and above the sprite", () => {
        const v = view(4, 10, 10);
        expect(ImageCell(v, 10, 10)).toEqual({ x: 0, y: 0 });
        expect(ImageCell(v, 13.9, 13.9)).toEqual({ x: 0, y: 0 });
        expect(ImageCell(v, 14, 18)).toEqual({ x: 1, y: 2 });
        expect(ImageCell(v, 9, 9)).toEqual({ x: -1, y: -1 });
        expect(ImageCell(v, 0, 0)).toEqual({ x: -3, y: -3 });
    });
});

describe("zoom", () => {
    it("clamps to the supported range", () => {
        expect(ClampZoom(1000)).toBe(MaxZoom);
        expect(ClampZoom(0.001)).toBe(MinZoom);
        expect(ClampZoom(5)).toBe(5);
    });

    it("keeps the point under the cursor still", () => {
        const v = view(4, 30, 20);
        const before = ScreenToImage(v, 200, 150);
        const z = ZoomAt(v, 16, 200, 150);
        expect(z.zoom).toBe(16);
        const after = ScreenToImage(z, 200, 150);
        expect(after.x).toBeCloseTo(before.x, 9);
        expect(after.y).toBeCloseTo(before.y, 9);
    });

    it("zooms about a point and clamps the result", () => {
        const z = ZoomAt(view(32, 0, 0), 500, 10, 10);
        expect(z.zoom).toBe(MaxZoom);
    });

    it("steps through the levels from wherever it is", () => {
        expect(StepZoom(4, 1)).toBe(6);
        expect(StepZoom(4, -1)).toBe(3);
        expect(StepZoom(5, 1)).toBe(6);
        expect(StepZoom(5, -1)).toBe(4);
        expect(StepZoom(MaxZoom, 1)).toBe(MaxZoom);
        expect(StepZoom(MinZoom, -1)).toBe(MinZoom);
        expect(StepZoom(0.1, 1)).toBe(0.25);
        expect(StepZoom(1000, -1)).toBe(MaxZoom);
    });

    it("has levels in strictly increasing order", () => {
        ZoomLevels.slice(1).forEach((level, i) => expect(level).toBeGreaterThan(ZoomLevels[i]));
    });
});

describe("fitting", () => {
    it("centres a sprite in the box at a given zoom", () => {
        expect(CenterView(4, 16, 16, 300, 200)).toEqual({ zoom: 4, x: 118, y: 68 });
    });

    it("picks the biggest level whose sprite fits with the margin to spare", () => {
        // 300 - 2 * 24 = 252 pixels of height to use: 16 * 12 = 192 fits, 16 * 16 = 256 doesn't.
        expect(FitView(16, 16, 400, 300, 24).zoom).toBe(12);
        expect(FitView(32, 32, 400, 300, 24).zoom).toBe(6);
        // A wide one is held back by the width instead: 352 / 64 = 5.5, so 4.
        expect(FitView(64, 8, 400, 300, 24).zoom).toBe(4);
        expect(FitView(16, 16, 400, 300, 0).zoom).toBe(16);
    });

    it("centres what it fits", () => {
        const v = FitView(10, 10, 400, 300, 24);
        const w = 10 * v.zoom;
        expect(v.x).toBe(Math.round((400 - w) / 2));
        expect(v.y).toBe(Math.round((300 - w) / 2));
    });

    it("zooms out below 1 for a sprite bigger than the box, and never below the minimum", () => {
        expect(FitView(512, 512, 300, 300, 24).zoom).toBe(0.25);
        expect(FitView(512, 512, 600, 600, 24).zoom).toBe(1);
        expect(FitView(512, 512, 100, 100, 24).zoom).toBe(MinZoom);
    });

    it("copes with a box smaller than its own margins", () => {
        expect(FitView(16, 16, 10, 10, 24).zoom).toBe(MinZoom);
    });
});

describe("PanBy", () => {
    it("moves the view", () => {
        expect(PanBy(view(4, 100, 100), 10, -20, 16, 16, 500, 400)).toEqual({ zoom: 4, x: 110, y: 80 });
    });

    it("won't let the sprite leave the box: some of it always stays in sight", () => {
        const far = PanBy(view(4, 100, 100), 100000, 100000, 16, 16, 500, 400, 48);
        expect(far.x).toBe(500 - 48);
        expect(far.y).toBe(400 - 48);
        const back = PanBy(view(4, 100, 100), -100000, -100000, 16, 16, 500, 400, 48);
        expect(back.x).toBe(48 - 64);
        expect(back.y).toBe(48 - 64);
    });

    it("keeps the zoom", () => {
        expect(PanBy(view(6, 0, 0), 5, 5, 8, 8, 100, 100).zoom).toBe(6);
    });
});
