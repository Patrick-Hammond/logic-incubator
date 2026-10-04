import { describe, expect, it } from "vitest";
import { AtlasTextureLike } from "./AtlasFrames";
import { CatalogueEntry, CreateHostedSprites, HostedDeps, SheetOfAtlasName } from "./HostedSprites";
import { EncodeRgbaPng } from "./Png";

const catalogue: CatalogueEntry[] = [
    { name: "editor", atlases: ["~atlas.editor.ui.0"], ids: ["editor.square"] },
    { name: "global", atlases: ["~atlas.global.dungeon.0", "~atlas.global.dungeon.1", "~atlas.global.dungeon_ext.0"], ids: ["global.crate", "global.bomb", "global.title"] },
    { name: "level1", atlases: [], ids: ["level1.level"] }
];

/** A 4x2 atlas: pixel (x, y) is [x * 10, y * 10, 5, 255]. */
async function AtlasBytes() {
    const rgba = new Uint8Array(4 * 2 * 4);
    for (let y = 0; y < 2; y++) for (let x = 0; x < 4; x++) rgba.set([x * 10, y * 10, 5, 255], (y * 4 + x) * 4);
    return EncodeRgbaPng(4, 2, rgba);
}

const texture = (url: string | null, x: number, over: Partial<AtlasTextureLike> = {}): AtlasTextureLike => ({
    frame: { x, y: 0, width: 2, height: 2 },
    trim: null,
    orig: { width: 2, height: 2 },
    rotate: 0,
    baseTexture: { resource: url ? { url } : null },
    ...over
});

async function Make(textures: { [id: string]: AtlasTextureLike[] }, over: Partial<HostedDeps> = {}) {
    const bytes = await AtlasBytes();
    const fetched: string[] = [];
    const deps: HostedDeps = {
        catalogue: () => catalogue,
        textures: (bundle, name) => textures[bundle + "." + name] || null,
        fetchBytes: async url => {
            fetched.push(url);
            return bytes;
        },
        exclude: ["editor"],
        ...over
    };
    return { hosted: CreateHostedSprites(deps), fetched };
}

describe("SheetOfAtlasName", () => {
    it("reads the sheet out of the atlas name the build gave", () => {
        expect(SheetOfAtlasName("~atlas.global.dungeon.0")).toBe("dungeon");
        expect(SheetOfAtlasName("~atlas.level1.dungeon_ext.12")).toBe("dungeon_ext");
        expect(SheetOfAtlasName("global.dungeon.0")).toBeNull();
        expect(SheetOfAtlasName("")).toBeNull();
    });
});

describe("Bundles", () => {
    it("lists the bundles a sprite could go in - not the editor's own - with their sheets once each and the names taken", async () => {
        const { hosted } = await Make({});
        expect(hosted.Bundles()).toEqual([
            { name: "global", sheets: ["dungeon", "dungeon_ext"], packedSheets: [], names: ["crate", "bomb", "title"] },
            { name: "level1", sheets: [], packedSheets: [], names: ["level"] }
        ]);
    });
});

describe("Read", () => {
    const url = "http://h/assets/global/atlases/dungeon_0.png?v=ab";

    it("rebuilds each frame from the atlas it was loaded from, and says which sheet", async () => {
        const { hosted } = await Make({ "global.bomb": [texture(url, 0), texture(url, 2)] });
        const { sheet, images } = await hosted.Read("global", "bomb");
        expect(sheet).toBe("dungeon");
        expect(images).toHaveLength(2);
        expect(Array.from(images[0].rgba.subarray(0, 4))).toEqual([0, 0, 5, 255]);
        expect(Array.from(images[0].rgba.subarray(4, 8))).toEqual([10, 0, 5, 255]);
        expect(Array.from(images[1].rgba.subarray(0, 4))).toEqual([20, 0, 5, 255]);
        expect(images[1].width).toBe(2);
        expect(images[0].indexed).toBeUndefined();
    });

    it("puts a trimmed frame back at its full size", async () => {
        const { hosted } = await Make({ "global.crate": [texture(url, 1, { frame: { x: 1, y: 0, width: 1, height: 1 }, trim: { x: 2, y: 2, width: 1, height: 1 }, orig: { width: 4, height: 4 } })] });
        const { images } = await hosted.Read("global", "crate");
        expect([images[0].width, images[0].height]).toEqual([4, 4]);
        expect(Array.from(images[0].rgba.subarray((2 * 4 + 2) * 4, (2 * 4 + 2) * 4 + 4))).toEqual([10, 0, 5, 255]);
        expect(images[0].rgba.filter((v, i) => i % 4 === 3 && v).length).toBe(1);
    });

    it("fetches an atlas once however many frames come from it, and again for another", async () => {
        const other = "http://h/assets/global/atlases/dungeon_1.png?v=ab";
        const { hosted, fetched } = await Make({ "global.bomb": [texture(url, 0), texture(url, 2)], "global.crate": [texture(other, 0)] });
        await hosted.Read("global", "bomb");
        await hosted.Read("global", "bomb");
        expect(fetched).toEqual([url]);
        await hosted.Read("global", "crate");
        expect(fetched).toEqual([url, other]);
    });

    it("tries a failed fetch again next time", async () => {
        let fail = true;
        const bytes = await AtlasBytes();
        const { hosted } = await Make({ "global.crate": [texture(url, 0)] }, {
            fetchBytes: async () => {
                if (fail) throw new Error("offline");
                return bytes;
            }
        });
        await expect(hosted.Read("global", "crate")).rejects.toThrow(/offline/);
        fail = false;
        expect((await hosted.Read("global", "crate")).images).toHaveLength(1);
    });

    it("says so when the sprite isn't loaded, or its atlas can't be found", async () => {
        const { hosted } = await Make({ "global.crate": [texture(null, 0)] });
        await expect(hosted.Read("level1", "nope")).rejects.toThrow(/isn't loaded/);
        await expect(hosted.Read("global", "crate")).rejects.toThrow(/which atlas/);
    });

    it("passes on a frame it can't read", async () => {
        const { hosted } = await Make({ "global.crate": [texture(url, 0, { rotate: 6 })] });
        await expect(hosted.Read("global", "crate")).rejects.toThrow(/rotated/);
    });
});
