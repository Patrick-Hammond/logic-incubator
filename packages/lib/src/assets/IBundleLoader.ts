/**
 * What `Assets` needs from the thing that actually fetches files, so the loading rules (ref counts,
 * dependencies, tiers, teardown order) test against a fake and only `PixiBundleLoader` and
 * `PixiSoundAdapter` touch pixi.
 */

/** One unit of loading: an atlas page set, or a single image, data file, binary or font. `key` is the atlas name or the asset id. */
export type LoadItem =
    | { type: "atlas"; key: string; url: string; bytes: number; scaleMode?: "nearest" | "linear" }
    | { type: "image" | "data" | "binary" | "font"; key: string; url: string; bytes: number };

export interface LoadResult {
    /** What was loaded, by item key: an image's Texture, a data file's parsed JSON, a binary's ArrayBuffer. */
    values: { [key: string]: unknown };
    /**
     * Frees everything the load made - spritesheets, bitmap fonts, textures. `destroyTextures: false`
     * leaves the textures themselves to the caller, for when the whole texture cache is about to be
     * destroyed anyway (see `Game.destroy`).
     */
    Dispose(destroyTextures: boolean): void;
}

export interface LoadOptions {
    /** Prefix for every url. */
    baseUrl: string;
    /** Appended to every request - the bundle's content hash, as `v=...`. */
    query: string;
    /** How many times a failed item is tried again. */
    retries: number;
    /** Called once as each item finishes, for byte-weighted progress. */
    onItem?(item: LoadItem): void;
}

export interface LoadHandle {
    /** Resolves when every item has loaded; rejects with an `AssetLoadError` listing those that didn't. */
    promise: Promise<LoadResult>;
    /** Abandons the load: the promise rejects with `AssetsDestroyedError` and nothing is left behind. */
    Cancel(): void;
}

export interface IBundleLoader {
    Load(items: LoadItem[], options: LoadOptions): LoadHandle;
}

export type SoundPlayOptions = { loop?: boolean; volume?: number };

/** The sound side: a global, process-wide library in practice (pixi-sound), so every method works by alias. */
export interface ISoundAdapter {
    /** The first of `urls` (one per encoding, most preferred first) this browser can play, or undefined if none. */
    Pick(urls: string[]): string | undefined;
    /** Registers `alias` and loads it from `url`. Resolves once it can play. */
    Load(alias: string, url: string): Promise<void>;
    Has(alias: string): boolean;
    /** Stops and forgets `alias`. Safe if it isn't registered. */
    Remove(alias: string): void;
    Play(alias: string, options?: SoundPlayOptions): void;
    /** Stops every playing instance of `alias`. Safe if it isn't registered. */
    Stop(alias: string): void;
}
