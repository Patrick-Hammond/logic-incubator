import { describe, expect, it } from "vitest";
import { MinSliceSize, SliceRects } from "./SliceRects";

const insets = { left: 6, top: 5, right: 7, bottom: 4 };
const frame = { width: 20, height: 14 };

describe("SliceRects", () => {
    it("cuts the frame into nine that tile it exactly", () => {
        const slices = SliceRects(frame, insets, { width: 60, height: 30 });
        expect(slices.map(s => s.part)).toEqual(["topLeft", "top", "topRight", "left", "centre", "right", "bottomLeft", "bottom", "bottomRight"]);
        // the source rectangles cover the frame with no gap and no overlap
        const area = (r: { width: number; height: number }) => r.width * r.height;
        expect(slices.reduce((sum, s) => sum + area(s.src), 0)).toBe(frame.width * frame.height);
        expect(slices.reduce((sum, s) => sum + area(s.dst), 0)).toBe(60 * 30);
    });

    it("keeps the corners as drawn and grows the edges and the middle", () => {
        const byPart = Object.fromEntries(SliceRects(frame, insets, { width: 60, height: 30 }).map(s => [s.part, s]));
        expect(byPart.topLeft.dst).toEqual({ x: 0, y: 0, width: 6, height: 5 });
        expect(byPart.bottomRight.dst).toEqual({ x: 53, y: 26, width: 7, height: 4 });
        expect(byPart.top.src).toEqual({ x: 6, y: 0, width: 7, height: 5 });
        expect(byPart.top.dst).toEqual({ x: 6, y: 0, width: 47, height: 5 });
        expect(byPart.left.dst).toEqual({ x: 0, y: 5, width: 6, height: 21 });
        expect(byPart.centre.dst).toEqual({ x: 6, y: 5, width: 47, height: 21 });
    });

    it("never goes below the corners: a smaller request is raised, and the middle disappears", () => {
        const slices = SliceRects(frame, insets, { width: 3, height: 2 });
        expect(slices.map(s => s.part)).toEqual(["topLeft", "topRight", "bottomLeft", "bottomRight"]);
        expect(slices[3].dst).toEqual({ x: 6, y: 5, width: 7, height: 4 });
        expect(MinSliceSize(insets)).toEqual({ width: 13, height: 9 });
    });

    it("rounds a fractional size to whole pixels", () => {
        const slices = SliceRects(frame, insets, { width: 50.6, height: 29.4 });
        expect(slices.every(s => Number.isInteger(s.dst.x + s.dst.y + s.dst.width + s.dst.height))).toBe(true);
        expect(slices[4].dst.width + 13).toBe(51);
    });

    it("leaves out parts for an inset of 0", () => {
        const slices = SliceRects({ width: 10, height: 10 }, { left: 0, top: 4, right: 0, bottom: 4 }, { width: 30, height: 20 });
        expect(slices.map(s => s.part)).toEqual(["top", "centre", "bottom"]);
        expect(slices[1].dst).toEqual({ x: 0, y: 4, width: 30, height: 12 });
    });

    it("refuses insets that leave nothing of the frame", () => {
        expect(() => SliceRects({ width: 12, height: 12 }, { left: 6, top: 2, right: 6, bottom: 2 }, { width: 40, height: 40 })).toThrow(/leave nothing/);
        expect(() => SliceRects({ width: 12, height: 8 }, { left: 2, top: 4, right: 2, bottom: 4 }, { width: 40, height: 40 })).toThrow(/leave nothing/);
    });
});
