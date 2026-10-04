import { describe, expect, it, vi } from "vitest";
import AssetMetadataStore, { AssetCategories, DefaultAssetCategory, IsAssetCategory } from "./AssetMetadata";

describe("AssetMetadataStore", () => {
    it("returns undefined for an asset with no metadata loaded", () => {
        const store = new AssetMetadataStore();
        expect(store.Get("wall_mid")).toBeUndefined();
    });

    it("returns the loaded metadata for a matching asset name", () => {
        const store = new AssetMetadataStore();
        store.Load({ wall_mid: { collidable: true } });
        expect(store.Get("wall_mid")).toEqual({ collidable: true });
        expect(store.Get("floor_1")).toBeUndefined();
    });

    it("replaces previously loaded metadata wholesale", () => {
        const store = new AssetMetadataStore();
        store.Load({ wall_mid: { collidable: true } });
        store.Load({ doors_leaf_closed: { door: { id: 1, open: false } } });
        expect(store.Get("wall_mid")).toBeUndefined();
        expect(store.Get("doors_leaf_closed")).toEqual({ door: { id: 1, open: false } });
    });
});

describe("AssetMetadataStore.GetDoorPartner", () => {
    it("finds the open sprite from the closed one, and vice versa", () => {
        const store = new AssetMetadataStore();
        store.Load({
            doors_leaf_closed: { door: { id: 1, open: false } },
            doors_leaf_open: { door: { id: 1, open: true } }
        });
        expect(store.GetDoorPartner("doors_leaf_closed")).toBe("doors_leaf_open");
        expect(store.GetDoorPartner("doors_leaf_open")).toBe("doors_leaf_closed");
    });

    it("doesn't cross-match different door ids", () => {
        const store = new AssetMetadataStore();
        store.Load({
            wood_closed: { door: { id: 1, open: false } },
            wood_open: { door: { id: 1, open: true } },
            iron_closed: { door: { id: 2, open: false } },
            iron_open: { door: { id: 2, open: true } }
        });
        expect(store.GetDoorPartner("wood_closed")).toBe("wood_open");
        expect(store.GetDoorPartner("iron_closed")).toBe("iron_open");
    });

    it("returns undefined for a non-door asset or an unmatched door id", () => {
        const store = new AssetMetadataStore();
        store.Load({
            floor_1: { collidable: false },
            lonely_door: { door: { id: 9, open: false } }
        });
        expect(store.GetDoorPartner("floor_1")).toBeUndefined();
        expect(store.GetDoorPartner("lonely_door")).toBeUndefined();
        expect(store.GetDoorPartner("unknown_asset")).toBeUndefined();
    });
});

describe("AssetMetadataStore.Load light validation", () => {
    it("drops a light value that's missing a field, warning with the asset name", () => {
        const store = new AssetMetadataStore();
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

        // exactly the real bug this caught: brightness/range present, tint missing
        store.Load({ flame_1_anim: { light: { brightness: 10, range: 10 } as never } });

        expect(store.Get("flame_1_anim").light).toBeUndefined();
        expect(warn).toHaveBeenCalledWith(expect.stringContaining("flame_1_anim"), expect.anything());
        warn.mockRestore();
    });

    it("keeps a fully-specified light value untouched", () => {
        const store = new AssetMetadataStore();
        const value = { brightness: 0.5, tint: 0xff8100, range: 5 };
        store.Load({ torch_1_anim: { light: value } });
        expect(store.Get("torch_1_anim").light).toEqual(value);
    });

    it("keeps collidable/door on the same entry when only its light is malformed", () => {
        const store = new AssetMetadataStore();
        vi.spyOn(console, "warn").mockImplementation(() => {});
        store.Load({ weird_wall: { collidable: true, light: { brightness: 1 } as never } });
        expect(store.Get("weird_wall")).toEqual({ collidable: true, light: undefined });
        vi.restoreAllMocks();
    });
});

describe("asset categories", () => {
    it("lists the palette's tabs in order, with Misc as the default", () => {
        expect(AssetCategories.map(category => category.id)).toEqual(["dungeon", "entities", "weapons", "items", "misc", "user"]);
        expect(DefaultAssetCategory).toBe("misc");
    });

    it("recognises exactly those ids", () => {
        AssetCategories.forEach(category => expect(IsAssetCategory(category.id)).toBe(true));
        expect(IsAssetCategory("Dungeon")).toBe(false);
        expect(IsAssetCategory("")).toBe(false);
        expect(IsAssetCategory(undefined)).toBe(false);
    });

    it("gives an asset the category its metadata names", () => {
        const store = new AssetMetadataStore();
        store.Load({ wall_mid: { category: "dungeon", collidable: true }, bow: { category: "weapons" } });
        expect(store.CategoryOf("wall_mid")).toBe("dungeon");
        expect(store.CategoryOf("bow")).toBe("weapons");
        expect(store.Get("wall_mid")).toEqual({ category: "dungeon", collidable: true });
    });

    it("files an asset with no metadata, or no category, under Misc", () => {
        const store = new AssetMetadataStore();
        store.Load({ plain: {}, solid: { collidable: true } });
        expect(store.CategoryOf("plain")).toBe("misc");
        expect(store.CategoryOf("solid")).toBe("misc");
        expect(store.CategoryOf("not_in_the_file")).toBe("misc");
    });

    it("drops an unknown category with a warning naming the asset, keeping the rest of the entry", () => {
        const store = new AssetMetadataStore();
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        store.Load({ torch: { category: "Dungeon" as never, collidable: true } });
        expect(store.CategoryOf("torch")).toBe("misc");
        expect(store.Get("torch").collidable).toBe(true);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('"torch"'));
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('"Dungeon"'));
        warn.mockRestore();
    });

    it("looks a category up through the scope, the level's bundle first", () => {
        const store = new AssetMetadataStore();
        store.Add("global", { torch: { category: "dungeon" } });
        store.Add("level1", { torch: { category: "misc" } });
        store.SetScope(["level1", "global"]);
        expect(store.CategoryOf("torch")).toBe("misc");
        store.SetScope(["global"]);
        expect(store.CategoryOf("torch")).toBe("dungeon");
    });
});
