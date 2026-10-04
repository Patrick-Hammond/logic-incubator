import { beforeEach, describe, expect, it, vi } from "vitest";
import { AssetLoadError, AssetsDestroyedError } from "./AssetErrors";
import { LoadItem } from "./IBundleLoader";
import PixiBundleLoader from "./PixiBundleLoader";

type Resource = { name: string; url: string; data?: unknown; texture?: unknown; spritesheet?: unknown; bitmapFont?: unknown; parentResource?: Resource; error?: unknown };
type Added = { name: string; url: string; options: any };

const pixi = vi.hoisted(() => ({
    loaders: [] as any[],
    /** Decides each resource a loader makes: return `{ error }` to fail it. Receives the loader's attempt number (0-based). */
    script: null as null | ((added: any, attempt: number) => any),
    fonts: {} as { [face: string]: unknown },
}));

vi.mock("pixi.js", () => {
    const signal = () => {
        const handlers: ((...args: any[]) => void)[] = [];
        return { add: (fn: (...args: any[]) => void) => handlers.push(fn), dispatch: (...args: any[]) => handlers.forEach(h => h(...args)) };
    };
    class Loader {
        defaultQueryString = "";
        resources: { [name: string]: unknown } = {};
        onError = signal();
        onLoad = signal();
        destroyed = false;
        queue: Added[] = [];
        attempt: number;
        constructor(public baseUrl: string) {
            this.attempt = pixi.loaders.length;
            pixi.loaders.push(this);
        }
        add(name: string, url: string, options: unknown) {
            this.queue.push({ name, url, options });
            return this;
        }
        load(done: () => void) {
            Promise.resolve().then(() => {
                this.queue.forEach(added => {
                    const made = pixi.script(added, this.attempt) as { error?: string; resources: Resource[] };
                    made.resources.forEach(r => (this.resources[r.name] = r));
                    if (made.error) {
                        this.onError.dispatch(new Error(made.error), this, made.resources[made.resources.length - 1]);
                        made.resources[0].error = made.error;
                    } else {
                        this.onLoad.dispatch(this, made.resources[0]);
                    }
                });
                done();
            });
        }
        destroy() {
            this.destroyed = true;
        }
    }
    return {
        Loader,
        LoaderResource: { LOAD_TYPE: { XHR: 1 }, XHR_RESPONSE_TYPE: { BUFFER: "arraybuffer" } },
        SCALE_MODES: { NEAREST: 0, LINEAR: 1 },
        BitmapText: { fonts: pixi.fonts },
    };
});

const destroy = () => vi.fn();
const order: string[] = [];
const tracked = (label: string) => vi.fn(() => order.push(label));

beforeEach(() => {
    pixi.loaders.length = 0;
    Object.keys(pixi.fonts).forEach(face => delete pixi.fonts[face]);
    order.length = 0;
    pixi.script = added => {
        switch (added.options && added.options.loadType ? "binary" : added.name) {
            case "binary":
                return { resources: [{ name: added.name, url: added.url, data: new ArrayBuffer(4) }] };
        }
        if (added.name.startsWith("~atlas")) {
            const atlas: Resource = { name: added.name, url: added.url, spritesheet: { destroy: tracked("spritesheet") } };
            const page: Resource = { name: added.name + "_image", url: added.url + ".png", parentResource: atlas, texture: { destroy: tracked("page") } };
            return { resources: [atlas, page] };
        }
        if (added.name.endsWith("font")) {
            pixi.fonts["face-" + added.name] = {};
            const font: Resource = { name: added.name, url: added.url, bitmapFont: { font: "face-" + added.name, chars: { a: { texture: { destroy: tracked("glyph") } } } } };
            const page: Resource = { name: added.name + "_page", url: added.url + ".png", parentResource: font, texture: { destroy: tracked("fontpage") } };
            return { resources: [font, page] };
        }
        if (added.name.endsWith("image")) {
            return { resources: [{ name: added.name, url: added.url, texture: { image: added.name, destroy: tracked("image") } }] };
        }
        return { resources: [{ name: added.name, url: added.url, data: { json: added.name } }] };
    };
    void destroy;
});

const atlas: LoadItem = { type: "atlas", key: "~atlas.global.dungeon.0", url: "global/atlases/dungeon_0.json", bytes: 40, scaleMode: "nearest" };
const image: LoadItem = { type: "image", key: "global.title_image", url: "global/images/title.png", bytes: 10 };
const data: LoadItem = { type: "data", key: "global.meta", url: "global/data/meta.json", bytes: 5 };
const binary: LoadItem = { type: "binary", key: "global.fire", url: "global/binary/fire.gif", bytes: 5 };
const font: LoadItem = { type: "font", key: "global.numbers_font", url: "global/fonts/numbers.fnt", bytes: 5 };
const options = (extra = {}) => ({ baseUrl: "assets/", query: "v=abc", retries: 2, ...extra });

