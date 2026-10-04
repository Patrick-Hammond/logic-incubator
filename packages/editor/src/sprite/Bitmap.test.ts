import { describe, expect, it } from "vitest";
import {
    Bitmap, BrushOffsets, CloneBitmap, CountUsage, CreateBitmap, EllipsePoints, FillRegion, FlipHorizontal, FlipVertical, FloodFill, GetPixel,
    LinePoints, PlotPoints, Point, ReadRegion, RectPoints, ResizeBitmap, RotateClockwise, RotateCounterClockwise, SetPixel, ShiftBitmap, WriteRegion
} from "./Bitmap";

const key = (p: Point) => p.x + "," + p.y;
const keys = (points: Point[]) => points.map(key);
const sorted = (points: Point[]) => keys(points).sort();

/** A bitmap from rows of text: "." is 0, "1".."9" their digit. */
function Picture(rows: string[]): Bitmap {
    const bitmap = CreateBitmap(rows[0].length, rows.length);
    rows.forEach((row, y) => row.split("").forEach((c, x) => (bitmap.data[y * bitmap.width + x] = c === "." ? 0 : parseInt(c, 10))));
    return bitmap;
}

/** The bitmap back as rows of text. */
function Rows(bitmap: Bitmap): string[] {
    const rows: string[] = [];
    for (let y = 0; y < bitmap.height; y++) {
        let row = "";
        for (let x = 0; x < bitmap.width; x++) {
            const v = bitmap.data[y * bitmap.width + x];
            row += v === 0 ? "." : String(v);
        }
        rows.push(row);
    }
    return rows;
}

/** What a set of points looks like on a w x h grid. */
function Draw(points: Point[], w: number, h: number): string[] {
    const b = CreateBitmap(w, h);
    points.forEach(p => SetPixel(b, p.x, p.y, 1));
    return Rows(b);
}

describe("LinePoints", () => {
    it("runs from a to b, both included, in order", () => {
        expect(keys(LinePoints({ x: 0, y: 0 }, { x: 3, y: 0 }))).toEqual(["0,0", "1,0", "2,0", "3,0"]);
        expect(keys(LinePoints({ x: 3, y: 0 }, { x: 0, y: 0 }))).toEqual(["3,0", "2,0", "1,0", "0,0"]);
        expect(keys(LinePoints({ x: 2, y: 2 }, { x: 2, y: 2 }))).toEqual(["2,2"]);
    });

    it("steps diagonally and along shallow lines without gaps", () => {
        expect(keys(LinePoints({ x: 0, y: 0 }, { x: 3, y: 3 }))).toEqual(["0,0", "1,1", "2,2", "3,3"]);
        const shallow = LinePoints({ x: 0, y: 0 }, { x: 7, y: 2 });
        expect(shallow).toHaveLength(8);
        shallow.slice(1).forEach((p, i) => {
            expect(Math.abs(p.x - shallow[i].x)).toBe(1);
            expect(Math.abs(p.y - shallow[i].y)).toBeLessThanOrEqual(1);
        });
    });

    it("draws the same cells whichever end it starts from", () => {
        const forward = sorted(LinePoints({ x: 1, y: 1 }, { x: 9, y: 4 }));
        const back = sorted(LinePoints({ x: 9, y: 4 }, { x: 1, y: 1 }));
        expect(back).toEqual(forward);
    });

    it("draws a line the eye accepts", () => {
        expect(Draw(LinePoints({ x: 0, y: 0 }, { x: 5, y: 2 }), 6, 3)).toEqual(["11....", "..11..", "....11"]);
    });
});

