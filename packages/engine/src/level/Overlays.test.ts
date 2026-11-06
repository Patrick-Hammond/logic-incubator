import { describe, expect, it } from "vitest";
import { DataBrushName } from "./LevelFormat";
import Overlays, {
    DefaultOverlayValue,
    FindOverlays,
    IsOverlayValue,
    MaxOverlaySeed,
    OverlayJoin,
    OverlayKinds,
    OverlayLayerIndex,
    OverlayLooks,
    OverlayAlpha,
    OverlayPlacement,
    OverlayReflectivity,
    OverlayTint,
    OverlayValue,
    SanitiseOverlayValue
} from "./Overlays";

const DATA = -1;
const TILES = 0;

function brush(name: string, x: number, y: number, data: unknown, layerId = DATA) {
    return { name, position: { x, y }, layerId, data };
}

function water(x: number, y: number, seed = 1, extra: Partial<OverlayValue> = {}): OverlayPlacement {
    return { x, y, value: { overlay: "water", seed, ...extra } };
}

describe("OverlayValue", () => {
    it("is told apart by its kind", () => {
        expect(IsOverlayValue({ overlay: "water", seed: 1 })).toBe(true);
        expect(IsOverlayValue({ portal: 1 })).toBe(false);
        expect(IsOverlayValue(3)).toBe(false);
        expect(IsOverlayValue(null)).toBe(false);
    });

    it("starts as water", () => {
        expect(DefaultOverlayValue()).toEqual({ overlay: "water", seed: 1 });
    });

    it("has a look for every kind", () => {
        OverlayKinds.forEach(kind => {
            expect(OverlayLooks[kind].reflectivity).toBeGreaterThanOrEqual(0);
            expect(OverlayLooks[kind].reflectivity).toBeLessThanOrEqual(1);
        });
        expect(OverlayLooks.dirt.reflectivity).toBe(0);
        expect(OverlayLooks.shiny.reflectivity).toBeGreaterThan(0);
        expect(OverlayLooks.water.reflectivity).toBeGreaterThan(0);
    });

    it("is sanitised: a whole seed in range, tint and reflectivity only where they differ from the kind's", () => {
        expect(SanitiseOverlayValue({ overlay: "dirt", seed: 3.6 })).toEqual({ overlay: "dirt", seed: 4 });
        expect(SanitiseOverlayValue({ overlay: "dirt", seed: -5 })).toEqual({ overlay: "dirt", seed: 0 });
        expect(SanitiseOverlayValue({ overlay: "dirt", seed: 1e9 })).toEqual({ overlay: "dirt", seed: MaxOverlaySeed });
        expect(SanitiseOverlayValue({ overlay: "dirt", seed: NaN })).toEqual({ overlay: "dirt", seed: 0 });
        expect(SanitiseOverlayValue({ overlay: "shiny", seed: 1, reflectivity: 2 })).toEqual({ overlay: "shiny", seed: 1, reflectivity: 1 });
        expect(SanitiseOverlayValue({ overlay: "shiny", seed: 1, reflectivity: OverlayLooks.shiny.reflectivity })).toEqual({ overlay: "shiny", seed: 1 });
        expect(SanitiseOverlayValue({ overlay: "slime", seed: 1, tint: 0x9b30ff })).toEqual({ overlay: "slime", seed: 1, tint: 0x9b30ff });
        expect(SanitiseOverlayValue({ overlay: "slime", seed: 1, tint: OverlayLooks.slime.tint })).toEqual({ overlay: "slime", seed: 1 });
        expect(SanitiseOverlayValue({ overlay: "slime", seed: 1, tint: 0x1ffffff })).toEqual({ overlay: "slime", seed: 1, tint: 0xffffff });
    });

    it("keeps an alpha only where it fades the overlay, from 0 up to 1", () => {
        expect(SanitiseOverlayValue({ overlay: "water", seed: 1, alpha: 0.4 })).toEqual({ overlay: "water", seed: 1, alpha: 0.4 });
        expect(SanitiseOverlayValue({ overlay: "water", seed: 1, alpha: 1 })).toEqual({ overlay: "water", seed: 1 });
        expect(SanitiseOverlayValue({ overlay: "water", seed: 1, alpha: 3 })).toEqual({ overlay: "water", seed: 1 });
        expect(SanitiseOverlayValue({ overlay: "water", seed: 1, alpha: -2 })).toEqual({ overlay: "water", seed: 1, alpha: 0 });
        expect(SanitiseOverlayValue({ overlay: "water", seed: 1, alpha: NaN })).toEqual({ overlay: "water", seed: 1 });
        expect(OverlayAlpha({ overlay: "water", seed: 1 })).toBe(1);
        expect(OverlayAlpha({ overlay: "water", seed: 1, alpha: 0.25 })).toBe(0.25);
    });

    it("drops a kind the game doesn't know", () => {
        expect(SanitiseOverlayValue({ overlay: "lava" as never, seed: 1 })).toBeNull();
    });

    it("draws in its own tint and reflectivity, or its kind's", () => {
        expect(OverlayTint({ overlay: "water", seed: 1 })).toBe(OverlayLooks.water.tint);
        expect(OverlayTint({ overlay: "water", seed: 1, tint: 0x123456 })).toBe(0x123456);
        expect(OverlayReflectivity({ overlay: "dirt", seed: 1 })).toBe(0);
        expect(OverlayReflectivity({ overlay: "dirt", seed: 1, reflectivity: 0.4 })).toBe(0.4);
    });
});

