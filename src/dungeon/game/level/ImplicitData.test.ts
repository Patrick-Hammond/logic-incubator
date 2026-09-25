import { describe, expect, it } from "vitest";
import { AssetMetadata } from "./AssetMetadata";
import { FindImplicitPlacements, ImplicitBrush } from "./ImplicitData";

const TILE = 16;
const TILE_LAYER = 0;
const DATA_LAYER = -1;

const META: { [name: string]: AssetMetadata } = {
    wall: { collidable: true },
    floor: {},
    door: { door: { id: 1, open: false } },
    torch: { light: { brightness: 1, tint: 0xff8100, range: 5 } }
};
const SIZES: { [name: string]: { width: number; height: number } } = { door: { width: 32, height: 32 } };

function brush(name: string, x: number, y: number, layerId = TILE_LAYER, extra: Partial<ImplicitBrush> = {}): ImplicitBrush {
    return { name, position: { x, y }, pixelOffset: { x: 0, y: 0 }, layerId, ...extra };
}

function find(brushes: ImplicitBrush[]) {
    return FindImplicitPlacements(
        brushes,
        layerId => layerId >= 0,
        name => META[name],
        name => SIZES[name] || { width: TILE, height: TILE },
        TILE
    );
}

describe("FindImplicitPlacements", () => {
    it("marks collidable tiles, and nothing for tiles with no relevant metadata", () => {
        const result = find([brush("wall", 1, 2), brush("floor", 3, 3), brush("unknown", 4, 4)]);
        expect(result.collision).toEqual([{ x: 1, y: 2 }]);
        expect(result.doors).toEqual([]);
        expect(result.lights).toEqual([]);
    });

    it("expands a door to every cell of its sprite footprint, tagged with its id", () => {
        const result = find([brush("door", 5, 5)]);
        expect(result.doors.map(d => `${d.x},${d.y}:${d.id}`).sort()).toEqual(["5,5:1", "5,6:1", "6,5:1", "6,6:1"]);
    });

    it("keeps editor-space coordinates, including negative ones (the editor doesn't normalise)", () => {
        const result = find([brush("door", 28, -4), brush("wall", -3, -1)]);
        expect(result.collision).toEqual([{ x: -3, y: -1 }]);
        expect(result.doors.map(d => `${d.x},${d.y}`).sort()).toEqual(["28,-3", "28,-4", "29,-3", "29,-4"]);
    });

    it("reports a tile's intrinsic light", () => {
        expect(find([brush("torch", 2, 2)]).lights).toEqual([{ x: 2, y: 2, value: META.torch.light }]);
    });

    it("drops an intrinsic light where an explicit LIGHT brush sits on the same cell", () => {
        const explicit = brush("light", 2, 2, DATA_LAYER, { data: { brightness: 0.5, tint: 0xffffff, range: 3 } });
        expect(find([brush("torch", 2, 2), explicit]).lights).toEqual([]);
        // ...but only on that cell.
        expect(find([brush("torch", 3, 2), explicit]).lights.length).toBe(1);
    });

    it("ignores a LIGHT brush with no valid light value when deciding precedence", () => {
        const broken = brush("light", 2, 2, DATA_LAYER, { data: 4 });
        expect(find([brush("torch", 2, 2), broken]).lights.length).toBe(1);
    });

    it("ignores brushes on data layers, even if their name has metadata", () => {
        const result = find([brush("wall", 1, 1, DATA_LAYER), brush("door", 2, 2, DATA_LAYER)]);
        expect(result.collision).toEqual([]);
        expect(result.doors).toEqual([]);
    });
});
