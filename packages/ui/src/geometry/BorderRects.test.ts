import { describe, expect, it } from "vitest";
import { BorderRects } from "./BorderRects";

const sizes = { capLeft: 6, capRight: 6, centre: 9, mid: 8 };

describe("BorderRects", () => {
    it("puts a cap at each end, the ornament in the middle, and the repeating piece in the gaps either side", () => {
        expect(BorderRects(100, sizes)).toEqual([
            { part: "capLeft", x: 0, width: 6 },
            { part: "mid", x: 6, width: 39 },
            { part: "centre", x: 45, width: 9 },
            { part: "mid", x: 54, width: 40 },
            { part: "capRight", x: 94, width: 6 }
        ]);
    });

    it("tiles the line exactly: no gap and no overlap", () => {
        [30, 31, 77, 100, 151].forEach(width => {
            const pieces = BorderRects(width, sizes);
            let at = 0;
            pieces.forEach(p => {
                expect(p.x, `x at ${width}`).toBe(at);
                at += p.width;
            });
            expect(at).toBe(width);
        });
    });

    it("keeps the ornament on a whole pixel, the extra pixel of an odd gap going to the right", () => {
        // 88 pixels between the caps, 9 for the ornament: 79 left over, 39 to the left of it and 40 to the right.
        const [, left, centre, right] = BorderRects(100, sizes);
        expect(centre.x).toBe(6 + Math.floor((88 - 9) / 2));
        expect(left.width + 1).toBe(right.width);
    });

    it("drops the ornament when there isn't room for it, and fills the gap with the repeating piece", () => {
        expect(BorderRects(20, sizes)).toEqual([
            { part: "capLeft", x: 0, width: 6 },
            { part: "mid", x: 6, width: 8 },
            { part: "capRight", x: 14, width: 6 }
        ]);
    });

    it("is raised to the caps' width when narrower, leaving no middle", () => {
        expect(BorderRects(4, sizes)).toEqual([
            { part: "capLeft", x: 0, width: 6 },
            { part: "capRight", x: 6, width: 6 }
        ]);
    });

    it("copes with a style that has no ornament or no repeating piece", () => {
        expect(BorderRects(50, { ...sizes, centre: 0 }).map(p => p.part)).toEqual(["capLeft", "mid", "capRight"]);
        expect(BorderRects(50, { ...sizes, mid: 0 }).map(p => p.part)).toEqual(["capLeft", "centre", "capRight"]);
    });
});
