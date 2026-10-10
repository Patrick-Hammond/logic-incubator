import { describe, expect, it } from "vitest";
import {
    AMBIENT_LIGHT,
    AMBIENT_TINT,
    BakeLighting,
    CellCornerLight,
    FootLight,
    IsCompleteLightValue,
    LightFalloff,
    LightGrid,
    LightToTint,
    MAX_LIGHT,
    MAX_SPRITE_LIGHT,
    SampleLight
} from "./Lighting";

const TINT = 0xff8100;

describe("IsCompleteLightValue", () => {
    it("accepts a value with all three fields present as numbers", () => {
        expect(IsCompleteLightValue({ brightness: 0.5, tint: TINT, range: 5 })).toBe(true);
    });

    it("rejects a value missing tint - the exact shape of a hand-edited assets-meta.json typo", () => {
        expect(IsCompleteLightValue({ brightness: 10, range: 10 })).toBe(false);
    });

    it("rejects a value with a non-numeric field, NaN, or Infinity", () => {
        expect(IsCompleteLightValue({ brightness: "1", tint: TINT, range: 5 })).toBe(false);
        expect(IsCompleteLightValue({ brightness: NaN, tint: TINT, range: 5 })).toBe(false);
        expect(IsCompleteLightValue({ brightness: 1, tint: TINT, range: Infinity })).toBe(false);
    });

    it("rejects a plain number (the other half of the Brush.data union) and null/undefined", () => {
        expect(IsCompleteLightValue(5)).toBe(false);
        expect(IsCompleteLightValue(null)).toBe(false);
        expect(IsCompleteLightValue(undefined)).toBe(false);
    });
});

const AMBIENT = [
    ((AMBIENT_TINT >> 16) & 0xff) / 255 * AMBIENT_LIGHT,
    ((AMBIENT_TINT >> 8) & 0xff) / 255 * AMBIENT_LIGHT,
    (AMBIENT_TINT & 0xff) / 255 * AMBIENT_LIGHT
];
const WHITE = 0xffffff;

/** Red, green and blue at corner `(x, y)`. */
function Corner(grid: LightGrid, x: number, y: number): number[] {
    const c = (y * (grid.width + 1) + x) * 3;
    return [grid.data[c], grid.data[c + 1], grid.data[c + 2]];
}

describe("LightFalloff", () => {
    it("is full at the light and reaches zero at the range, with no slope left at the edge", () => {
        expect(LightFalloff(0, 5)).toBe(1);
        expect(LightFalloff(5, 5)).toBe(0);
        expect(LightFalloff(7, 5)).toBe(0);
        // Just inside the range the remaining light is tiny - that's what removes the visible rim.
        expect(LightFalloff(4.9, 5)).toBeLessThan(0.002);
        expect(LightFalloff(2.5, 5)).toBeCloseTo(0.5625);
    });

    it("falls steadily with distance", () => {
        let previous = LightFalloff(0, 8);
        for (let d = 0.5; d < 8; d += 0.5) {
            const share = LightFalloff(d, 8);
            expect(share).toBeLessThan(previous);
            previous = share;
        }
    });

    it("treats a zero range as no light", () => {
        expect(LightFalloff(0, 0)).toBe(0);
    });
});

