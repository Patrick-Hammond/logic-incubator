import { beforeEach, describe, expect, it, vi } from "vitest";
import Assets, { BundleProgress } from "./Assets";
import { AssetLoadError, AssetsDestroyedError } from "./AssetErrors";
import { Manifest } from "./AssetManifest";
import { IBundleLoader, ISoundAdapter, LoadItem, LoadResult } from "./IBundleLoader";

const factory = vi.hoisted(() => ({
    SetScope: vi.fn(),
    AddBundleAsset: vi.fn(),
    RemoveBundle: vi.fn(),
    CreateTexture: vi.fn((id: string) => ({ frame: id })),
    CreateAnimatedSprite: vi.fn((id: string) => ({ anim: id })),
}));
vi.mock("../loading/AssetFactory", () => ({ default: { inst: factory } }));
vi.mock("pixi.js", () => ({
    Sprite: class {
        constructor(public texture: unknown) {}
    },
}));

const manifest: Manifest = {
    version: 1,
    dev: true,
    bundles: {
        global: {
            dependsOn: [], preload: "boot", hash: "g1", bytes: 100,
            atlases: [{ name: "~atlas.global.dungeon.0", json: "global/atlases/dungeon_0.json", bytes: 40 }],
            assets: {
                "global.crate": { kind: "sprite", frames: ["global.crate"] },
                "global.bomb": { kind: "animation", frames: ["global.bomb_f0", "global.bomb_f1"] },
                "global.title": { kind: "image", url: "global/images/title.png", bytes: 10, tier: "boot" },
                "global.meta": { kind: "data", url: "global/data/meta.json", bytes: 5, tier: "boot" },
                "global.fire": { kind: "binary", url: "global/binary/fire.gif", bytes: 5, tier: "boot" },
                "global.numbers": { kind: "font", url: "global/fonts/numbers.fnt", face: "numbers-export", bytes: 5, tier: "boot" },
                "global.click": { kind: "sound", urls: ["global/sounds/click.ogg", "global/sounds/click.m4a"], bytes: 20, tier: "boot" },
                "global.theme": { kind: "sound", urls: ["global/sounds/theme.ogg"], bytes: 30, tier: "background" },
            },
        },
        level1: {
            dependsOn: ["global"], preload: "manual", hash: "l1", bytes: 50, atlases: [],
            assets: {
                "level1.level": { kind: "data", url: "level1/data/level.json", bytes: 5, tier: "boot" },
                "level1.music": { kind: "sound", urls: ["level1/sounds/music.ogg"], bytes: 40, tier: "lazy" },
            },
        },
        level2: {
            dependsOn: ["global"], preload: "manual", hash: "l2", bytes: 5, atlases: [],
            assets: { "level2.level": { kind: "data", url: "level2/data/level.json", bytes: 5, tier: "boot" } },
        },
    },
};

/** A loader that finishes a load once `gate` (if any) resolves, recording what it was asked for. */
class FakeLoader implements IBundleLoader {
    calls: LoadItem[][] = [];
    options: { baseUrl: string; query: string }[] = [];
    failing = new Set<string>();
    gate: Promise<void> | undefined;
    disposed: boolean[] = [];
    cancelled = 0;

    Load(items: LoadItem[], options: { baseUrl: string; query: string; onItem?(item: LoadItem): void }) {
        this.calls.push(items);
        this.options.push({ baseUrl: options.baseUrl, query: options.query });
        let rejectLoad: (error: Error) => void;
        let done = false;
        const promise = new Promise<LoadResult>((resolve, reject) => {
            rejectLoad = reject;
            Promise.resolve(this.gate).then(() => {
                if (done) {
                    return;
                }
                const bad = items.filter(item => this.failing.has(item.key));
                if (bad.length) {
                    reject(new AssetLoadError("", bad.map(item => ({ id: item.key, url: item.url, message: "404" }))));
                    return;
                }
                const values: { [key: string]: unknown } = {};
                items.forEach(item => {
                    if (item.type === "image") {
                        values[item.key] = { texture: item.key };
                    } else if (item.type === "data") {
                        values[item.key] = { data: item.key };
                    } else if (item.type === "binary") {
                        values[item.key] = new ArrayBuffer(1);
                    } else if (item.type === "font") {
                        values[item.key] = true;
                    }
                    options.onItem?.(item);
                });
                resolve({ values, Dispose: destroyTextures => this.disposed.push(destroyTextures) });
            });
        });
        return {
            promise,
            Cancel: () => {
                done = true;
                this.cancelled++;
                rejectLoad(new AssetsDestroyedError());
            },
        };
    }
}

