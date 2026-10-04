import { describe, expect, it } from "vitest";
import { Crc32, EncodeIndexedPng } from "./Png";
import { BundleInfo, SaveRequest, SpriteApi } from "./SpriteApi";
import { ChooseStore, DescribeDownload, DiskStore, Download, DownloadStore, HostedSprites, MetaSnippet, ObsoleteFiles, PackDownload, PngSize, SpriteFolder } from "./SpriteStore";

const palette = [{ r: 0, g: 0, b: 0, a: 0 }, { r: 255, g: 0, b: 0, a: 255 }];
const png = (w: number, h: number) => EncodeIndexedPng(w, h, new Uint8Array(w * h).fill(1), palette);

/** Pulls the file names, sizes and checksums out of a stored zip (the writer has its own thorough tests). */
function Entries(zip: Uint8Array) {
    const view = new DataView(zip.buffer, zip.byteOffset, zip.length);
    const end = zip.length - 22;
    const count = view.getUint16(end + 10, true);
    let at = view.getUint32(end + 16, true);
    const out: Array<{ name: string; size: number; crc: number }> = [];
    for (let i = 0; i < count; i++) {
        const n = view.getUint16(at + 28, true);
        out.push({ name: new TextDecoder().decode(zip.subarray(at + 46, at + 46 + n)), size: view.getUint32(at + 24, true), crc: view.getUint32(at + 16, true) });
        at += 46 + n;
    }
    return out;
}

describe("PackDownload", () => {
    it("is the PNG itself for one frame, named as the build expects", async () => {
        const one = await png(4, 4);
        const d = PackDownload("global", "gem", "user", [one]);
        expect(d.fileName).toBe("gem.png");
        expect(d.mime).toBe("image/png");
        expect(d.bytes).toBe(one);
        expect(d.files).toEqual(["global/sprites/user/gem.png"]);
    });

    it("is a zip laid out from the assets folder down for several", async () => {
        const frames = [await png(4, 4), await png(4, 4), await png(4, 4)];
        const d = PackDownload("global", "flame", "fx", frames);
        expect(d.fileName).toBe("flame.zip");
        expect(d.mime).toBe("application/zip");
        expect(d.files).toEqual(["global/sprites/fx/flame_f0.png", "global/sprites/fx/flame_f1.png", "global/sprites/fx/flame_f2.png"]);
        const entries = Entries(d.bytes);
        expect(entries.map(e => e.name)).toEqual(d.files);
        entries.forEach((e, i) => {
            expect(e.size).toBe(frames[i].length);
            expect(e.crc).toBe(Crc32(frames[i]));
        });
    });

    it("refuses no frames", () => {
        expect(() => PackDownload("g", "x", "user", [])).toThrow(/at least one frame/);
    });

    it("says where a sheet's files go", () => {
        expect(SpriteFolder("level1", "walls")).toBe("level1/sprites/walls");
    });
});

describe("ObsoleteFiles", () => {
    it("lists the frames that are no longer there", () => {
        expect(ObsoleteFiles("g", "d", "bomb", 4, 2)).toEqual(["g/sprites/d/bomb_f2.png", "g/sprites/d/bomb_f3.png"]);
    });

    it("lists the old form's files when a sprite goes from one frame to several, or back", () => {
        expect(ObsoleteFiles("g", "d", "crate", 1, 3)).toEqual(["g/sprites/d/crate.png"]);
        expect(ObsoleteFiles("g", "d", "crate", 3, 1)).toEqual(["g/sprites/d/crate_f0.png", "g/sprites/d/crate_f1.png", "g/sprites/d/crate_f2.png"]);
    });

    it("is empty when nothing goes, and for a sprite that wasn't there", () => {
        expect(ObsoleteFiles("g", "d", "bomb", 2, 2)).toEqual([]);
        expect(ObsoleteFiles("g", "d", "bomb", 2, 5)).toEqual([]);
        expect(ObsoleteFiles("g", "d", "bomb", 0, 3)).toEqual([]);
    });
});