describe("FindOverlays", () => {
    it("takes overlay brushes on data layers, sanitised, the last on a cell winning", () => {
        const found = FindOverlays(
            [
                brush(DataBrushName.OVERLAY, 1, 1, { overlay: "dirt", seed: 2 }),
                brush(DataBrushName.OVERLAY, 2, 1, { overlay: "water", seed: 3.2 }),
                brush(DataBrushName.OVERLAY, 1, 1, { overlay: "mud", seed: 5 }),
                brush(DataBrushName.OVERLAY, 3, 1, { overlay: "lava", seed: 5 }),
                brush(DataBrushName.OVERLAY, 4, 1, 7),
                brush(DataBrushName.COLLISION, 5, 1, null),
                brush(DataBrushName.OVERLAY, 6, 1, { overlay: "dirt", seed: 1 }, TILES)
            ],
            layerId => layerId < 0
        );
        expect(found).toEqual([
            { x: 2, y: 1, value: { overlay: "water", seed: 3 } },
            { x: 1, y: 1, value: { overlay: "mud", seed: 5 } }
        ]);
    });

    it("lets an unreadable brush clear the cell, as it was painted over the one before", () => {
        const found = FindOverlays(
            [brush(DataBrushName.OVERLAY, 1, 1, { overlay: "dirt", seed: 2 }), brush(DataBrushName.OVERLAY, 1, 1, { overlay: "lava", seed: 2 })],
            () => true
        );
        expect(found).toEqual([]);
    });
});