class FakeSound implements ISoundAdapter {
    aliases = new Set<string>();
    played: { alias: string; options?: unknown }[] = [];
    stopped: string[] = [];
    removed: string[] = [];
    unsupported = new Set<string>();
    Pick(urls: string[]) {
        return urls.find(url => !this.unsupported.has(url.slice(url.lastIndexOf(".") + 1)));
    }
    async Load(alias: string, _url: string) {
        this.aliases.add(alias);
    }
    Has(alias: string) {
        return this.aliases.has(alias);
    }
    Remove(alias: string) {
        this.removed.push(alias);
        this.aliases.delete(alias);
    }
    Play(alias: string, options?: unknown) {
        this.played.push({ alias, options });
    }
    Stop(alias: string) {
        this.stopped.push(alias);
    }
}

let loader: FakeLoader;
let sound: FakeSound;
let assets: Assets;
let scheduled: (() => void)[];

/** Lets promises settle, then runs the frame-end callbacks (unloads) that were scheduled. */
async function nextFrame(): Promise<void> {
    await settle();
    const run = scheduled.splice(0);
    run.forEach(fn => fn());
    await settle();
}
async function settle(): Promise<void> {
    for (let i = 0; i < 20; i++) {
        await Promise.resolve();
    }
}

beforeEach(() => {
    Object.values(factory).forEach(fn => (fn as ReturnType<typeof vi.fn>).mockClear());
    loader = new FakeLoader();
    sound = new FakeSound();
    scheduled = [];
    assets = new Assets({
        loader,
        schedule: fn => {
            scheduled.push(fn);
            return () => {
                const at = scheduled.indexOf(fn);
                if (at >= 0) {
                    scheduled.splice(at, 1);
                }
            };
        },
    });
    assets.InitWithManifest(manifest, "assets/", { sound });
});

describe("Assets.Acquire", () => {
    it("loads a bundle's atlases and boot-tier assets in one job, versioned by the bundle's hash", async () => {
        await assets.Acquire("global");
        expect(loader.calls).toHaveLength(1);
        expect(loader.calls[0].map(item => item.key).sort()).toEqual(["global.fire", "global.meta", "global.numbers", "global.title", "~atlas.global.dungeon.0"]);
        expect(loader.options[0]).toEqual({ baseUrl: "assets/", query: "v=g1" });
        expect(factory.AddBundleAsset).toHaveBeenCalledWith("global", "global.crate", ["global.crate"]);
        expect(factory.AddBundleAsset).toHaveBeenCalledWith("global", "global.bomb", ["global.bomb_f0", "global.bomb_f1"]);
        expect(assets.IsBundleLoaded("global")).toBe(true);
    });

    it("loads boot sounds with the bundle and background ones right after, without making Acquire wait", async () => {
        await assets.Acquire("global");
        expect(sound.aliases.has("global.click")).toBe(true);
        await settle();
        expect(sound.aliases.has("global.theme")).toBe(true);
        expect(assets.IsLoaded("global.theme")).toBe(true);
    });

    it("loads a bundle once however many ask, counting each holder", async () => {
        const [a, b] = await Promise.all([assets.Acquire("global"), assets.Acquire("global")]);
        expect(loader.calls).toHaveLength(1);
        expect(assets.Stats().bundles.global.refs).toBe(2);
        a.Release();
        a.Release(); // a second release of the same handle is nothing
        b.Release();
        expect(assets.Stats().bundles.global.refs).toBe(0);
    });

    it("reports byte-weighted progress that only goes up and ends complete", async () => {
        const seen: BundleProgress[] = [];
        await assets.Acquire("global", p => seen.push(p));
        expect(seen.length).toBeGreaterThan(1);
        seen.forEach((p, i) => i && expect(p.loaded).toBeGreaterThanOrEqual(seen[i - 1].loaded));
        expect(seen[seen.length - 1].loaded).toBe(seen[seen.length - 1].total);
        expect(seen[0].total).toBe(40 + 10 + 5 + 5 + 5 + 20);
    });

    it("emits start, progress and complete events", async () => {
        const events: string[] = [];
        assets.on("bundle:start", (name: string) => events.push("start " + name));
        assets.on("bundle:complete", (name: string) => events.push("complete " + name));
        await assets.Acquire("global");
        expect(events).toEqual(["start global", "complete global"]);
    });

    it("loads what a bundle depends on first, and holds it", async () => {
        const handle = await assets.Acquire("level1");
        expect(assets.IsBundleLoaded("global")).toBe(true);
        expect(assets.Stats().bundles.global.refs).toBe(1);
        expect(assets.Stats().bundles.level1.refs).toBe(1);
        handle.Release();
        await nextFrame();
        expect(assets.IsBundleLoaded("level1")).toBe(false);
        await nextFrame(); // what it depended on goes a frame after it does
        expect(assets.IsBundleLoaded("global")).toBe(false); // nothing held it any more
    });

    it("fails with every asset that couldn't load, reports it, and loads afresh next time", async () => {
        loader.failing.add("global.meta");
        loader.failing.add("global.title");
        const events: unknown[] = [];
        assets.on("bundle:error", (name: string, error: unknown) => events.push([name, error]));
        const error = await assets.Acquire("global").catch(e => e);
        expect(error).toBeInstanceOf(AssetLoadError);
        expect(error.bundle).toBe("global");
        expect(error.failures.map((f: { id: string }) => f.id).sort()).toEqual(["global.meta", "global.title"]);
        expect(events).toHaveLength(1);
        expect(assets.IsBundleLoaded("global")).toBe(false);
        expect(assets.Stats().bundles.global).toBeUndefined();

        loader.failing.clear();
        await assets.Acquire("global");
        expect(assets.IsBundleLoaded("global")).toBe(true);
    });

    it("says what it probably meant for a bundle that doesn't exist", async () => {
        await expect(assets.Acquire("globl")).rejects.toThrow('did you mean "global"');
    });
});