describe("PixiBundleLoader", () => {
    it("loads items with a fresh loader that carries the bundle's version and the right options per kind", async () => {
        const result = await new PixiBundleLoader().Load([atlas, image, data, binary, font], options()).promise;
        expect(pixi.loaders).toHaveLength(1);
        const loader = pixi.loaders[0];
        expect(loader.baseUrl).toBe("assets/");
        expect(loader.defaultQueryString).toBe("v=abc");
        const added = (name: string) => loader.queue.find((q: Added) => q.name === name);
        expect(added(atlas.key).options.metadata).toEqual({ imageMetadata: { scaleMode: 0 } });
        expect(added(binary.key).options).toEqual({ loadType: 1, xhrType: "arraybuffer" });
        expect(Object.keys(result.values).sort()).toEqual(["global.fire", "global.meta", "global.numbers_font", "global.title_image"]);
        expect((result.values["global.title_image"] as { image: string }).image).toBe("global.title_image");
        expect(result.values["global.meta"]).toEqual({ json: "global.meta" });
        expect(result.values["global.fire"]).toBeInstanceOf(ArrayBuffer);
        expect(result.values["global.numbers_font"]).toBe(true);
    });

    it("lets go of the pixi loader straight away, so it doesn't keep sound and gif buffers alive", async () => {
        await new PixiBundleLoader().Load([data], options()).promise;
        expect(pixi.loaders[0].destroyed).toBe(true);
    });

    it("reports each top-level item once as it finishes, never a child resource", async () => {
        const done: string[] = [];
        await new PixiBundleLoader().Load([atlas, data], options({ onItem: (item: LoadItem) => done.push(item.key) })).promise;
        expect(done.sort()).toEqual(["global.meta", atlas.key]);
    });

    it("tries a failed item again with a fresh loader, only that item", async () => {
        const base = pixi.script;
        pixi.script = (added, attempt) => (added.name === "global.meta" && attempt === 0 ? { error: "503", resources: [{ name: added.name, url: added.url }] } : base(added, attempt));
        vi.useFakeTimers();
        const handle = new PixiBundleLoader().Load([data, image], options());
        await vi.runAllTimersAsync();
        const result = await handle.promise;
        vi.useRealTimers();
        expect(pixi.loaders).toHaveLength(2);
        expect(pixi.loaders[1].queue.map((q: Added) => q.name)).toEqual(["global.meta"]);
        expect(Object.keys(result.values).sort()).toEqual(["global.meta", "global.title_image"]);
    });

    it("gives up after its retries with every failure, having freed what the failed items made", async () => {
        pixi.script = added => ({ error: "404", resources: [{ name: added.name, url: added.url, texture: { destroy: tracked("leftover") } }] });
        vi.useFakeTimers();
        const handle = new PixiBundleLoader().Load([image, data], options({ retries: 1 }));
        const outcome = handle.promise.catch(e => e);
        await vi.runAllTimersAsync();
        const error = await outcome;
        vi.useRealTimers();
        expect(error).toBeInstanceOf(AssetLoadError);
        expect(error.failures.map((f: { id: string }) => f.id).sort()).toEqual(["global.meta", "global.title_image"]);
        expect(error.failures[0].message).toBe("404");
        expect(pixi.loaders).toHaveLength(2); // the first try and one retry
        expect(order.filter(o => o === "leftover").length).toBeGreaterThan(0);
    });

    it("charges a failed child resource (an atlas's page image) to the atlas", async () => {
        pixi.script = added => {
            const atlasResource: Resource = { name: added.name, url: added.url };
            const page: Resource = { name: added.name + "_image", url: "page.png", parentResource: atlasResource };
            return { error: "page 404", resources: [atlasResource, page] };
        };
        vi.useFakeTimers();
        const outcome = new PixiBundleLoader().Load([atlas], options({ retries: 0 })).promise.catch(e => e);
        await vi.runAllTimersAsync();
        const error = await outcome;
        vi.useRealTimers();
        expect(error.failures).toEqual([{ id: atlas.key, url: "page.png", message: "page 404" }]);
    });

    it("frees what it made: frames before the page they came from, fonts' glyphs, and the font table entry", async () => {
        const result = await new PixiBundleLoader().Load([atlas, font, image], options()).promise;
        order.length = 0;
        result.Dispose(true);
        expect(order.indexOf("spritesheet")).toBeLessThan(order.indexOf("page"));
        expect(order).toEqual(expect.arrayContaining(["spritesheet", "page", "glyph", "fontpage", "image"]));
        expect(pixi.fonts["face-global.numbers_font"]).toBeUndefined();
    });

    it("leaves the textures alone when the whole cache is about to be destroyed, but still takes fonts out of the global table", async () => {
        const result = await new PixiBundleLoader().Load([atlas, font, image], options()).promise;
        order.length = 0;
        result.Dispose(false);
        expect(order).toEqual(["spritesheet"]);
        expect(pixi.fonts["face-global.numbers_font"]).toBeUndefined();
    });

    it("abandons a load on Cancel: destroys the loader, frees what it made, and rejects", async () => {
        const handle = new PixiBundleLoader().Load([data], options());
        const outcome = handle.promise.catch(e => e);
        handle.Cancel();
        expect(await outcome).toBeInstanceOf(AssetsDestroyedError);
        expect(pixi.loaders[0].destroyed).toBe(true);
        handle.Cancel(); // safe twice
    });
});