describe("Overlays", () => {
    it("finds a cell's overlay, with its look", () => {
        const overlays = new Overlays([water(2, 3, 4, { tint: 0x112233 })]);
        const cell = overlays.At(2, 3);
        expect(cell).toMatchObject({ x: 2, y: 3, kind: OverlayKinds.indexOf("water"), tint: 0x112233, reflectivity: OverlayLooks.water.reflectivity });
        expect(overlays.At(3, 3)).toBeNull();
        expect(overlays.Any).toBe(true);
        expect(new Overlays().Any).toBe(false);
    });

    it("works with cells left of and above the origin", () => {
        const overlays = new Overlays([water(-4, -7)]);
        expect(overlays.At(-4, -7)).not.toBeNull();
        expect(overlays.At(4, 7)).toBeNull();
    });

    it("joins the cells of one kind and seed side by side, and corner to corner", () => {
        // .WW
        // WW.
        const overlays = new Overlays([water(1, 0), water(2, 0), water(0, 1), water(1, 1)]);
        expect(overlays.At(1, 0).joins).toBe(OverlayJoin.E | OverlayJoin.S | OverlayJoin.SW);
        expect(overlays.At(2, 0).joins).toBe(OverlayJoin.W | OverlayJoin.SW);
        expect(overlays.At(0, 1).joins).toBe(OverlayJoin.E | OverlayJoin.NE);
        expect(overlays.At(1, 1).joins).toBe(OverlayJoin.N | OverlayJoin.NE | OverlayJoin.W);
    });

    it("joins a cell to all eight round it in the middle of a patch", () => {
        const cells: OverlayPlacement[] = [];
        for (let x = 0; x < 3; x++) {
            for (let y = 0; y < 3; y++) {
                cells.push(water(x, y));
            }
        }
        expect(new Overlays(cells).At(1, 1).joins).toBe(255);
    });

    it("keeps kinds, seeds and heights apart", () => {
        const overlays = new Overlays(
            [water(0, 0), { x: 1, y: 0, value: { overlay: "slime", seed: 1 } }, water(0, 1, 2), water(-1, 0)],
            (x, y) => (x === -1 && y === 0 ? 1 : 0)
        );
        expect(overlays.At(0, 0).joins).toBe(0);
    });

    it("joins cells that differ only in tint or reflectivity - one patch, the pattern running on", () => {
        const overlays = new Overlays([water(0, 0), water(1, 0, 1, { tint: 0x000000, reflectivity: 0.1 })]);
        expect(overlays.At(0, 0).joins).toBe(OverlayJoin.E);
    });

    it("lays its pattern out in the level file's coordinates", () => {
        const overlays = new Overlays([water(2, 3)], () => 0, { x: 10, y: -4 });
        expect(overlays.At(2, 3)).toMatchObject({ patternX: 12, patternY: -1 });
    });

    it("keeps the last placement on a cell", () => {
        const overlays = new Overlays([water(0, 0), { x: 0, y: 0, value: { overlay: "dirt", seed: 1 } }]);
        expect(overlays.All.length).toBe(1);
        expect(overlays.At(0, 0).value.overlay).toBe("dirt");
    });

    describe("reflections", () => {
        const overlays = new Overlays([water(3, 5), { x: 4, y: 5, value: { overlay: "dirt", seed: 1 } }, { x: 5, y: 5, value: { overlay: "dirt", seed: 1, reflectivity: 0.3 } }]);

        it("mirrors only where there's some reflectivity", () => {
            expect(overlays.Reflects(3, 5)).toBe(true);
            expect(overlays.Reflects(4, 5)).toBe(false);
            expect(overlays.Reflects(5, 5)).toBe(true);
            expect(overlays.Reflects(6, 5)).toBe(false);
            expect(overlays.AnyReflective).toBe(true);
            expect(new Overlays([{ x: 0, y: 0, value: { overlay: "moss", seed: 1 } }]).AnyReflective).toBe(false);
        });

        it("mirrors nothing where it's faded away to nothing, and faintly where it's faded", () => {
            const faded = new Overlays([{ x: 0, y: 0, value: { overlay: "water", seed: 1, alpha: 0 } }, { x: 1, y: 0, value: { overlay: "water", seed: 1, alpha: 0.5 } }]);
            expect(faded.Reflects(0, 0)).toBe(false);
            expect(faded.Reflects(1, 0)).toBe(true);
            expect(faded.At(1, 0).alpha).toBe(0.5);
            // Still one patch: the alpha's a look, like the tint.
            expect(faded.At(1, 0).joins & OverlayJoin.W).toBe(OverlayJoin.W);
            expect(new Overlays([{ x: 0, y: 0, value: { overlay: "water", seed: 1, alpha: 0 } }]).AnyReflective).toBe(false);
        });

        it("shows what stands on a reflective cell, or just above one", () => {
            // A hero standing on the water: feet at the bottom of row 5.
            expect(overlays.ReflectsAt(48, 64, 96, 16)).toBe(true);
            // A wall face on row 4, its foot on the water's top edge.
            expect(overlays.ReflectsAt(48, 64, 80, 16)).toBe(true);
            // Two rows up: its reflection would be on the floor between.
            expect(overlays.ReflectsAt(48, 64, 64, 16)).toBe(false);
            // Over the dirt, which doesn't mirror.
            expect(overlays.ReflectsAt(64, 80, 96, 16)).toBe(false);
            // A wide sprite with a corner over the water.
            expect(overlays.ReflectsAt(20, 52, 96, 16)).toBe(true);
            // Its right edge isn't included: ending at x 48 it stops short of the water.
            expect(overlays.ReflectsAt(16, 48, 96, 16)).toBe(false);
        });
    });
});

describe("OverlayLayerIndex", () => {
    it("draws over the last floor layer under the figures", () => {
        expect(OverlayLayerIndex([{ kind: "floor" }, { kind: "walls" }, {}, {}], 3)).toBe(0);
        expect(OverlayLayerIndex([{ kind: "floor" }, {}, { kind: "floor" }, { kind: "walls" }], 4)).toBe(2);
        // A floor layer over the figures isn't the floor they walk on.
        expect(OverlayLayerIndex([{}, { kind: "walls" }, { kind: "floor" }], 2)).toBe(0);
    });

    it("takes the first layer for the floor in a level without a floor layer", () => {
        expect(OverlayLayerIndex([{}, {}], 2)).toBe(0);
    });

    it("goes under everything when every layer is over the figures, or there are none", () => {
        expect(OverlayLayerIndex([{}, {}], 0)).toBe(-1);
        expect(OverlayLayerIndex([], 0)).toBe(-1);
    });
});