describe("unloading", () => {
    it("waits for the frame to be drawn, then frees the bundle", async () => {
        const handle = await assets.Acquire("level1");
        const unloaded: string[] = [];
        assets.on("bundle:unloaded", (name: string) => unloaded.push(name));
        handle.Release();
        await settle();
        expect(assets.IsBundleLoaded("level1")).toBe(true); // still there until the frame has rendered
        expect(factory.RemoveBundle).not.toHaveBeenCalled();
        await nextFrame();
        expect(assets.IsBundleLoaded("level1")).toBe(false);
        expect(factory.RemoveBundle).toHaveBeenCalledWith("level1");
        expect(unloaded).toEqual(["level1"]);
        expect(loader.disposed).toContain(true);
    });

    it("frees a sound with its bundle", async () => {
        const handle = await assets.Acquire("level1");
        await assets.Load("level1.music");
        expect(sound.aliases.has("level1.music")).toBe(true);
        handle.Release();
        await nextFrame();
        expect(sound.aliases.has("level1.music")).toBe(false);
    });

    it("keeps a bundle someone took again before the frame ended", async () => {
        const handle = await assets.Acquire("level1");
        handle.Release();
        await settle();
        const again = await assets.Acquire("level1");
        await nextFrame();
        expect(assets.IsBundleLoaded("level1")).toBe(true);
        expect(loader.calls.filter(items => items.some(i => i.key === "level1.level"))).toHaveLength(1);
        again.Release();
    });

    it("never unloads a bundle loaded with LoadBundle", async () => {
        await assets.LoadBundle("global");
        const handle = await assets.Acquire("global");
        handle.Release();
        await nextFrame();
        expect(assets.IsBundleLoaded("global")).toBe(true);
    });
});