describe("MetaSnippet", () => {
    it("is a line to paste into assets-meta.json", () => {
        expect(MetaSnippet("gem", { category: "user" })).toBe('"gem": {"category":"user"}');
        expect(MetaSnippet("crate2", { category: "dungeon", collidable: true })).toBe('"crate2": {"category":"dungeon","collidable":true}');
        expect(JSON.parse("{" + MetaSnippet("a", { b: 1 }) + "}")).toEqual({ a: { b: 1 } });
    });
});

describe("DescribeDownload", () => {
    const one: Download = { fileName: "gem.png", mime: "image/png", bytes: new Uint8Array(1), files: ["global/sprites/user/gem.png"] };
    const many: Download = { fileName: "flame.zip", mime: "application/zip", bytes: new Uint8Array(1), files: ["g/sprites/fx/flame_f0.png", "g/sprites/fx/flame_f1.png"] };

    it("says where a lone PNG goes, and needs no dialog when that's all there is to do", () => {
        const d = DescribeDownload({ download: one, obsolete: [], metaFile: null, metaSnippet: null });
        expect(d.short).toBe("Downloaded gem.png - put it in global/sprites/user/ in your game's assets folder.");
        expect(d.long).toBeNull();
    });

    it("says to extract a zip where it holds, listing what's in it", () => {
        const d = DescribeDownload({ download: many, obsolete: [], metaFile: null, metaSnippet: null });
        expect(d.short).toContain("extract it in your game's assets folder");
        expect(d.short).toContain("g/sprites/fx/flame_f0.png, g/sprites/fx/flame_f1.png");
        expect(d.long).toBeNull();
    });

    it("lists the steps - place, delete what's replaced, add the meta line - when there are more", () => {
        const d = DescribeDownload({ download: many, obsolete: ["g/sprites/fx/flame.png"], metaFile: "g/data/assets-meta.json", metaSnippet: '"flame": {"category":"user"}' });
        expect(d.long).toBe(
            [
                "1. Extract flame.zip in your game's assets folder - it holds g/sprites/fx/flame_f0.png, g/sprites/fx/flame_f1.png.",
                "2. Delete this file, which the new one replaces: g/sprites/fx/flame.png.",
                '3. Add this line to g/data/assets-meta.json so the game knows the new tile:\n"flame": {"category":"user"}'
            ].join("\n")
        );
    });

    it("numbers the steps it has, and says 'these files' for several", () => {
        const d = DescribeDownload({ download: one, obsolete: ["a", "b"], metaFile: null, metaSnippet: null });
        expect(d.long).toBe("1. Put gem.png in global/sprites/user/ in your game's assets folder.\n2. Delete these files, which the new ones replace: a, b.");
    });

    it("keeps a long list short", () => {
        const files = Array.from({ length: 10 }, (_, i) => `g/sprites/x/a_f${i}.png`);
        const d = DescribeDownload({ download: { ...many, files }, obsolete: [], metaFile: null, metaSnippet: null });
        expect(d.short).toContain("a_f5.png, and 4 more");
        expect(d.short).not.toContain("a_f6.png");
    });
});

