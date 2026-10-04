import { EventEmitter } from "eventemitter3";
import { describe, expect, it, vi } from "vitest";
import AssetMetadataStore from "./AssetMetadata";
import { BindAssetMetadata } from "./AssetMetadataBinding";
import LevelAssets from "./LevelAssets";
import { AssetsDestroyedError } from "@logic-incubator/lib/assets/AssetErrors";

/** Just enough of `Assets`: bundles with data files, loaded or not, and the events it emits. */
class FakeAssets extends EventEmitter {
    scope: string[] = ["global"];
    loaded = new Set<string>();
    data: { [id: string]: object } = {};
    reloads: string[] = [];

    Has = (id: string) => id in this.data;
    IsLoaded = (id: string) => this.loaded.has(id);
    Data = (id: string) => this.data[id];
    get Scope() {
        return this.scope;
    }
    Stats() {
        const bundles: { [name: string]: { loaded: boolean } } = {};
        this.loaded.forEach(id => (bundles[id.slice(0, id.indexOf("."))] = { loaded: true }));
        return { bundles };
    }
    async Reload(id: string) {
        this.reloads.push(id);
        this.data[id] = { reloaded: { collidable: true } };
        this.emit("asset:reloaded", id);
    }
    complete(bundle: string, meta: object) {
        this.data[`${bundle}.assets_meta`] = meta;
        this.loaded.add(`${bundle}.assets_meta`);
        this.emit("bundle:complete", bundle);
    }
}

const bind = (assets: FakeAssets, store = new AssetMetadataStore()) => ({ store, binding: BindAssetMetadata(assets as never, store) });

describe("BindAssetMetadata", () => {
    it("takes in the metadata of bundles that were already loaded", () => {
        const assets = new FakeAssets();
        assets.data["global.assets_meta"] = { wall: { collidable: true } };
        assets.loaded.add("global.assets_meta");
        const { store } = bind(assets);
        expect(store.Get("wall")).toEqual({ collidable: true });
    });

    it("adds a bundle's metadata as it loads and takes it out as it unloads, following the asset scope", () => {
        const assets = new FakeAssets();
        const { store } = bind(assets);
        assets.complete("global", { wall: { collidable: true } });
        assets.complete("level1", { lava: { collidable: false } });
        expect(store.Get("lava")).toBeUndefined(); // not in scope yet
        assets.scope = ["level1", "global"];
        assets.emit("scope:changed", assets.scope);
        expect(store.Get("lava")).toEqual({ collidable: false });
        assets.emit("bundle:unloaded", "level1");
        expect(store.Get("lava")).toBeUndefined();
        expect(store.Get("wall")).toEqual({ collidable: true });
    });

    it("ignores a bundle with no assets_meta", () => {
        const assets = new FakeAssets();
        const { store } = bind(assets);
        assets.emit("bundle:complete", "level9");
        expect(store.Get("anything")).toBeUndefined();
    });

    it("refreshes what's bound, so an edited file shows up", async () => {
        const assets = new FakeAssets();
        const { store, binding } = bind(assets);
        assets.complete("global", { wall: {} });
        await binding.Refresh();
        expect(assets.reloads).toEqual(["global.assets_meta"]);
        expect(store.Get("reloaded")).toEqual({ collidable: true });
    });

    it("stops following and takes its metadata back out when disposed", () => {
        const assets = new FakeAssets();
        const { store, binding } = bind(assets);
        assets.complete("global", { wall: { collidable: true } });
        binding.Dispose();
        expect(store.Get("wall")).toBeUndefined();
        assets.complete("global", { wall: { collidable: true } });
        expect(store.Get("wall")).toBeUndefined();
        expect(assets.listenerCount("bundle:complete")).toBe(0);
    });
});