describe("Assets.UseLevelBundle", () => {
    beforeEach(async () => {
        await assets.LoadBundle("global");
    });

    it("loads the level's bundle, scopes bare names to it, and keeps global last", async () => {
        await assets.UseLevelBundle("level1");
        expect(assets.Scope).toEqual(["level1", "global"]);
        expect(factory.SetScope).toHaveBeenLastCalledWith(["level1", "global"]);
        expect(assets.IsBundleLoaded("level1")).toBe(true);
    });

    it("swaps levels by taking the new one before letting go of the old", async () => {
        await assets.UseLevelBundle("level1");
        await assets.UseLevelBundle("level2");
        expect(assets.IsBundleLoaded("level2")).toBe(true);
        expect(assets.IsBundleLoaded("level1")).toBe(true); // released, waiting out the frame
        await nextFrame();
        expect(assets.IsBundleLoaded("level1")).toBe(false);
        expect(assets.Scope).toEqual(["level2", "global"]);
    });

    it("costs nothing to start the same level again", async () => {
        await assets.UseLevelBundle("level1");
        const jobs = assets.Stats().loadJobs;
        await assets.UseLevelBundle("level1");
        await nextFrame();
        expect(assets.Stats().loadJobs).toBe(jobs);
        expect(assets.IsBundleLoaded("level1")).toBe(true);
    });

    it("lets go of the level with no names", async () => {
        await assets.UseLevelBundle("level1");
        await assets.UseLevelBundle();
        await nextFrame();
        expect(assets.IsBundleLoaded("level1")).toBe(false);
        expect(assets.Scope).toEqual(["global"]);
    });

    it("keeps the previous level if the next can't load", async () => {
        await assets.UseLevelBundle("level1");
        loader.failing.add("level2.level");
        await expect(assets.UseLevelBundle("level2")).rejects.toBeInstanceOf(AssetLoadError);
        await nextFrame();
        expect(assets.IsBundleLoaded("level1")).toBe(true);
        expect(assets.Scope).toEqual(["level1", "global"]);
    });
});

describe("accessors", () => {
    beforeEach(async () => {
        await assets.LoadBundle("global");
    });

    it("hands back what loaded, typed by kind", () => {
        expect(assets.Texture("global.title")).toEqual({ texture: "global.title" });
        expect(assets.Texture("global.crate")).toEqual({ frame: "global.crate" });
        expect(assets.Sprite("global.title").texture).toEqual({ texture: "global.title" });
        expect(assets.Animation("global.bomb")).toEqual({ anim: "global.bomb" });
        expect(assets.Data("global.meta")).toEqual({ data: "global.meta" });
        expect(assets.Binary("global.fire")).toBeInstanceOf(ArrayBuffer);
        expect(assets.FontName("global.numbers")).toBe("numbers-export");
    });

    it("rejects the wrong kind, saying what it is", () => {
        expect(() => assets.Data("global.title")).toThrow('"global.title" is a image, not a data');
        expect(() => assets.Animation("global.crate")).toThrow("is a sprite");
    });

    it("says what an unknown id probably meant, and that ids are qualified", () => {
        expect(() => assets.Texture("global.titel")).toThrow('did you mean "global.title"');
        expect(() => assets.Texture("title")).toThrow("<bundle>.<name>");
    });

    it("says when the bundle isn't loaded, or an asset hasn't loaded yet", async () => {
        expect(() => assets.Data("level1.level")).toThrow('bundle "level1", which isn\'t loaded');
        const gate = new Promise<void>(() => undefined);
        await assets.Acquire("level1");
        loader.gate = gate;
        expect(() => assets.Binary("global.fire")).not.toThrow();
    });

    it("knows what the manifest has, and where a file is served from", () => {
        expect(assets.Has("global.title")).toBe(true);
        expect(assets.Has("global.nope")).toBe(false);
        expect(assets.Has("title")).toBe(false);
        expect(assets.Url("global.title")).toBe("assets/global/images/title.png?v=g1");
        expect(assets.Url("global.click")).toBe("assets/global/sounds/click.ogg?v=g1");
        expect(() => assets.Url("global.crate")).toThrow("no file of its own");
    });

    it("serves the first sound format the browser supports", () => {
        sound.unsupported.add("ogg");
        expect(assets.Url("global.click")).toBe("assets/global/sounds/click.m4a?v=g1");
    });

    it("throws for asking before Init", () => {
        const fresh = new Assets({ loader });
        expect(() => fresh.Texture("global.title")).toThrow("haven't been initialised");
        expect(fresh.IsReady).toBe(false);
    });
});