describe("PngSize", () => {
    it("reads the header", async () => {
        expect(PngSize(await png(7, 3))).toEqual({ width: 7, height: 3 });
    });

    it("refuses what isn't a PNG", () => {
        expect(() => PngSize(new Uint8Array(40))).toThrow(/isn't a PNG/);
        expect(() => PngSize(new Uint8Array(3))).toThrow(/isn't a PNG/);
    });
});

describe("DownloadStore", () => {
    const bundles: BundleInfo[] = [{ name: "global", sheets: ["dungeon"], packedSheets: [], names: ["crate"] }];
    const hosted = (images: Array<{ width: number; height: number; rgba: Uint8Array }>, sheet: string | null = "dungeon"): HostedSprites => ({
        Bundles: () => bundles,
        Read: async () => ({ sheet, images })
    });

    it("lists what the page knows", async () => {
        expect(await new DownloadStore(hosted([]), () => undefined).List()).toEqual(bundles);
    });

    it("reads a sprite as editable, with where it lives", async () => {
        const img = { width: 2, height: 2, rgba: new Uint8Array(16) };
        const one = await new DownloadStore(hosted([img]), () => undefined).Read("global", "crate");
        expect(one.info).toEqual({ bundle: "global", name: "crate", kind: "sprite", frames: 1, sheet: "dungeon", dir: "sprites/dungeon", editable: true, reason: null });
        const anim = await new DownloadStore(hosted([img, img, img], null), () => undefined).Read("global", "bomb");
        expect(anim.info).toMatchObject({ kind: "animation", frames: 3, sheet: null, dir: null });
        expect(anim.images).toHaveLength(3);
    });

    it("refuses a sprite with no frames", async () => {
        await expect(new DownloadStore(hosted([]), () => undefined).Read("global", "x")).rejects.toThrow(/no frames/);
    });

    it("saves by handing a download over, and reports what it was", async () => {
        const delivered: Download[] = [];
        const store = new DownloadStore(hosted([]), d => delivered.push(d));
        const one = await png(5, 6);
        const result = await store.Save({ bundle: "global", name: "gem", mode: "create", sheet: "user", frames: [one] });
        expect(delivered).toHaveLength(1);
        expect(delivered[0].fileName).toBe("gem.png");
        expect(result).toMatchObject({ ok: true, bundle: "global", name: "gem", kind: "sprite", frames: 1, width: 5, height: 6, written: ["global/sprites/user/gem.png"], removed: [], changed: true, notes: [] });
        expect(result.download).toBe(delivered[0]);
    });

    it("zips several frames, and puts a sprite without a sheet in 'user'", async () => {
        const delivered: Download[] = [];
        const frames = [await png(4, 4), await png(4, 4)];
        const result = await new DownloadStore(hosted([]), d => delivered.push(d)).Save({ bundle: "global", name: "fx", mode: "overwrite", frames } as SaveRequest);
        expect(result.kind).toBe("animation");
        expect(delivered[0].fileName).toBe("fx.zip");
        expect(result.written).toEqual(["global/sprites/user/fx_f0.png", "global/sprites/user/fx_f1.png"]);
    });
});

describe("DiskStore and ChooseStore", () => {
    const fakeApi = (available: boolean) => {
        const calls: string[] = [];
        const api = {
            Available: async () => available,
            List: async () => {
                calls.push("list");
                return [] as BundleInfo[];
            },
            ReadSprite: async () => {
                calls.push("read");
                return { info: { bundle: "g", name: "x", kind: "sprite", frames: 1, sheet: "d", dir: "sprites/d", editable: true, reason: null }, frames: [await png(2, 2)] };
            },
            Save: async (request: SaveRequest) => {
                calls.push("save " + request.name);
                return { ok: true, bundle: request.bundle, name: request.name, kind: "sprite", frames: 1, width: 2, height: 2, written: [], removed: [], changed: true, notes: [] };
            }
        };
        return { api: api as unknown as SpriteApi, calls };
    };

    it("goes through the dev server's service, decoding what it reads", async () => {
        const { api, calls } = fakeApi(true);
        const store = new DiskStore(api);
        expect(store.Kind).toBe("disk");
        await store.List();
        const source = await store.Read("g", "x");
        expect(source.images).toHaveLength(1);
        expect(source.images[0].width).toBe(2);
        expect(source.images[0].indexed.palette).toEqual(palette);
        await store.Save({ bundle: "g", name: "x", mode: "overwrite", frames: [] });
        expect(calls).toEqual(["list", "read", "save x"]);
    });

    it("picks the disk when the service answers, and downloads when it doesn't", async () => {
        const hosted: HostedSprites = { Bundles: () => [], Read: async () => ({ sheet: null, images: [] }) };
        expect((await ChooseStore(fakeApi(true).api, hosted, () => undefined)).Kind).toBe("disk");
        expect((await ChooseStore(fakeApi(false).api, hosted, () => undefined)).Kind).toBe("download");
    });
});
