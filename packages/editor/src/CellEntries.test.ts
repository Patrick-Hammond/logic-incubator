import { describe, expect, it } from "vitest";
import { Vec2Like } from "@logic-incubator/lib/math/Geometry";
import { AssetMetadata } from "@logic-incubator/engine/level/AssetMetadata";
import { NoLock } from "@logic-incubator/engine/level/entities/Keys";
import { Brush, DataBrushName, HEIGHT_LAYER_ID, LevelLayer } from "@logic-incubator/engine/level/LevelFormat";
import { CellEntriesAt, CellLookups, EntryName, SummariseCell } from "./CellEntries";

const attributes: LevelLayer = { id: -99999, name: "attributes", isData: true };
const height: LevelLayer = { id: HEIGHT_LAYER_ID, name: "height", isData: true, isHeight: true };
const floor: LevelLayer = { id: 0, name: "floor", isData: false, kind: "floor" };
const props: LevelLayer = { id: 1, name: "props", isData: false };
const LAYERS = [attributes, height, floor, props];

const TORCH = { light: { brightness: 1, tint: 0xffaa55, range: 5 } };
const DOOR = { door: { open: "door_open" } } as unknown as AssetMetadata;
const META: { [name: string]: AssetMetadata } = { torch: TORCH, door_closed: DOOR };

function brush(name: string, x: number, y: number, layerId: number, data: Brush["data"] = null): Brush {
    return { name, position: { x, y }, pixelOffset: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 }, layerId, data };
}

/** Every sprite is one cell, but the door, which is two wide; a spawner brush covers the cell right of it too. */
const LOOKUPS: CellLookups = {
    tileFootprint: b => (b.name === "door_closed" ? [b.position, { x: b.position.x + 1, y: b.position.y }] : [b.position]),
    dataFootprint: b => (b.name === DataBrushName.SPAWNER ? [b.position, { x: b.position.x + 1, y: b.position.y }] : [b.position]),
    metaFor: name => META[name]
};

const entriesAt = (levelData: Brush[], cell: Vec2Like) => CellEntriesAt(levelData, LAYERS, cell, LOOKUPS);

describe("CellEntriesAt", () => {
    it("lists the cell's data brushes as painted, then its tiles' own values from the top down, then its height", () => {
        const levelData = [
            brush("torch", 2, 2, floor.id),
            brush(DataBrushName.DIALOG, 2, 2, attributes.id, { script: "Hello" }),
            brush("door_closed", 2, 2, props.id),
            brush(DataBrushName.COLLISION, 2, 2, attributes.id),
            brush(DataBrushName.Z_INDEX, 2, 2, HEIGHT_LAYER_ID, 3),
            brush("floor_1", 2, 2, floor.id),
            brush(DataBrushName.EXIT, 3, 2, attributes.id)
        ];
        const entries = entriesAt(levelData, { x: 2, y: 2 });
        expect(entries.map(EntryName)).toEqual(["dialog", "collision", "door", "light", "height 3"]);
        expect(entries[2]).toMatchObject({ type: "tile", kind: "door", value: { lock: NoLock }, target: levelData[2] });
        expect(entries[4]).toMatchObject({ type: "height", target: levelData[4], height: 3 });
    });

    it("counts what covers the cell from further away - a wide sprite, a spawner's footprint", () => {
        const levelData = [brush("door_closed", 4, 4, props.id), brush(DataBrushName.SPAWNER, 4, 4, attributes.id, { monsters: ["imp"], interval: 3, maxAlive: 2, total: 0, activationRange: 10, hitPoints: 10 })];
        expect(entriesAt(levelData, { x: 5, y: 4 }).map(EntryName)).toEqual(["spawner", "door", "height 0"]);
        expect(entriesAt(levelData, { x: 6, y: 4 }).map(EntryName)).toEqual(["height 0"]);
    });

    it("always ends with the height, unpainted as 0 with no brush", () => {
        expect(entriesAt([], { x: 0, y: 0 })).toEqual([{ type: "height", target: null, height: 0 }]);
    });

    it("marks a tile's light that a light painted on its own cell replaces - and only there", () => {
        const blue = { brightness: 0.6, tint: 0x6688ff, range: 9 };
        const levelData = [brush("torch", 2, 2, floor.id), brush(DataBrushName.LIGHT, 2, 2, attributes.id, blue), brush("torch", 3, 3, floor.id)];
        const entries = entriesAt(levelData, { x: 2, y: 2 });
        expect(entries.map(EntryName)).toEqual(["light", "light", "height 0"]);
        expect(entries[0]).toMatchObject({ type: "data", target: levelData[1] });
        expect(entries[1]).toMatchObject({ type: "tile", kind: "light", replaced: true });
        expect(SummariseCell(entries)).toBe("light");
        expect(entriesAt(levelData, { x: 3, y: 3 })[0]).not.toHaveProperty("replaced");
    });

    it("lists what's on hidden layers too - the inspector shows the cell as the game has it", () => {
        const hidden = CellEntriesAt([brush("torch", 0, 0, floor.id)], [{ ...floor, visible: false } as LevelLayer], { x: 0, y: 0 }, LOOKUPS);
        expect(hidden.map(EntryName)).toEqual(["light", "height 0"]);
    });
});

describe("SummariseCell", () => {
    it("names everything on the cell in a line, but a height of 0 - nothing at all for an empty cell", () => {
        const levelData = [brush(DataBrushName.COLLISION, 0, 0, attributes.id), brush("torch", 0, 0, floor.id), brush(DataBrushName.Z_INDEX, 1, 0, HEIGHT_LAYER_ID, -2)];
        expect(SummariseCell(entriesAt(levelData, { x: 0, y: 0 }))).toBe("collision · light");
        expect(SummariseCell(entriesAt(levelData, { x: 1, y: 0 }))).toBe("height -2");
        expect(SummariseCell(entriesAt(levelData, { x: 9, y: 9 }))).toBe("");
    });
});