describe("RectPoints", () => {
    it("is its border or all of it, whichever corners come first", () => {
        expect(Draw(RectPoints({ x: 0, y: 0 }, { x: 3, y: 2 }, false), 4, 3)).toEqual(["1111", "1..1", "1111"]);
        expect(Draw(RectPoints({ x: 3, y: 2 }, { x: 0, y: 0 }, true), 4, 3)).toEqual(["1111", "1111", "1111"]);
    });

    it("is one cell for equal corners, and a line for a flat box", () => {
        expect(keys(RectPoints({ x: 4, y: 4 }, { x: 4, y: 4 }, false))).toEqual(["4,4"]);
        expect(RectPoints({ x: 0, y: 0 }, { x: 4, y: 0 }, false)).toHaveLength(5);
    });
});

describe("EllipsePoints", () => {
    it("draws a recognisable circle in a 7x7 box, symmetric on both axes", () => {
        const outline = Draw(EllipsePoints({ x: 0, y: 0 }, { x: 6, y: 6 }, false), 7, 7);
        expect(outline).toEqual([
            "..111..",
            ".1...1.",
            "1.....1",
            "1.....1",
            "1.....1",
            ".1...1.",
            "..111.."
        ]);
    });

    it("fills it", () => {
        expect(Draw(EllipsePoints({ x: 0, y: 0 }, { x: 6, y: 6 }, true), 7, 7)).toEqual([
            "..111..",
            ".11111.",
            "1111111",
            "1111111",
            "1111111",
            ".11111.",
            "..111.."
        ]);
    });

    it("touches all four sides of its box, for round and for lopsided boxes, even or odd", () => {
        for (const [w, h] of [[8, 8], [9, 5], [4, 10], [3, 3], [2, 2], [6, 1], [1, 6]]) {
            const points = EllipsePoints({ x: 2, y: 3 }, { x: 2 + w - 1, y: 3 + h - 1 }, false);
            const xs = points.map(p => p.x), ys = points.map(p => p.y);
            expect(Math.min(...xs), `${w}x${h} left`).toBe(2);
            expect(Math.max(...xs), `${w}x${h} right`).toBe(2 + w - 1);
            expect(Math.min(...ys), `${w}x${h} top`).toBe(3);
            expect(Math.max(...ys), `${w}x${h} bottom`).toBe(3 + h - 1);
        }
    });

    it("is mirror-symmetric about its centre", () => {
        for (const [w, h] of [[8, 8], [9, 5], [7, 12]]) {
            const set = new Set(keys(EllipsePoints({ x: 0, y: 0 }, { x: w - 1, y: h - 1 }, false)));
            set.forEach(k => {
                const [x, y] = k.split(",").map(Number);
                expect(set.has(`${w - 1 - x},${y}`), `${w}x${h} x-mirror of ${k}`).toBe(true);
                expect(set.has(`${x},${h - 1 - y}`), `${w}x${h} y-mirror of ${k}`).toBe(true);
            });
        }
    });

    it("never lists a cell twice", () => {
        const points = EllipsePoints({ x: 0, y: 0 }, { x: 10, y: 6 }, false);
        expect(new Set(keys(points)).size).toBe(points.length);
        const filled = EllipsePoints({ x: 0, y: 0 }, { x: 10, y: 6 }, true);
        expect(new Set(keys(filled)).size).toBe(filled.length);
    });

    it("is one unbroken outline for every box up to 24x24: all four sides touched, no gaps, no strays", () => {
        for (let w = 1; w <= 24; w++) {
            for (let h = 1; h <= 24; h++) {
                const points = EllipsePoints({ x: 0, y: 0 }, { x: w - 1, y: h - 1 }, false);
                const label = w + "x" + h;
                const set = new Set(keys(points));
                expect(set.size, label + " duplicates").toBe(points.length);
                expect(Math.min(...points.map(p => p.x)), label + " left").toBe(0);
                expect(Math.max(...points.map(p => p.x)), label + " right").toBe(w - 1);
                expect(Math.min(...points.map(p => p.y)), label + " top").toBe(0);
                expect(Math.max(...points.map(p => p.y)), label + " bottom").toBe(h - 1);
                points.forEach(p => {
                    expect(set.has((w - 1 - p.x) + "," + p.y), label + " x-mirror of " + key(p)).toBe(true);
                    expect(set.has(p.x + "," + (h - 1 - p.y)), label + " y-mirror of " + key(p)).toBe(true);
                    // 8-connected: every cell has a neighbour on the outline unless it's the lone cell.
                    if (points.length > 1) {
                        let neighbours = 0;
                        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && set.has((p.x + dx) + "," + (p.y + dy))) neighbours++;
                        expect(neighbours, label + " " + key(p) + " is stranded").toBeGreaterThan(0);
                    }
                });
            }
        }
    });

    it("fills every cell inside the outline, nothing outside the box", () => {
        for (const [w, h] of [[5, 5], [12, 7], [3, 15], [1, 4]]) {
            const filled = EllipsePoints({ x: 0, y: 0 }, { x: w - 1, y: h - 1 }, true);
            const outline = EllipsePoints({ x: 0, y: 0 }, { x: w - 1, y: h - 1 }, false);
            const set = new Set(keys(filled));
            outline.forEach(p => expect(set.has(key(p))).toBe(true));
            filled.forEach(p => {
                expect(p.x >= 0 && p.x < w && p.y >= 0 && p.y < h).toBe(true);
            });
            // Every row of the box has one unbroken run.
            for (let y = 0; y < h; y++) {
                const xs = filled.filter(p => p.y === y).map(p => p.x).sort((p, q) => p - q);
                expect(xs.length).toBeGreaterThan(0);
                expect(xs[xs.length - 1] - xs[0] + 1).toBe(xs.length);
            }
        }
    });

    it("is a single cell for a single-cell box and the same whichever corners come first", () => {
        expect(keys(EllipsePoints({ x: 5, y: 5 }, { x: 5, y: 5 }, false))).toEqual(["5,5"]);
        expect(sorted(EllipsePoints({ x: 6, y: 6 }, { x: 0, y: 0 }, false))).toEqual(sorted(EllipsePoints({ x: 0, y: 0 }, { x: 6, y: 6 }, false)));
    });
});