describe("sounds", () => {
    beforeEach(async () => {
        await assets.LoadBundle("global");
        await assets.UseLevelBundle("level1");
    });

    it("plays a loaded sound straight away", async () => {
        await assets.PlaySound("global.click", { loop: true });
        expect(sound.played).toEqual([{ alias: "global.click", options: { loop: true } }]);
    });

    it("loads a lazy sound the first time it's played", async () => {
        expect(assets.IsLoaded("level1.music")).toBe(false);
        await assets.PlaySound("level1.music");
        expect(assets.IsLoaded("level1.music")).toBe(true);
        expect(sound.played.map(p => p.alias)).toEqual(["level1.music"]);
    });

    it("doesn't play a sound that was stopped while it was still loading", async () => {
        const slow = new Promise<void>(resolve => setTimeout(resolve, 5));
        sound.Load = async (alias: string) => {
            await slow;
            sound.aliases.add(alias);
        };
        const play = assets.PlaySound("level1.music");
        assets.StopSound("level1.music");
        await play;
        expect(sound.played).toEqual([]);
        expect(sound.stopped).toEqual(["level1.music"]);
    });

    it("says a sound needs an adapter when there isn't one", async () => {
        const bare = new Assets({ loader });
        bare.InitWithManifest(manifest, "assets/");
        await expect(bare.PlaySound("global.click")).rejects.toThrow("no sound adapter");
    });

    it("reports a sound that can't be loaded as a failed bundle", async () => {
        sound.Load = async () => {
            throw new Error("decode failed");
        };
        const error = await assets.Load("level1.music").catch(e => e);
        expect(error).toBeInstanceOf(AssetLoadError);
        expect(error.failures[0].message).toBe("decode failed");
    });
});

describe("Assets.Reload", () => {
    it("fetches a data file again, bypassing the cache, and swaps it in", async () => {
        const fetched: { url: string; init: unknown }[] = [];
        const reloading = new Assets({
            loader,
            fetch: (async (url: string, init: unknown) => {
                fetched.push({ url, init });
                return { ok: true, json: async () => ({ fresh: true }) };
            }) as unknown as typeof fetch,
        });
        reloading.InitWithManifest(manifest, "assets/", { sound });
        await reloading.LoadBundle("global");
        const reloaded: string[] = [];
        reloading.on("asset:reloaded", (id: string) => reloaded.push(id));
        await reloading.Reload("global.meta");
        expect(reloading.Data("global.meta")).toEqual({ fresh: true });
        expect(fetched[0].url).toMatch(/^assets\/global\/data\/meta\.json\?v=g1&r=\d+$/);
        expect(fetched[0].init).toEqual({ cache: "no-store" });
        expect(reloaded).toEqual(["global.meta"]);
    });

    it("only reloads data and binary files", async () => {
        await assets.LoadBundle("global");
        await expect(assets.Reload("global.title")).rejects.toThrow("only data and binary");
    });
});

describe("Assets.Destroy", () => {
    it("abandons a load in flight, rejecting its waiters instead of leaving them hanging", async () => {
        loader.gate = new Promise<void>(() => undefined);
        const pending = assets.Acquire("global").catch(e => e);
        await settle();
        assets.Destroy();
        expect(await pending).toBeInstanceOf(AssetsDestroyedError);
        expect(loader.cancelled).toBe(1);
    });

    it("removes the sounds it registered, but leaves textures to the cache destroy that follows", async () => {
        await assets.LoadBundle("global");
        await settle();
        loader.disposed.length = 0;
        assets.Destroy();
        expect(sound.removed).toEqual(expect.arrayContaining(["global.click", "global.theme"]));
        expect(loader.disposed).toEqual([false]);
    });

    it("drops unloads that were waiting for a frame", async () => {
        const handle = await assets.Acquire("level1");
        handle.Release();
        await settle();
        expect(scheduled).toHaveLength(1);
        assets.Destroy();
        expect(scheduled).toHaveLength(0);
        expect(factory.RemoveBundle).not.toHaveBeenCalled();
    });

    it("makes every later call fail the same way, and is safe to repeat", async () => {
        await assets.LoadBundle("global");
        assets.Destroy();
        assets.Destroy();
        expect(assets.IsDestroyed).toBe(true);
        await expect(assets.Acquire("global")).rejects.toBeInstanceOf(AssetsDestroyedError);
        expect(() => assets.Texture("global.title")).toThrow(AssetsDestroyedError);
        await expect(assets.UseLevelBundle("level1")).rejects.toBeInstanceOf(AssetsDestroyedError);
    });

    it("silences its listeners", async () => {
        const seen: string[] = [];
        assets.on("bundle:start", (name: string) => seen.push(name));
        assets.Destroy();
        assets.emit("bundle:start", "global");
        expect(seen).toEqual([]);
    });

    it("frees what a load that finishes after it made", async () => {
        let release!: () => void;
        loader.gate = new Promise<void>(resolve => (release = resolve));
        const pending = assets.Acquire("global").catch(e => e);
        await settle();
        assets.Destroy();
        release();
        expect(await pending).toBeInstanceOf(AssetsDestroyedError);
    });
});