describe("AssetMetadataStore scope", () => {
    it("looks a name up in the level's bundle before global's", () => {
        const store = new AssetMetadataStore();
        store.Add("global", { torch: { collidable: false }, wall: { collidable: true } });
        store.Add("level1", { torch: { collidable: true } });
        store.SetScope(["level1", "global"]);
        expect(store.Get("torch")).toEqual({ collidable: true });
        expect(store.Get("wall")).toEqual({ collidable: true });
        store.SetScope(["global"]);
        expect(store.Get("torch")).toEqual({ collidable: false });
    });

    it("finds a door's partner in the bundle that defines the door first, then the rest of the scope", () => {
        const store = new AssetMetadataStore();
        store.Add("global", { wood_closed: { door: { id: 1, open: false } }, wood_open: { door: { id: 1, open: true } } });
        store.Add("level1", { iron_closed: { door: { id: 1, open: false } }, iron_open: { door: { id: 1, open: true } } });
        store.SetScope(["level1", "global"]);
        expect(store.GetDoorPartner("iron_closed")).toBe("iron_open");
        expect(store.GetDoorPartner("wood_closed")).toBe("wood_open");
    });

    it("keeps a bundle out of reach until it's in scope, and Load stays as the unscoped fallback", () => {
        const store = new AssetMetadataStore();
        store.Add("level1", { lava: {} });
        store.Load({ wall: { collidable: true } });
        expect(store.Get("lava")).toBeUndefined();
        expect(store.Get("wall")).toEqual({ collidable: true });
    });
});

describe("LevelAssets.Prepare", () => {
    const host = (over: object = {}) => ({ IsReady: true, IsDev: false, UseLevelBundle: vi.fn(async () => undefined), ...over });
    const metadata = () => ({ Refresh: vi.fn(async () => undefined) });

    it("swaps the level's bundle in and says go", async () => {
        const assets = host();
        expect(await new LevelAssets(assets, metadata()).Prepare("level1")).toBe(true);
        expect(assets.UseLevelBundle).toHaveBeenCalledWith("level1");
    });

    it("lets go of the level bundle when the level has none", async () => {
        const assets = host();
        await new LevelAssets(assets, metadata()).Prepare(undefined);
        expect(assets.UseLevelBundle).toHaveBeenCalledWith();
    });

    it("refreshes hand-edited metadata first - before the swap - in a dev build only", async () => {
        const order: string[] = [];
        const assets = host({ IsDev: true, UseLevelBundle: vi.fn(async () => void order.push("swap")) });
        const meta = { Refresh: vi.fn(async () => void order.push("refresh")) };
        await new LevelAssets(assets, meta).Prepare("level1");
        expect(order).toEqual(["refresh", "swap"]);
        const prod = host();
        const prodMeta = metadata();
        await new LevelAssets(prod, prodMeta).Prepare("level1");
        expect(prodMeta.Refresh).not.toHaveBeenCalled();
    });

    it("carries on if the dev refresh fails", async () => {
        const assets = host({ IsDev: true });
        const meta = { Refresh: vi.fn(async () => Promise.reject(new Error("offline"))) };
        expect(await new LevelAssets(assets, meta).Prepare("level1")).toBe(true);
    });

    it("says no, quietly, when the game was destroyed meanwhile, and loudly when the bundle won't load", async () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
        expect(await new LevelAssets(host({ UseLevelBundle: vi.fn(async () => Promise.reject(new AssetsDestroyedError())) }), metadata()).Prepare("level1")).toBe(false);
        expect(error).not.toHaveBeenCalled();
        expect(await new LevelAssets(host({ UseLevelBundle: vi.fn(async () => Promise.reject(new Error("404"))) }), metadata()).Prepare("level1")).toBe(false);
        expect(error).toHaveBeenCalledWith(expect.stringContaining("404"));
        error.mockRestore();
    });

    it("goes ahead when the game has no asset bundles at all", async () => {
        const assets = host({ IsReady: false });
        expect(await new LevelAssets(assets, metadata()).Prepare("level1")).toBe(true);
        expect(assets.UseLevelBundle).not.toHaveBeenCalled();
    });
});