describe("BrushOffsets", () => {
    it("is one cell for size 1, whatever the shape", () => {
        expect(BrushOffsets(1, "square")).toEqual([{ x: 0, y: 0 }]);
        expect(BrushOffsets(1, "round")).toEqual([{ x: 0, y: 0 }]);
    });

    it("is a filled square for 'square', centred as far as it can be", () => {
        const three = BrushOffsets(3, "square");
        expect(three).toHaveLength(9);
        expect(Math.min(...three.map(o => o.x))).toBe(-1);
        expect(Math.max(...three.map(o => o.x))).toBe(1);
        expect(BrushOffsets(4, "square")).toHaveLength(16);
    });

    it("rounds the corners off bigger brushes", () => {
        expect(BrushOffsets(4, "round")).toHaveLength(12);
        expect(BrushOffsets(5, "round")).toHaveLength(21);
        expect(sorted(BrushOffsets(5, "round")).includes("2,2")).toBe(false);
    });

    it("clamps silly sizes", () => {
        expect(BrushOffsets(0, "square")).toHaveLength(1);
        expect(BrushOffsets(1000, "square")).toHaveLength(32 * 32);
    });
});

describe("PlotPoints", () => {
    it("paints with the brush at each point, clipped to the bitmap, and says if anything changed", () => {
        const b = CreateBitmap(4, 4);
        expect(PlotPoints(b, [{ x: 0, y: 0 }], BrushOffsets(3, "square"), 5)).toBe(true);
        expect(Rows(b)).toEqual(["55..", "55..", "....", "...."]);
        expect(PlotPoints(b, [{ x: 0, y: 0 }], BrushOffsets(1, "square"), 5)).toBe(false);
        expect(PlotPoints(b, [{ x: -9, y: -9 }], BrushOffsets(1, "square"), 5)).toBe(false);
    });

    it("mirrors across the centre lines", () => {
        const b = CreateBitmap(5, 5);
        PlotPoints(b, [{ x: 0, y: 1 }], [{ x: 0, y: 0 }], 1, { x: true, y: false });
        expect(Rows(b)[1]).toBe("1...1");
        const c = CreateBitmap(5, 5);
        PlotPoints(c, [{ x: 1, y: 0 }], [{ x: 0, y: 0 }], 2, { x: false, y: true });
        expect(Rows(c)[0]).toBe(".2...");
        expect(Rows(c)[4]).toBe(".2...");
        const d = CreateBitmap(5, 5);
        PlotPoints(d, [{ x: 0, y: 0 }], [{ x: 0, y: 0 }], 3, { x: true, y: true });
        expect([GetPixel(d, 0, 0), GetPixel(d, 4, 0), GetPixel(d, 0, 4), GetPixel(d, 4, 4)]).toEqual([3, 3, 3, 3]);
    });

    it("mirrors a pixel on the centre line onto itself", () => {
        const b = CreateBitmap(5, 5);
        PlotPoints(b, [{ x: 2, y: 2 }], [{ x: 0, y: 0 }], 1, { x: true, y: true });
        expect(b.data.reduce((n, v) => n + v, 0)).toBe(1);
    });
});

