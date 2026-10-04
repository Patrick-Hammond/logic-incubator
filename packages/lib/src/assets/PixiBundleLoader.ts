import { BitmapText, Loader, LoaderResource, SCALE_MODES } from "pixi.js";
import { AssetLoadError, AssetsDestroyedError, LoadFailure } from "./AssetErrors";
import { IBundleLoader, LoadHandle, LoadItem, LoadOptions, LoadResult } from "./IBundleLoader";

/** Milliseconds before the first retry of a failed item; each further one waits longer, so a flaky connection gets room to recover. */
const RetryDelayMs = 250;

type Disposer = (destroyTextures: boolean) => void;

/**
 * Loads items with pixi's loader - the only file in lib (with `PixiSoundAdapter`) that does.
 *
 * Each attempt gets a **fresh `Loader`**: pixi 5's can't take new resources while it's running, and
 * one loader reused across bundles would make every load wait on the last. The bundle's hash goes
 * in as `defaultQueryString`, which pixi applies to the child requests it makes itself (a
 * spritesheet's image, a bitmap font's pages) - a `?v=` on the JSON's url alone would be dropped
 * when pixi resolves the image relative to it, leaving the PNG served stale.
 *
 * What a load made is recorded as it finishes (while the loader still knows which resource is whose),
 * so unloading a bundle later can free exactly its spritesheets, fonts and textures - and the loader
 * itself is destroyed straight away, as it would otherwise keep every sound and gif buffer alive.
 */
export default class PixiBundleLoader implements IBundleLoader {
    Load(items: LoadItem[], options: LoadOptions): LoadHandle {
        let cancelled = false;
        let current: Loader | undefined;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let reject: (error: Error) => void;
        const values: { [key: string]: unknown } = {};
        const disposers: Disposer[] = [];

        const promise = new Promise<LoadResult>((res, rej) => {
            reject = rej;
            const attempt = (pending: LoadItem[], number: number) => {
                const { failed, failures } = this.Run(pending, options, values, disposers, loader => (current = loader), () => cancelled);
                failed.then(retry => {
                    if (cancelled) {
                        return;
                    }
                    if (!retry.length) {
                        res({ values, Dispose: destroyTextures => disposers.forEach(d => d(destroyTextures)) });
                    } else if (number < options.retries) {
                        timer = setTimeout(() => attempt(retry, number + 1), RetryDelayMs * (number + 1));
                    } else {
                        disposers.forEach(d => d(true));
                        rej(new AssetLoadError("", retry.map(item => failures.get(item.key) || { id: item.key, url: item.url, message: "failed to load" })));
                    }
                });
            };
            attempt(items, 0);
        });

        return {
            promise,
            Cancel: () => {
                if (cancelled) {
                    return;
                }
                cancelled = true;
                if (timer !== undefined) {
                    clearTimeout(timer);
                }
                if (current) {
                    current.destroy();
                }
                disposers.forEach(d => d(true));
                reject(new AssetsDestroyedError());
            }
        };
    }

    /** One attempt at `items`. Resolves with the ones that failed (none, when all loaded), after recording what the others made. */
    private Run(
        items: LoadItem[],
        options: LoadOptions,
        values: { [key: string]: unknown },
        disposers: Disposer[],
        setCurrent: (loader: Loader) => void,
        isCancelled: () => boolean
    ): { failed: Promise<LoadItem[]>; failures: Map<string, LoadFailure> } {
        const loader = new Loader(options.baseUrl);
        setCurrent(loader);
        loader.defaultQueryString = options.query;
        const byKey = new Map<string, LoadItem>();
        const failures = new Map<string, LoadFailure>();

        items.forEach(item => {
            byKey.set(item.key, item);
            switch (item.type) {
                case "atlas": {
                    const metadata = item.scaleMode ? { imageMetadata: { scaleMode: item.scaleMode === "nearest" ? SCALE_MODES.NEAREST : SCALE_MODES.LINEAR } } : undefined;
                    loader.add(item.key, item.url, { metadata });
                    break;
                }
                case "binary":
                    // Raw bytes - for a gif, say, that a game turns into its own animation. pixi would otherwise read it as an image.
                    loader.add(item.key, item.url, { loadType: LoaderResource.LOAD_TYPE.XHR, xhrType: LoaderResource.XHR_RESPONSE_TYPE.BUFFER });
                    break;
                default:
                    loader.add(item.key, item.url);
            }
        });

        // A child resource (an atlas's image, a font's page) fails on behalf of the item that asked for it.
        const owner = (resource: any): any => (resource.parentResource ? owner(resource.parentResource) : resource);
        loader.onError.add((error: any, _loader: any, resource: any) => {
            const item = byKey.get(owner(resource).name);
            if (item && !failures.has(item.key)) {
                failures.set(item.key, { id: item.key, url: resource.url, message: (error && error.message) || String(error) });
            }
        });
        loader.onLoad.add((_loader: any, resource: any) => {
            const item = byKey.get(resource.name);
            if (item && !resource.error && options.onItem) {
                options.onItem(item);
            }
        });

        const failed = new Promise<LoadItem[]>(resolve => {
            loader.load(() => {
                if (isCancelled()) {
                    return;
                }
                // Record what each item made, grouped by the item that asked for it, so a failed item's
                // leftovers can be freed now while the others are kept.
                const groups = new Map<string, Disposer[]>();
                const group = (resource: any): Disposer[] => {
                    const key = owner(resource).name;
                    if (!groups.has(key)) {
                        groups.set(key, []);
                    }
                    return groups.get(key);
                };
                Object.keys(loader.resources).forEach(name => {
                    const resource: any = loader.resources[name];
                    // Frames first, then glyphs, then the page textures they were cut from.
                    if (resource.spritesheet) {
                        group(resource).unshift(() => resource.spritesheet.destroy(false));
                    }
                    if (resource.bitmapFont) {
                        group(resource).unshift(destroyTextures => {
                            const font = resource.bitmapFont;
                            // Not in pixi 5.2.1's typings, but it is the table `BitmapText` looks fonts up in.
                            delete (BitmapText as any).fonts[font.font];
                            if (destroyTextures) {
                                Object.keys(font.chars).forEach(c => font.chars[c].texture.destroy());
                            }
                        });
                    }
                    if (resource.texture) {
                        group(resource).push(destroyTextures => destroyTextures && resource.texture.destroy(true));
                    }
                });

                const retry: LoadItem[] = [];
                items.forEach(item => {
                    const made = groups.get(item.key) || [];
                    const resource: any = loader.resources[item.key];
                    if (failures.has(item.key) || !resource || resource.error) {
                        made.forEach(d => d(true));
                        retry.push(item);
                        return;
                    }
                    if (item.type === "image") {
                        values[item.key] = resource.texture;
                    } else if (item.type === "data" || item.type === "binary") {
                        values[item.key] = resource.data;
                    } else if (item.type === "font") {
                        values[item.key] = true;
                    }
                    disposers.push(...made);
                });
                // Safe on finished resources: it drops the loader's references (and their sound / gif buffers), not the textures.
                loader.destroy();
                resolve(retry);
            });
        });
        return { failed, failures };
    }
}
