import { describe, expect, it, vi } from "vitest";
import { Brush, DataBrushName, LevelFile, LevelVersion } from "./LevelFormat";
import Level from "./Level";

// Only what loading a level of data brushes alone reaches: no tiles, so no textures or sprites are made.
vi.mock("pixi.js", () => ({ AnimatedSprite: class {}, Texture: class {} }));
vi.mock("@logic-incubator/lib/game/Game", () => ({ default: { inst: { dispatcher: { emit: () => undefined } } } }));
vi.mock("@logic-incubator/lib/loading/AssetFactory", () => ({
    default: { inst: { Has: () => false, WarnMissing: () => undefined, CreateTexture: () => undefined } }
}));
vi.mock("./AssetMetadata", async importOriginal => ({
    ...(await importOriginal<typeof import("./AssetMetadata")>()),
    default: { inst: { Get: () => undefined } }
}));
vi.mock("./entities/MonsterRoster", async importOriginal => ({
    ...(await importOriginal<typeof import("./entities/MonsterRoster")>()),
    default: { inst: { SpawnerSprite: undefined } }
}));

function DataBrush(name: string, x: number, y: number): Brush {
    return { name, position: { x, y }, pixelOffset: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 }, layerId: -1, data: 0 };
}

/** A level of data brushes only, from (0, 0) to (10, 8) - so 12 x 10 once normalised - with a start at (3, 4) if `start`. */
function LevelOf(start: boolean): LevelFile {
    const brushes = [DataBrush(DataBrushName.COLLISION, 0, 0), DataBrush(DataBrushName.COLLISION, 10, 8)];
    if (start) {
        brushes.push(DataBrush(DataBrushName.PLAYER_START, 3, 4));
    }
    return { version: LevelVersion, editorData: { layers: [] }, levelData: { levelData: brushes, quests: [] } };
}

describe("Level start position", () => {
    it("is where the start brush is", () => {
        const level = new Level();
        level.LoadLevel(LevelOf(true));
        expect(level.playerStartPosition).toEqual({ x: 3, y: 4 });
    });

    it("falls back to the middle of the map without one", () => {
        const level = new Level();
        level.LoadLevel(LevelOf(false));
        expect(level.playerStartPosition).toEqual({ x: 6, y: 5 });
    });

    it("forgets a start rubbed out since the level was last loaded", () => {
        // The editor hands the game its level again on every Enter, into the same `Level`.
        const level = new Level();
        level.LoadLevel(LevelOf(true));
        level.LoadLevel(LevelOf(false));
        expect(level.playerStartPosition).toEqual({ x: 6, y: 5 });
    });
});