describe("FloodFill", () => {
    it("fills the connected run, not diagonals", () => {
        const b = Picture(["..1..", "..1..", "11.11", "..1..", "..1.."]);
        expect(FloodFill(b, 0, 0, 7)).toBe(4);
        // The top-right corner is cut off by the vertical wall, so only the top-left corner changes.
        expect(Rows(b)).toEqual(["771..", "771..", "11.11", "..1..", "..1.."]);
    });

    it("fills a region walled in by another colour and leaves the outside", () => {
        const b = Picture(["11111", "1...1", "1...1", "11111", "....."]);
        expect(FloodFill(b, 2, 1, 4)).toBe(6);
        expect(Rows(b)).toEqual(["11111", "14441", "14441", "11111", "....."]);
        expect(GetPixel(b, 0, 4)).toBe(0);
    });

    it("fills every pixel of that index when asked to replace it everywhere", () => {
        const b = Picture(["1.1", ".1.", "1.1"]);
        expect(FloodFill(b, 0, 0, 5, true)).toBe(5);
        expect(Rows(b)).toEqual(["5.5", ".5.", "5.5"]);
    });

    it("does nothing off the bitmap or onto the same index", () => {
        const b = Picture(["11", "11"]);
        expect(FloodFill(b, 9, 9, 3)).toBe(0);
        expect(FloodFill(b, 0, 0, 1)).toBe(0);
    });

    it("handles a spiral and a big bitmap without trouble", () => {
        const big = CreateBitmap(200, 200);
        expect(FloodFill(big, 100, 100, 9)).toBe(40000);
        const spiral = Picture([
            "1111111",
            "1.....1",
            "1.111.1",
            "1.1.1.1",
            "1.1...1",
            "1.11111",
            "1......"
        ]);
        // One connected corridor winds all the way in, so a single fill reaches every empty cell.
        const open = spiral.data.filter(v => v === 0).length;
        expect(FloodFill(spiral, 1, 1, 2)).toBe(open);
        expect(spiral.data.filter(v => v === 0)).toHaveLength(0);
    });
});