describe("BakeLighting", () => {
    it("fills every corner with the ambient light when there are no lights", () => {
        const grid = BakeLighting([], 4, 3);
        expect(grid.width).toBe(4);
        expect(grid.height).toBe(3);
        expect(grid.data.length).toBe(5 * 4 * 3);
        for (let y = 0; y <= 3; y++) {
            for (let x = 0; x <= 4; x++) {
                Corner(grid, x, y).forEach((v, k) => expect(v).toBeCloseTo(AMBIENT[k]));
            }
        }
    });

    it("adds a light's tint times its brightness on top of the ambient light at its own cell's corners", () => {
        const grid = BakeLighting([{ x: 5, y: 5, value: { brightness: 0.5, tint: WHITE, range: 4 } }], 20, 20);
        // The light sits at the cell's centre, so its four corners are each sqrt(0.5) tiles away.
        const share = LightFalloff(Math.SQRT1_2, 4);
        [[5, 5], [6, 5], [5, 6], [6, 6]].forEach(([x, y]) => {
            Corner(grid, x, y).forEach((v, k) => expect(v).toBeCloseTo(AMBIENT[k] + 0.5 * share));
        });
    });

    it("lights only the channels in its tint", () => {
        const grid = BakeLighting([{ x: 5, y: 5, value: { brightness: 1, tint: 0xff0000, range: 4 } }], 20, 20);
        const [r, g, b] = Corner(grid, 5, 5);
        expect(r).toBeGreaterThan(AMBIENT[0] + 0.5);
        expect(g).toBeCloseTo(AMBIENT[1]);
        expect(b).toBeCloseTo(AMBIENT[2]);
    });

    it("fades to exactly the ambient light at its range and touches nothing beyond", () => {
        const grid = BakeLighting([{ x: 10, y: 10, value: { brightness: 1, tint: WHITE, range: 5 } }], 30, 30);
        // Corner (10, 5) is 5.52 tiles from the light at (10.5, 10.5); corner (10, 7) is 3.54.
        Corner(grid, 10, 5).forEach((v, k) => expect(v).toBeCloseTo(AMBIENT[k]));
        expect(Corner(grid, 10, 7)[0]).toBeGreaterThan(AMBIENT[0]);
        Corner(grid, 25, 25).forEach((v, k) => expect(v).toBeCloseTo(AMBIENT[k]));
    });

    it("adds overlapping lights together instead of keeping the brighter one", () => {
        const one = BakeLighting([{ x: 5, y: 5, value: { brightness: 0.4, tint: WHITE, range: 9 } }], 20, 20);
        const two = BakeLighting([
            { x: 5, y: 5, value: { brightness: 0.4, tint: WHITE, range: 9 } },
            { x: 6, y: 5, value: { brightness: 0.4, tint: WHITE, range: 9 } }
        ], 20, 20);
        // Corner (6, 5) is the same distance from both lights, so the second one doubles what the first adds.
        const added = Corner(one, 6, 5)[0] - AMBIENT[0];
        expect(Corner(two, 6, 5)[0] - AMBIENT[0]).toBeCloseTo(added * 2);
    });

    it("lets light go above 1 to brighten, but caps it at MAX_LIGHT however many lights pile up", () => {
        const pile = [0, 1, 2, 3, 4].map(() => ({ x: 5, y: 5, value: { brightness: 2, tint: WHITE, range: 6 } }));
        const grid = BakeLighting(pile, 20, 20);
        Corner(grid, 5, 5).forEach(v => expect(v).toBeCloseTo(MAX_LIGHT));
        const single = BakeLighting([{ x: 5, y: 5, value: { brightness: 1, tint: WHITE, range: 6 } }], 20, 20);
        expect(Corner(single, 5, 5)[0]).toBeGreaterThan(1);
    });

    it("clamps brightness, so an old 0..10 value from assets-meta.json can't blow a level out", () => {
        const huge = BakeLighting([{ x: 5, y: 5, value: { brightness: 10, tint: 0x400000, range: 6 } }], 20, 20);
        const two = BakeLighting([{ x: 5, y: 5, value: { brightness: 2, tint: 0x400000, range: 6 } }], 20, 20);
        expect(Corner(huge, 5, 5)[0]).toBeCloseTo(Corner(two, 5, 5)[0]);
    });

    it("clips a light whose range extends past the map edge instead of throwing", () => {
        const light = { x: 0, y: 0, value: { brightness: 0.9, tint: WHITE, range: 9 } };
        expect(() => BakeLighting([light], 5, 5)).not.toThrow();
        const grid = BakeLighting([light], 5, 5);
        expect(grid.data.length).toBe(6 * 6 * 3);
        expect(Corner(grid, 0, 0)[0]).toBeGreaterThan(AMBIENT[0] + 0.5);
    });

    it("treats a zero or negative brightness/range as no light, not a crash", () => {
        const dark = (brightness: number, range: number): LightGrid => BakeLighting([{ x: 5, y: 5, value: { brightness, tint: WHITE, range } }], 20, 20);
        Corner(dark(0, 5), 5, 5).forEach((v, k) => expect(v).toBeCloseTo(AMBIENT[k]));
        Corner(dark(0.5, 0), 5, 5).forEach((v, k) => expect(v).toBeCloseTo(AMBIENT[k]));
        expect(() => dark(-0.3, 5)).not.toThrow();
        Corner(dark(-0.3, 5), 5, 5).forEach((v, k) => expect(v).toBeCloseTo(AMBIENT[k]));
    });
});

