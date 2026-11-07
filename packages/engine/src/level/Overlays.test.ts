import { describe, expect, it } from "vitest";
import { BareFloor } from "../view/helpers/PlayerMovement";
import { DataBrushName } from "./LevelFormat";
import Overlays, {
    DefaultOverlayValue,
    FindOverlays,
    IsOverlayValue,
    MaxOverlaySlipperiness,
    MaxOverlaySpeed,
    MinOverlaySpeed,
    OverlayJoin,
    OverlayKinds,
    OverlayLayerIndex,
    OverlayLooks,
    OverlayAlpha,
    OverlayBlendOf,
    OverlayBlends,
    OverlayFootingOf,
    OverlayFootings,
    OverlayPlacement,
    OverlayReflectivity,
    OverlaySlipperiness,
    OverlaySpeed,
    OverlayTint,
    OverlayValue,
    SanitiseOverlayValue
} from "./Overlays";

const DATA = -1;
const TILES = 0;

function brush(name: string, x: number, y: number, data: unknown, layerId = DATA) {
    return { name, position: { x, y }, layerId, data };
}

function water(x: number, y: number, extra: Partial<OverlayValue> = {}): OverlayPlacement {
    return { x, y, value: { overlay: "water", ...extra } };
}

describe("OverlayValue", () => {
    it("is told apart by its kind", () => {
        expect(IsOverlayValue({ overlay: "water" })).toBe(true);
        expect(IsOverlayValue({ portal: 1 })).toBe(false);
        expect(IsOverlayValue(3)).toBe(false);
        expect(IsOverlayValue(null)).toBe(false);
    });

    it("starts as water", () => {
        expect(DefaultOverlayValue()).toEqual({ overlay: "water" });
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

    it("has a footing for every kind, as Patrick set them - slime slowest and most slippery, mud stopping shortest", () => {
        expect(OverlayFootings).toEqual({
            dirt: { speed: 0.95, slipperiness: 1 },
            mud: { speed: 0.3, slipperiness: 0.1 },
            water: { speed: 0.4, slipperiness: 0.5 },
            slime: { speed: 0.1, slipperiness: 3 },
            blood: { speed: 0.95, slipperiness: 1.5 },
            moss: { speed: 0.9, slipperiness: 0.9 },
            shiny: { speed: 1, slipperiness: 1.3 }
        });
        expect(Object.keys(OverlayFootings).sort()).toEqual(OverlayKinds.slice().sort());
    });

    it("lets go of an old level's seed", () => {
        expect(SanitiseOverlayValue({ overlay: "dirt", seed: 3 } as OverlayValue)).toEqual({ overlay: "dirt" });
    });

    it("is sanitised: speed and slipperiness in range to a hundredth, kept only where they differ from the kind's", () => {
        expect(SanitiseOverlayValue({ overlay: "mud", speed: 0.5 })).toEqual({ overlay: "mud", speed: 0.5 });
        expect(SanitiseOverlayValue({ overlay: "mud", speed: 0.3 })).toEqual({ overlay: "mud" });
        expect(SanitiseOverlayValue({ overlay: "mud", speed: 0.30000000000000004 })).toEqual({ overlay: "mud" });
        expect(SanitiseOverlayValue({ overlay: "mud", speed: 0 })).toEqual({ overlay: "mud", speed: MinOverlaySpeed });
        expect(SanitiseOverlayValue({ overlay: "mud", speed: 9 })).toEqual({ overlay: "mud", speed: MaxOverlaySpeed });
        expect(SanitiseOverlayValue({ overlay: "mud", speed: NaN })).toEqual({ overlay: "mud" });
        expect(SanitiseOverlayValue({ overlay: "slime", slipperiness: 1 })).toEqual({ overlay: "slime", slipperiness: 1 });
        expect(SanitiseOverlayValue({ overlay: "slime", slipperiness: 3 })).toEqual({ overlay: "slime" });
        expect(SanitiseOverlayValue({ overlay: "slime", slipperiness: -1 })).toEqual({ overlay: "slime", slipperiness: 0 });
        expect(SanitiseOverlayValue({ overlay: "slime", slipperiness: 99 })).toEqual({ overlay: "slime", slipperiness: MaxOverlaySlipperiness });
        expect(SanitiseOverlayValue({ overlay: "slime", slipperiness: 1.234 })).toEqual({ overlay: "slime", slipperiness: 1.23 });
    });

    it("walks as its own speed and slipperiness, or its kind's", () => {
        expect(OverlaySpeed({ overlay: "water" })).toBe(0.4);
        expect(OverlaySpeed({ overlay: "water", speed: 1.2 })).toBe(1.2);
        expect(OverlaySlipperiness({ overlay: "water" })).toBe(0.5);
        expect(OverlaySlipperiness({ overlay: "water", slipperiness: 0 })).toBe(0);
        expect(OverlayFootingOf({ overlay: "shiny", speed: 0.5 })).toEqual({ speed: 0.5, slipperiness: 1.3 });
    });

    it("is sanitised: tint and reflectivity only where they differ from the kind's", () => {
        expect(SanitiseOverlayValue({ overlay: "shiny", reflectivity: 2 })).toEqual({ overlay: "shiny", reflectivity: 1 });
        expect(SanitiseOverlayValue({ overlay: "shiny", reflectivity: OverlayLooks.shiny.reflectivity })).toEqual({ overlay: "shiny" });
        expect(SanitiseOverlayValue({ overlay: "slime", tint: 0x9b30ff })).toEqual({ overlay: "slime", tint: 0x9b30ff });
        expect(SanitiseOverlayValue({ overlay: "slime", tint: OverlayLooks.slime.tint })).toEqual({ overlay: "slime" });
        expect(SanitiseOverlayValue({ overlay: "slime", tint: 0x1ffffff })).toEqual({ overlay: "slime", tint: 0xffffff });
    });

    it("keeps an alpha only where it fades the overlay, from 0 up to 1", () => {
        expect(SanitiseOverlayValue({ overlay: "water", alpha: 0.4 })).toEqual({ overlay: "water", alpha: 0.4 });
        expect(SanitiseOverlayValue({ overlay: "water", alpha: 1 })).toEqual({ overlay: "water" });
        expect(SanitiseOverlayValue({ overlay: "water", alpha: 3 })).toEqual({ overlay: "water" });
        expect(SanitiseOverlayValue({ overlay: "water", alpha: -2 })).toEqual({ overlay: "water", alpha: 0 });
        expect(SanitiseOverlayValue({ overlay: "water", alpha: NaN })).toEqual({ overlay: "water" });
        expect(OverlayAlpha({ overlay: "water" })).toBe(1);
        expect(OverlayAlpha({ overlay: "water", alpha: 0.25 })).toBe(0.25);
    });

    it("keeps a blend only where it's one the game knows other than normal", () => {
        expect(OverlayBlends).toEqual(["normal", "add", "multiply", "screen"]);
        expect(SanitiseOverlayValue({ overlay: "blood", blend: "multiply" })).toEqual({ overlay: "blood", blend: "multiply" });
        expect(SanitiseOverlayValue({ overlay: "blood", blend: "normal" })).toEqual({ overlay: "blood" });
        expect(SanitiseOverlayValue({ overlay: "blood", blend: "overlay" as never })).toEqual({ overlay: "blood" });
        expect(OverlayBlendOf({ overlay: "blood" })).toBe("normal");
        expect(OverlayBlendOf({ overlay: "blood", blend: "screen" })).toBe("screen");
    });

    it("drops a kind the game doesn't know", () => {
        expect(SanitiseOverlayValue({ overlay: "lava" as never })).toBeNull();
    });

    it("draws in its own tint and reflectivity, or its kind's", () => {
        expect(OverlayTint({ overlay: "water" })).toBe(OverlayLooks.water.tint);
        expect(OverlayTint({ overlay: "water", tint: 0x123456 })).toBe(0x123456);
        expect(OverlayReflectivity({ overlay: "dirt" })).toBe(0);
        expect(OverlayReflectivity({ overlay: "dirt", reflectivity: 0.4 })).toBe(0.4);
    });
});

describe("FindOverlays", () => {
    it("takes overlay brushes on data layers, sanitised, the last on a cell winning", () => {
        const found = FindOverlays(
            [
                brush(DataBrushName.OVERLAY, 1, 1, { overlay: "dirt" }),
                brush(DataBrushName.OVERLAY, 2, 1, { overlay: "water", seed: 3, speed: 0.7 }),
                brush(DataBrushName.OVERLAY, 1, 1, { overlay: "mud" }),
                brush(DataBrushName.OVERLAY, 3, 1, { overlay: "lava" }),
                brush(DataBrushName.OVERLAY, 4, 1, 7),
                brush(DataBrushName.COLLISION, 5, 1, null),
                brush(DataBrushName.OVERLAY, 6, 1, { overlay: "dirt" }, TILES)
            ],
            layerId => layerId < 0
        );
        expect(found).toEqual([
            { x: 2, y: 1, value: { overlay: "water", speed: 0.7 } },
            { x: 1, y: 1, value: { overlay: "mud" } }
        ]);
    });

    it("lets an unreadable brush clear the cell, as it was painted over the one before", () => {
        const found = FindOverlays(
            [brush(DataBrushName.OVERLAY, 1, 1, { overlay: "dirt" }), brush(DataBrushName.OVERLAY, 1, 1, { overlay: "lava" })],
            () => true
        );
        expect(found).toEqual([]);
    });
});

describe("Overlays", () => {
    it("finds a cell's overlay, with its look", () => {
        const overlays = new Overlays([water(2, 3, { tint: 0x112233 })]);
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

    it("joins the cells of one kind side by side, and corner to corner", () => {
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

    it("keeps kinds and heights apart", () => {
        const overlays = new Overlays([water(0, 0), { x: 1, y: 0, value: { overlay: "slime" } }, water(-1, 0)], (x, y) => (x === -1 && y === 0 ? 1 : 0));
        expect(overlays.At(0, 0).joins).toBe(0);
    });

    it("joins cells that differ only in how they're walked on, tint or reflectivity - one patch, the pattern running on", () => {
        const overlays = new Overlays([water(0, 0), water(1, 0, { speed: 1, slipperiness: 2, tint: 0x000000, reflectivity: 0.1 })]);
        expect(overlays.At(0, 0).joins).toBe(OverlayJoin.E);
    });

    it("says how a cell is walked on: its overlay's speed and slipperiness, or bare floor's where there's none", () => {
        const overlays = new Overlays([water(0, 0), { x: 1, y: 0, value: { overlay: "slime", speed: 0.5 } }]);
        expect(overlays.FootingAt(0, 0)).toEqual({ speed: 0.4, slipperiness: 0.5 });
        expect(overlays.FootingAt(1, 0)).toEqual({ speed: 0.5, slipperiness: 3 });
        expect(overlays.FootingAt(2, 0)).toEqual({ speed: 1, slipperiness: 1 });
        expect(new Overlays().FootingAt(0, 0)).toBe(BareFloor);
    });

    it("lays its pattern out in the level file's coordinates", () => {
        const overlays = new Overlays([water(2, 3)], () => 0, { x: 10, y: -4 });
        expect(overlays.At(2, 3)).toMatchObject({ patternX: 12, patternY: -1 });
    });

    it("keeps the last placement on a cell", () => {
        const overlays = new Overlays([water(0, 0), { x: 0, y: 0, value: { overlay: "dirt" } }]);
        expect(overlays.All.length).toBe(1);
        expect(overlays.At(0, 0).value.overlay).toBe("dirt");
    });

    describe("reflections", () => {
        const overlays = new Overlays([water(3, 5), { x: 4, y: 5, value: { overlay: "dirt" } }, { x: 5, y: 5, value: { overlay: "dirt", reflectivity: 0.3 } }]);

        it("mirrors only where there's some reflectivity", () => {
            expect(overlays.Reflects(3, 5)).toBe(true);
            expect(overlays.Reflects(4, 5)).toBe(false);
            expect(overlays.Reflects(5, 5)).toBe(true);
            expect(overlays.Reflects(6, 5)).toBe(false);
            expect(overlays.AnyReflective).toBe(true);
            expect(new Overlays([{ x: 0, y: 0, value: { overlay: "moss" } }]).AnyReflective).toBe(false);
        });

        it("mirrors nothing where it's faded away to nothing, and faintly where it's faded", () => {
            const faded = new Overlays([{ x: 0, y: 0, value: { overlay: "water", alpha: 0 } }, { x: 1, y: 0, value: { overlay: "water", alpha: 0.5 } }]);
            expect(faded.Reflects(0, 0)).toBe(false);
            expect(faded.Reflects(1, 0)).toBe(true);
            expect(faded.At(1, 0).alpha).toBe(0.5);
            // Still one patch: the alpha's a look, like the tint.
            expect(faded.At(1, 0).joins & OverlayJoin.W).toBe(OverlayJoin.W);
            expect(new Overlays([{ x: 0, y: 0, value: { overlay: "water", alpha: 0 } }]).AnyReflective).toBe(false);
        });

        it("knows each cell's blend by its place in OverlayBlends, a patch running on across blends", () => {
            const blended = new Overlays([{ x: 0, y: 0, value: { overlay: "slime" } }, { x: 1, y: 0, value: { overlay: "slime", blend: "add" } }]);
            expect(blended.At(0, 0).blend).toBe(OverlayBlends.indexOf("normal"));
            expect(blended.At(1, 0).blend).toBe(OverlayBlends.indexOf("add"));
            expect(blended.At(1, 0).joins & OverlayJoin.W).toBe(OverlayJoin.W);
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
