import { describe, expect, it } from "vitest";
import { AtlasTextureLike, AtlasUrl, ComposeAtlasFrame, SheetOfAtlasUrl } from "./AtlasFrames";

/** An atlas image whose pixel at (x, y) is [x, y, 100, 255] - so every cell says where it came from. */
function Atlas(width: number, height: number) {
    const rgba = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) rgba.set([x, y, 100, 255], (y * width + x) * 4);
    return { width, height, rgba };
}

const texture = (over: Partial<AtlasTextureLike>): AtlasTextureLike => ({
    frame: { x: 0, y: 0, width: 2, height: 2 },
    trim: null,
    orig: { width: 2, height: 2 },
    rotate: 0,
    baseTexture: { resource: { url: "http://h/assets/global/atlases/dungeon_0.png?v=ab" } },
    ...over
});

const pixel = (f: { width: number; rgba: Uint8Array }, x: number, y: number) => Array.from(f.rgba.subarray((y * f.width + x) * 4, (y * f.width + x) * 4 + 4));

describe("ComposeAtlasFrame", () => {
    it("copies an untrimmed frame as it is", () => {
        const f = ComposeAtlasFrame(Atlas(8, 8), texture({ frame: { x: 3, y: 4, width: 2, height: 2 } }));
        expect([f.width, f.height]).toEqual([2, 2]);
        expect(pixel(f, 0, 0)).toEqual([3, 4, 100, 255]);
        expect(pixel(f, 1, 1)).toEqual([4, 5, 100, 255]);
    });

    it("puts a trimmed frame back where the trim took it from, the rest transparent", () => {
        const f = ComposeAtlasFrame(Atlas(8, 8), texture({ frame: { x: 2, y: 1, width: 2, height: 1 }, trim: { x: 3, y: 2, width: 2, height: 1 }, orig: { width: 6, height: 5 } }));
        expect([f.width, f.height]).toEqual([6, 5]);
        expect(pixel(f, 3, 2)).toEqual([2, 1, 100, 255]);
        expect(pixel(f, 4, 2)).toEqual([3, 1, 100, 255]);
        expect(pixel(f, 0, 0)).toEqual([0, 0, 0, 0]);
        expect(pixel(f, 5, 2)).toEqual([0, 0, 0, 0]);
        expect(pixel(f, 3, 3)).toEqual([0, 0, 0, 0]);
        expect(f.rgba.filter((v, i) => i % 4 === 3 && v !== 0)).toHaveLength(2);
    });

    it("gives a fully transparent frame (packed as one pixel) back at its full size", () => {
        const atlas = Atlas(4, 4);
        atlas.rgba.set([0, 0, 0, 0], 0);
        const f = ComposeAtlasFrame(atlas, texture({ frame: { x: 0, y: 0, width: 1, height: 1 }, trim: { x: 0, y: 0, width: 1, height: 1 }, orig: { width: 16, height: 16 } }));
        expect([f.width, f.height]).toEqual([16, 16]);
        expect(f.rgba.every(v => v === 0)).toBe(true);
    });

    it("keeps exact colours, including translucent ones", () => {
        const atlas = { width: 2, height: 1, rgba: Uint8Array.from([200, 10, 30, 7, 1, 2, 3, 250]) };
        const f = ComposeAtlasFrame(atlas, texture({ frame: { x: 0, y: 0, width: 2, height: 1 }, orig: { width: 2, height: 1 } }));
        expect(Array.from(f.rgba)).toEqual([200, 10, 30, 7, 1, 2, 3, 250]);
    });

    it("doesn't change the atlas", () => {
        const atlas = Atlas(4, 4);
        const before = atlas.rgba.slice();
        ComposeAtlasFrame(atlas, texture({}));
        expect(Array.from(atlas.rgba)).toEqual(Array.from(before));
    });

    it("refuses a rotated frame, a frame outside the image, and sizes that don't fit", () => {
        expect(() => ComposeAtlasFrame(Atlas(8, 8), texture({ rotate: 2 }))).toThrow(/rotated/);
        expect(() => ComposeAtlasFrame(Atlas(8, 8), texture({ frame: { x: 7, y: 0, width: 2, height: 2 } }))).toThrow(/outside/);
        expect(() => ComposeAtlasFrame(Atlas(8, 8), texture({ frame: { x: -1, y: 0, width: 2, height: 2 } }))).toThrow(/outside/);
        expect(() => ComposeAtlasFrame(Atlas(8, 8), texture({ trim: { x: 1, y: 0, width: 2, height: 2 } }))).toThrow(/fit/);
        expect(() => ComposeAtlasFrame(Atlas(8, 8), texture({ orig: { width: 0, height: 2 } }))).toThrow(/fit/);
    });
});

describe("AtlasUrl and SheetOfAtlasUrl", () => {
    it("read the url a texture was loaded from", () => {
        expect(AtlasUrl(texture({}))).toBe("http://h/assets/global/atlases/dungeon_0.png?v=ab");
        expect(AtlasUrl(texture({ baseTexture: { resource: null } }))).toBeNull();
        expect(AtlasUrl(texture({ baseTexture: { resource: {} } }))).toBeNull();
        expect(AtlasUrl(texture({ baseTexture: undefined }))).toBeNull();
    });

    it("name the sheet the build gave the atlas", () => {
        expect(SheetOfAtlasUrl("http://h/assets/global/atlases/dungeon_0.png?v=ab")).toBe("dungeon");
        expect(SheetOfAtlasUrl("assets/global/atlases/dungeon_ext_3.png")).toBe("dungeon_ext");
        expect(SheetOfAtlasUrl("http://h/a/user_12.PNG#x")).toBe("user");
        expect(SheetOfAtlasUrl("http://h/a/title.png")).toBeNull();
        expect(SheetOfAtlasUrl("")).toBeNull();
    });
});