describe("CellCornerLight", () => {
    const grid: LightGrid = { width: 2, height: 1, data: new Float32Array(3 * 2 * 3) };
    // Corners numbered row by row: (0,0)=0, (1,0)=1, (2,0)=2, (0,1)=3, (1,1)=4, (2,1)=5; each channel holds its number.
    for (let c = 0; c < 6; c++) {
        grid.data.set([c, c + 0.1, c + 0.2], c * 3);
    }

    it("returns top-left, top-right, bottom-right, bottom-left, the order cornerTints takes", () => {
        const out = CellCornerLight(grid, 1, 0, new Array(12));
        expect(Array.from(out).map(v => Math.round(v * 10) / 10)).toEqual([1, 1.1, 1.2, 2, 2.1, 2.2, 5, 5.1, 5.2, 4, 4.1, 4.2]);
    });

    it("takes the nearest cell's corners for a cell off the grid", () => {
        expect(Array.from(CellCornerLight(grid, 7, -3, new Array(12)))).toEqual(Array.from(CellCornerLight(grid, 1, 0, new Array(12))));
    });

    it("gives the ambient light everywhere on an empty grid", () => {
        const out = CellCornerLight({ width: 0, height: 0, data: new Float32Array(3) }, 0, 0, new Array(12));
        out.forEach((v, i) => expect(v).toBeCloseTo(AMBIENT[i % 3]));
    });
});

describe("SampleLight", () => {
    const grid: LightGrid = { width: 1, height: 1, data: new Float32Array([0, 0, 0, 1, 1, 1, 0, 0, 0, 1, 1, 1]) };

    it("matches a corner exactly on it, and blends between corners elsewhere", () => {
        expect(SampleLight(grid, 0, 0, [0, 0, 0])[0]).toBe(0);
        expect(SampleLight(grid, 1, 1, [0, 0, 0])[0]).toBe(1);
        expect(SampleLight(grid, 0.25, 0.5, [0, 0, 0])[0]).toBeCloseTo(0.25);
    });

    it("holds the edge value past the edge of the grid", () => {
        expect(SampleLight(grid, 5, 0.5, [0, 0, 0])[0]).toBe(1);
        expect(SampleLight(grid, -5, 0.5, [0, 0, 0])[0]).toBe(0);
    });
});

describe("FootLight", () => {
    it("shades a sprite left to right by the floor under its feet, the same at its head", () => {
        const grid: LightGrid = { width: 1, height: 1, data: new Float32Array([0, 0, 0, 1, 1, 1, 0, 0, 0, 1, 1, 1]) };
        const out = FootLight(grid, 0.25, 0.75, 1, new Array(12));
        expect(out[0]).toBeCloseTo(0.25); // top-left
        expect(out[3]).toBeCloseTo(0.75); // top-right
        expect(out[6]).toBeCloseTo(0.75); // bottom-right
        expect(out[9]).toBeCloseTo(0.25); // bottom-left
    });

    it("caps a sprite's light lower than the floor's, so a figure by a torch isn't bleached", () => {
        const bright: LightGrid = { width: 1, height: 1, data: new Float32Array(12).fill(MAX_LIGHT) };
        FootLight(bright, 0.2, 0.8, 0.9, new Array(12)).forEach(v => expect(v).toBe(MAX_SPRITE_LIGHT));
    });
});

describe("LightToTint", () => {
    it("packs light into 0xRRGGBB, capping brightening light at 1", () => {
        expect(LightToTint([1, 0.5, 0])).toBe(0xff8000);
        expect(LightToTint([1.6, 2, -1])).toBe(0xffff00);
    });
});
