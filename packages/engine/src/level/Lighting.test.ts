import { describe, expect, it } from "vitest";
import {
    AMBIENT_LIGHT,
    AMBIENT_TINT,
    BakeLighting,
    BakeLights,
    BakeLightShape,
    CastMovingLight,
    CellCornerLight,
    ComposeLighting,
    CORNER_OCCLUSION,
    CornerOcclusion,
    Flicker,
    FlickerScale,
    FootLight,
    IsCompleteLightValue,
    LightBlockers,
    LightBlockersFor,
    LightFalloff,
    LightGrid,
    LightOrigin,
    LightShape,
    LightToTint,
    MAX_LIGHT,
    MAX_SPRITE_LIGHT,
    OpenLightBlockers,
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

    it("accepts a numeric flicker, and rejects one that isn't a finite number", () => {
        expect(IsCompleteLightValue({ brightness: 1, tint: TINT, range: 5, flicker: 0.15 })).toBe(true);
        expect(IsCompleteLightValue({ brightness: 1, tint: TINT, range: 5, flicker: "0.15" })).toBe(false);
        expect(IsCompleteLightValue({ brightness: 1, tint: TINT, range: 5, flicker: NaN })).toBe(false);
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

describe("Flicker", () => {
    it("wavers between -1 and 1, and isn't the same for every seed", () => {
        let lowest = 1;
        let highest = -1;
        let sameAsNextSeed = 0;
        for (let t = 0; t < 20; t += 0.01) {
            const value = Flicker(t, 3);
            lowest = Math.min(lowest, value);
            highest = Math.max(highest, value);
            if (Math.abs(value - Flicker(t, 4)) < 1e-6) {
                sameAsNextSeed++;
            }
        }
        expect(lowest).toBeGreaterThanOrEqual(-1);
        expect(highest).toBeLessThanOrEqual(1);
        expect(highest - lowest).toBeGreaterThan(1);
        expect(sameAsNextSeed).toBeLessThan(10);
    });

    it("moves smoothly - no jump from one frame to the next", () => {
        for (let t = 0; t < 10; t += 1 / 60) {
            expect(Math.abs(Flicker(t + 1 / 60, 1) - Flicker(t, 1))).toBeLessThan(0.4);
        }
    });
});

describe("FlickerScale", () => {
    it("is exactly 1 for a steady light", () => {
        expect(FlickerScale(0, 1.234, 5)).toBe(1);
    });

    it("stays within flicker either side of 1", () => {
        for (let t = 0; t < 5; t += 0.05) {
            const scale = FlickerScale(0.15, t, 2);
            expect(scale).toBeGreaterThanOrEqual(0.85 - 1e-9);
            expect(scale).toBeLessThanOrEqual(1.15 + 1e-9);
        }
    });

    it("never goes below 0, however wild the flicker", () => {
        for (let t = 0; t < 5; t += 0.05) {
            expect(FlickerScale(3, t, 2)).toBeGreaterThanOrEqual(0);
        }
    });
});

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

/**
 * Blockers drawn as text, one string per row: `#` is a cell light can't pass, a digit an open cell at that
 * height, anything else an open cell at height 0.
 */
function Blockers(rows: string[]): LightBlockers {
    return LightBlockersFor(
        rows[0].length,
        rows.length,
        (x, y) => rows[y][x] === "#",
        (x, y) => /[0-9]/.test(rows[y][x]) ? Number(rows[y][x]) : 0,
        []
    );
}

/** `width` x `height` open cells with the given cells walled. */
function Walled(width: number, height: number, walls: number[][]): LightBlockers {
    const rows: string[] = [];
    for (let y = 0; y < height; y++) {
        let row = "";
        for (let x = 0; x < width; x++) {
            row += walls.some(([wx, wy]) => wx === x && wy === y) ? "#" : ".";
        }
        rows.push(row);
    }
    return Blockers(rows);
}

/** How much of a light's flame corner `(x, y)` can see, 0 to 1: its baked share over what falloff alone would give. */
function Visibility(shape: LightShape, range: number, columns: number, x: number, y: number): number {
    const k = Array.from(shape.corners).indexOf(y * columns + x);
    const falloff = LightFalloff(Math.hypot(x - shape.origin.x, y - shape.origin.y), range);
    return k < 0 ? 0 : shape.shares[k] / falloff;
}

const LAMP = { brightness: 1, tint: WHITE, range: 12 };

describe("LightBlockersFor", () => {
    const solid = (x: number, y: number): boolean => x === 1 && y === 0;

    it("blocks light where the map is solid and records each cell's floor height", () => {
        const blockers = LightBlockersFor(3, 2, solid, (x, y) => x + y, []);
        expect(Array.from(blockers.opaque)).toEqual([0, 1, 0, 0, 0, 0]);
        expect(Array.from(blockers.floor)).toEqual([0, 1, 2, 1, 2, 3]);
    });

    it("lets a tile's blocksLight override the collision either way, with true winning a tie", () => {
        const blockers = LightBlockersFor(3, 2, solid, () => 0, [
            { x: 1, y: 0, blocks: false },
            { x: 2, y: 1, blocks: true },
            { x: 0, y: 1, blocks: false },
            { x: 0, y: 1, blocks: true },
            { x: 9, y: 9, blocks: true }
        ]);
        expect(Array.from(blockers.opaque)).toEqual([0, 0, 0, 1, 0, 1]);
    });

    it("blocks nothing on an open grid", () => {
        expect(Array.from(OpenLightBlockers(2, 2).opaque)).toEqual([0, 0, 0, 0]);
    });
});

describe("LightOrigin", () => {
    it("is the centre of an open cell", () => {
        expect(LightOrigin(Walled(5, 5, []), 2, 3)).toEqual({ x: 2.5, y: 3.5 });
    });

    it("moves a light on a wall just past the wall's open side, trying south first", () => {
        const wall = Blockers(["#####", "#####", "....."]);
        const origin = LightOrigin(wall, 2, 1);
        expect(origin.x).toBeCloseTo(2.5);
        expect(origin.y).toBeGreaterThan(2);
        expect(origin.y).toBeLessThan(2.5);

        const eastOpen = Blockers(["##.", "##.", "##."]);
        const east = LightOrigin(eastOpen, 1, 1);
        expect(east.x).toBeGreaterThan(2);
        expect(east.y).toBeCloseTo(1.5);
    });

    it("stays at the centre of a wall with no open side", () => {
        expect(LightOrigin(Blockers(["###", "###", "###"]), 1, 1)).toEqual({ x: 1.5, y: 1.5 });
    });
});

describe("Shadows", () => {
    it("leaves a corner behind a wall with only the ambient light", () => {
        const light = { x: 2, y: 7, value: LAMP };
        const wall = Walled(20, 15, [[5, 4], [5, 5], [5, 6], [5, 7], [5, 8], [5, 9], [5, 10]]);
        Corner(BakeLighting([light], 20, 15, wall), 9, 7).forEach((v, k) => expect(v).toBeCloseTo(AMBIENT[k]));
        expect(Corner(BakeLighting([light], 20, 15), 9, 7)[0]).toBeGreaterThan(AMBIENT[0] + 0.1);
    });

    it("softens a shadow's edge: some corners see part of the flame", () => {
        const wide = { brightness: 1, tint: WHITE, range: 20 };
        const wall = Walled(30, 15, [[6, 6], [6, 7], [6, 8]]);
        const shape = BakeLightShape({ x: 2, y: 7, value: wide }, wall);
        const column = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map(y => Visibility(shape, wide.range, 31, 12, y));
        expect(column.some(v => v > 0.05 && v < 0.95)).toBe(true);
        expect(Math.min(...column)).toBe(0);
        expect(Math.max(...column)).toBeCloseTo(1);
    });

    it("lights a wall's corners facing the light, not the ones behind it, and leaks nothing past it", () => {
        const wall = Walled(12, 11, [[5, 2], [5, 3], [5, 4], [5, 5], [5, 6], [5, 7], [5, 8]]);
        const grid = BakeLighting([{ x: 2, y: 5, value: LAMP }], 12, 11, wall);
        expect(Corner(grid, 5, 5)[0]).toBeGreaterThan(AMBIENT[0] + 0.2);
        Corner(grid, 6, 5).forEach((v, k) => expect(v).toBeCloseTo(AMBIENT[k] * CORNER_OCCLUSION[2]));
        Corner(grid, 7, 5).forEach((v, k) => expect(v).toBeCloseTo(AMBIENT[k]));
    });

    it("stops light at a diagonal wall, even where its cells only touch at the corners", () => {
        const diagonal = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => [k, k]);
        const wall = Walled(10, 10, diagonal);
        // The light is below the diagonal; every corner strictly above it is in shadow.
        const shape = BakeLightShape({ x: 2, y: 6, value: LAMP }, wall);
        for (let y = 0; y <= 10; y++) {
            for (let x = y + 2; x <= 10; x++) {
                expect(Visibility(shape, LAMP.range, 11, x, y)).toBe(0);
            }
        }
    });

    it("shines a light on a wall into the room it faces, not the one behind", () => {
        const rows = ["..........", "..........", "..........", "##########", "..........", "..........", ".........."];
        const grid = BakeLighting([{ x: 5, y: 3, value: LAMP }], 10, 7, Blockers(rows));
        expect(Corner(grid, 5, 6)[0]).toBeGreaterThan(AMBIENT[0] + 0.2);
        Corner(grid, 5, 1).forEach((v, k) => expect(v).toBeCloseTo(AMBIENT[k]));
    });

    it("lights the edge of a ledge two steps up but not the top beyond it", () => {
        const ledge = Blockers(["..............", "..............", "....3333333333", "....3333333333", "....3333333333", "....3333333333", "....3333333333"]);
        const shape = BakeLightShape({ x: 1, y: 4, value: LAMP }, ledge);
        expect(Visibility(shape, LAMP.range, 15, 4, 4)).toBeCloseTo(1);
        expect(Visibility(shape, LAMP.range, 15, 12, 4)).toBe(0);
    });

    it("lets light climb a stair that rises one step a tile", () => {
        const stair = Blockers(["0123456789", "0123456789", "0123456789"]);
        const shape = BakeLightShape({ x: 0, y: 1, value: LAMP }, stair);
        [3, 6, 9].forEach(x => expect(Visibility(shape, LAMP.range, 11, x, 1)).toBeCloseTo(1));
    });
});

describe("CastMovingLight", () => {
    const TORCH = { brightness: 1, tint: WHITE, range: 6 };
    const Lit = (shape: LightShape, blockers: LightBlockers, columns: number, rows: number): LightGrid =>
        ComposeLighting({ width: columns, height: rows, occlusion: BakeLights([], blockers).occlusion, shapes: [shape] });

    it("shines from the very point it's given, not the centre of its cell", () => {
        const open = OpenLightBlockers(12, 12);
        const shape = CastMovingLight({ x: 4.25, y: 6 }, TORCH, open);
        expect(shape.origin).toEqual({ x: 4.25, y: 6 });
        const grid = Lit(shape, open, 12, 12);
        expect(Corner(grid, 4, 6)[0]).toBeGreaterThan(Corner(grid, 5, 6)[0]);
    });

    it("casts shadows like a baked light", () => {
        const wall = Walled(14, 10, [[6, 2], [6, 3], [6, 4], [6, 5], [6, 6], [6, 7]]);
        const grid = Lit(CastMovingLight({ x: 3.5, y: 5 }, TORCH, wall), wall, 14, 10);
        Corner(grid, 8, 5).forEach((v, k) => expect(v).toBeCloseTo(AMBIENT[k]));
        expect(Corner(grid, 5, 5)[0]).toBeGreaterThan(AMBIENT[0] + 0.1);
    });

    it("keeps the light's flicker for whoever draws it to scale by", () => {
        expect(CastMovingLight({ x: 1, y: 1 }, { ...TORCH, flicker: 0.2 }, OpenLightBlockers(4, 4)).flicker).toBe(0.2);
        expect(CastMovingLight({ x: 1, y: 1 }, TORCH, OpenLightBlockers(4, 4)).flicker).toBe(0);
    });
});

describe("CornerOcclusion", () => {
    it("darkens corners by how many of the cells around them are walls", () => {
        const room = Blockers(["#####", "#...#", "#...#", "#####"]);
        const occlusion = CornerOcclusion(room);
        const at = (x: number, y: number): number => occlusion[y * 6 + x];
        expect(at(2, 2)).toBeCloseTo(CORNER_OCCLUSION[0]);
        expect(at(2, 1)).toBeCloseTo(CORNER_OCCLUSION[2]);
        expect(at(1, 1)).toBeCloseTo(CORNER_OCCLUSION[3]);
        expect(at(0, 0)).toBeCloseTo(CORNER_OCCLUSION[1]);
    });

    it("shades the foot of a ledge like a wall, but not a single stair step", () => {
        const at = (rows: string[], x: number, y: number): number => CornerOcclusion(Blockers(rows))[y * (rows[0].length + 1) + x];
        expect(at(["0022", "0022"], 2, 1)).toBeCloseTo(CORNER_OCCLUSION[2]);
        expect(at(["0011", "0011"], 2, 1)).toBeCloseTo(CORNER_OCCLUSION[0]);
    });

    it("darkens the ambient light at the foot of a wall", () => {
        const grid = BakeLighting([], 5, 4, Blockers(["#####", "#...#", "#...#", "#####"]));
        Corner(grid, 2, 1).forEach((v, k) => expect(v).toBeCloseTo(AMBIENT[k] * CORNER_OCCLUSION[2]));
        Corner(grid, 2, 2).forEach((v, k) => expect(v).toBeCloseTo(AMBIENT[k]));
    });
});

describe("ComposeLighting", () => {
    const lights = [
        { x: 3, y: 3, value: { brightness: 0.4, tint: WHITE, range: 6 } },
        { x: 8, y: 3, value: { brightness: 0.3, tint: 0xff0000, range: 6 } }
    ];
    const bake = BakeLights(lights, Walled(12, 8, [[5, 2], [5, 3], [5, 4]]));

    it("matches BakeLighting with every light at its own strength", () => {
        const grid = ComposeLighting(bake);
        expect(Array.from(grid.data)).toEqual(Array.from(BakeLighting(lights, 12, 8, Walled(12, 8, [[5, 2], [5, 3], [5, 4]])).data));
    });

    it("scales each light by its entry in scales, so a torch can flicker without new rays", () => {
        const off = ComposeLighting(bake, [0, 1]);
        Corner(off, 3, 3).forEach((v, k) => expect(v).toBeCloseTo(AMBIENT[k]));
        const doubled = ComposeLighting(bake, [2, 1]);
        const base = ComposeLighting(bake);
        expect(Corner(doubled, 3, 3)[1] - AMBIENT[1]).toBeCloseTo((Corner(base, 3, 3)[1] - AMBIENT[1]) * 2);
    });

    it("fills the grid it is given instead of making a new one", () => {
        const grid = ComposeLighting(bake);
        expect(ComposeLighting(bake, [0, 0], grid)).toBe(grid);
        Corner(grid, 3, 3).forEach((v, k) => expect(v).toBeCloseTo(AMBIENT[k]));
    });

    it("keeps one shape per light, in order, and an empty one for a light with no brightness", () => {
        const dark = BakeLights([{ x: 1, y: 1, value: { brightness: 0, tint: WHITE, range: 5 } }, lights[0]], OpenLightBlockers(10, 10));
        expect(dark.shapes.length).toBe(2);
        expect(dark.shapes[0].corners.length).toBe(0);
        expect(dark.shapes[1].corners.length).toBeGreaterThan(0);
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