describe("regions", () => {
    const picture = Picture(["12345", "6789.", "11111"]);

    it("reads, clipped to the bitmap", () => {
        expect(Rows(ReadRegion(picture, { x: 1, y: 0, width: 3, height: 2 }))).toEqual(["234", "789"]);
        expect(Rows(ReadRegion(picture, { x: 3, y: 1, width: 10, height: 10 }))).toEqual(["9.", "11"]);
        expect(ReadRegion(picture, { x: 9, y: 9, width: 2, height: 2 }).data).toHaveLength(0);
    });

    it("fills a rectangle", () => {
        const b = CloneBitmap(picture);
        FillRegion(b, { x: 1, y: 1, width: 2, height: 2 }, 0);
        expect(Rows(b)).toEqual(["12345", "6..9.", "1..11"]);
    });

    it("writes a region, clipped, skipping an index", () => {
        const b = CreateBitmap(4, 3);
        WriteRegion(b, Picture(["12", "3."]), 2, 2);
        expect(Rows(b)).toEqual(["....", "....", "..12"]);
        const c = Picture(["9999", "9999"]);
        WriteRegion(c, Picture(["1.", ".2"]), 0, 0, 0);
        expect(Rows(c)).toEqual(["1999", "9299"]);
    });

    it("flips both ways", () => {
        const p = Picture(["123", "456"]);
        expect(Rows(FlipHorizontal(p))).toEqual(["321", "654"]);
        expect(Rows(FlipVertical(p))).toEqual(["456", "123"]);
    });

    it("rotates a quarter, swapping its size, and the two ways undo each other", () => {
        const p = Picture(["123", "456"]);
        expect(Rows(RotateClockwise(p))).toEqual(["41", "52", "63"]);
        expect(Rows(RotateCounterClockwise(p))).toEqual(["36", "25", "14"]);
        expect(Rows(RotateCounterClockwise(RotateClockwise(p)))).toEqual(Rows(p));
        let four = p;
        for (let i = 0; i < 4; i++) four = RotateClockwise(four);
        expect(Rows(four)).toEqual(Rows(p));
    });
});

describe("ResizeBitmap and ShiftBitmap", () => {
    const p = Picture(["12", "34"]);

    it("grows the canvas with the picture at the anchor, new space filled", () => {
        expect(Rows(ResizeBitmap(p, 4, 4, 0, 0, 0))).toEqual(["12..", "34..", "....", "...."]);
        expect(Rows(ResizeBitmap(p, 4, 4, 1, 1, 0))).toEqual(["....", "....", "..12", "..34"]);
        expect(Rows(ResizeBitmap(p, 4, 4, 0.5, 0.5, 9))).toEqual(["9999", "9129", "9349", "9999"]);
    });

    it("crops from the other side when it shrinks", () => {
        const big = Picture(["1234", "5678", "9999"]);
        expect(Rows(ResizeBitmap(big, 2, 2, 0, 0, 0))).toEqual(["12", "56"]);
        expect(Rows(ResizeBitmap(big, 2, 2, 1, 1, 0))).toEqual(["78", "99"]);
    });

    it("shifts, with the gap filled or wrapped round", () => {
        const q = Picture(["123", "456"]);
        expect(Rows(ShiftBitmap(q, 1, 0, false, 0))).toEqual([".12", ".45"]);
        expect(Rows(ShiftBitmap(q, 1, 0, true, 0))).toEqual(["312", "645"]);
        expect(Rows(ShiftBitmap(q, 0, -1, true, 0))).toEqual(["456", "123"]);
        expect(Rows(ShiftBitmap(q, -4, 0, true, 0))).toEqual(["231", "564"]);
    });
});

describe("CountUsage", () => {
    it("counts how often each index appears across bitmaps", () => {
        const counts = CountUsage([Picture(["112"]), Picture(["2.."])], 4);
        expect(counts).toEqual([2, 2, 2, 0]);
    });
});

describe("helpers", () => {
    it("gets and sets pixels within bounds only", () => {
        const b = CreateBitmap(2, 2);
        expect(SetPixel(b, 1, 1, 3)).toBe(true);
        expect(SetPixel(b, 1, 1, 3)).toBe(false);
        expect(SetPixel(b, 2, 0, 3)).toBe(false);
        expect(GetPixel(b, 1, 1)).toBe(3);
        expect(GetPixel(b, -1, 0)).toBe(-1);
        expect(CreateBitmap(2, 2, 7).data).toEqual(Uint8Array.from([7, 7, 7, 7]));
    });

    it("clones without sharing pixels", () => {
        const a = Picture(["12"]);
        const b = CloneBitmap(a);
        b.data[0] = 9;
        expect(a.data[0]).toBe(1);
    });
});
