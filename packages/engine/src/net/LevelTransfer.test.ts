import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";
import type { LevelFile } from "../level/LevelFormat";
import { LevelHash, PackLevel, UnpackLevel } from "./LevelTransfer";

function Fixture(): LevelFile {
    return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "level", "__fixtures__", "dungeonLevel.json"), "utf8"));
}

describe("LevelHash", () => {
    it("is the same for the same level, however it was come by", () => {
        expect(LevelHash(Fixture())).toBe(LevelHash(Fixture()));
        expect(LevelHash(Fixture())).toMatch(/^[0-9a-f]{8}-\d+$/);
    });

    it("differs when anything in the level does", () => {
        const level = Fixture();
        const before = LevelHash(level);
        level.levelData.levelData.pop();
        expect(LevelHash(level)).not.toBe(before);
    });
});

describe("PackLevel and UnpackLevel", () => {
    it("send a level across smaller, and bring it back as it was", async () => {
        const level = Fixture();
        const packed = await PackLevel(level);
        expect(packed[0]).toBe(1);
        expect(packed.length).toBeLessThan(JSON.stringify(level).length / 4);
        const unpacked = await UnpackLevel(packed);
        expect(unpacked).toEqual(level);
        expect(LevelHash(unpacked)).toBe(LevelHash(level));
    });

    it("read a level sent plain, by a browser that can't compress", async () => {
        const level = Fixture();
        const json = new TextEncoder().encode(JSON.stringify(level));
        const plain = new Uint8Array(json.length + 1);
        plain.set(json, 1);
        expect(await UnpackLevel(plain)).toEqual(level);
    });

    it("reject what isn't a level", async () => {
        await expect(UnpackLevel(new Uint8Array([9, 1, 2]))).rejects.toThrow("Not a packed level");
        const notLevel = new TextEncoder().encode(JSON.stringify({ hello: 1 }));
        const packed = new Uint8Array(notLevel.length + 1);
        packed.set(notLevel, 1);
        await expect(UnpackLevel(packed)).rejects.toThrow("isn't a level file");
    });
});
