import { EventEmitter } from "eventemitter3";
import type { AnimatedSprite, Texture } from "pixi.js";
import { Sprite } from "pixi.js";
import AssetFactory from "../loading/AssetFactory";
import { AssetLoadError, AssetsDestroyedError, LoadFailure, Suggest } from "./AssetErrors";
import { AnimationId, AssetId, BinaryId, BundleId, DataId, DataOf, FontId, ImageId, SoundId, SpriteId } from "./AssetIds";
import { AssetEntry, AssetTier, BundleEntry, FileAsset, FontAsset, FrameAsset, Manifest, SoundAsset, ValidateManifest } from "./AssetManifest";
import BundleRefs from "./BundleRefs";
import { IBundleLoader, ISoundAdapter, LoadItem, LoadResult, SoundPlayOptions } from "./IBundleLoader";

export interface AssetsOptions {
    loader: IBundleLoader;
    /**
     * Runs `fn` once the frame being drawn has been drawn, and returns a way to cancel it. An
     * unloaded bundle's textures are destroyed then and not before: sprites that were showing them
     * are replaced within the same frame, and the renderer throws on a destroyed texture it meets.
     */
    schedule?: (fn: () => void) => () => void;
    fetch?: typeof fetch;
}

export interface AssetsInitOptions {
    /** Needed only by a game that has sounds - see `PixiSoundAdapter`. */
    sound?: ISoundAdapter;
    /** How many times a failed file is tried again (default 2). */
    retries?: number;
}

export type BundleProgress = { bundle: string; loaded: number; total: number };

/** One hold on a bundle. The bundle stays loaded until every handle on it (and every bundle depending on it) is released. */
export interface BundleHandle {
    readonly bundle: string;
    /** Gives the hold back. Safe to call twice. */
    Release(): void;
}

type BundleState = {
    name: string;
    entry: BundleEntry;
    /** Dependencies loaded, boot-tier assets loaded and sprites registered. */
    done: boolean;
    ready: Promise<void> | null;
    deps: BundleHandle[];
    results: LoadResult[];
    values: { [id: string]: unknown };
    /** Keys (assets, atlases) whose load has finished. */
    loadedKeys: Set<string>;
    /** Every asset (or atlas) being loaded or loaded, by key: a job's items share its promise, so asking twice loads once. */
    units: Map<string, Promise<void>>;
    soundIds: Set<string>;
    bytesLoaded: number;
    bytesTotal: number;
    listeners: Set<(progress: BundleProgress) => void>;
    scheduled: boolean;
    unloadWhenDone: boolean;
    /** Unloaded or discarded: a job that finishes after this frees what it made instead of keeping it. */
    disposed: boolean;
};

/**
 * A game's assets, in bundles: `global` for the life of the game, and per-level bundles loaded
 * when the level starts and let go when it ends. One per `Game` (`game.assets`), taken down with it.
 *
 * Each bundle is a folder of art, sound and data built into `manifest.json` (see
 * `scripts/build-assets.js`). Asking for a bundle (`Acquire`) loads it and what it depends on,
 * counting how many holders it has; when the last lets go it unloads - textures, fonts and sounds
 * freed - a frame later (see `AssetsOptions.schedule`). An asset's `tier` says when it loads:
 * `boot` with its bundle (what `Acquire` waits for), `background` right after, `lazy` only when
 * `Load`ed or played.
 *
 * Ids are `<bundle>.<name>` and typed per game (see AssetIds.ts), so a mistyped one is a compile
 * error and an unknown one at runtime says what it probably meant.
 *
 * Events: `bundle:start` (name), `bundle:progress` ({ bundle, loaded, total } bytes), `bundle:complete`
 * (name), `bundle:error` (name, error), `bundle:unloaded` (name), `scope:changed` (chain),
 * `asset:reloaded` (id). It's an eventemitter3, so a component can `Listen` to it.
 */
export default class Assets extends EventEmitter {
    private loader: IBundleLoader;
    private schedule: (fn: () => void) => () => void;
    private fetcher: typeof fetch;

    private manifest: Manifest | undefined;
    private baseUrl = "";
    private sound: ISoundAdapter | undefined;
    private retries = 2;
    private destroyed = false;

    private refs = new BundleRefs();
    private bundles = new Map<string, BundleState>();
    private levelHandles: BundleHandle[] = [];
    private scope: string[] = [];
    /** Sounds asked to play before they'd loaded: a `StopSound` in the meantime cancels the play. */
    private playing = new Map<string, object>();
    private inFlight = new Set<() => void>();
    private scheduledUnloads = new Set<() => void>();
    private loadJobs = 0;
    private allIds: string[] | undefined;

    constructor(options: AssetsOptions) {
        super();
        this.loader = options.loader;
        this.schedule = options.schedule || (fn => {
            const timer = setTimeout(fn, 0);
            return () => clearTimeout(timer);
        });
        this.fetcher = options.fetch || ((input, init) => fetch(input, init));
    }

    /** Whether `Init` has read a manifest. */
    get IsReady(): boolean {
        return !!this.manifest;
    }

    get IsDestroyed(): boolean {
        return this.destroyed;
    }

    /** Built without `--production`: the engine reloads hand-edited data on each level start. */
    get IsDev(): boolean {
        return !!this.manifest && this.manifest.dev;
    }

    /** Bundles a bare name is looked up in, nearest first. */
    get Scope(): string[] {
        return this.scope.slice();
    }

    /** Reads the manifest at `manifestUrl`; every asset url is relative to the folder it's in. */
    async Init(manifestUrl: string, options: AssetsInitOptions = {}): Promise<void> {
        this.EnsureAlive();
        const response = await this.fetcher(manifestUrl, { cache: "no-cache" });
        if (!response.ok) {
            throw new Error(`Couldn't load the asset manifest ${manifestUrl}: ${response.status} ${response.statusText}. Has the asset build run (npm run assets)?`);
        }
        const manifest = ValidateManifest(await response.json());
        this.EnsureAlive();
        this.InitWithManifest(manifest, manifestUrl.slice(0, manifestUrl.lastIndexOf("/") + 1), options);
    }

    /** As `Init`, with the manifest already in hand (and `baseUrl` ending in "/" or empty). */
    InitWithManifest(manifest: Manifest, baseUrl: string, options: AssetsInitOptions = {}): void {
        this.EnsureAlive();
        if (this.manifest) {
            throw new Error("Assets are already initialised.");
        }
        this.manifest = manifest;
        this.baseUrl = baseUrl;
        this.sound = options.sound;
        this.retries = options.retries === undefined ? 2 : options.retries;
        this.SetScope([]);
    }

    // Bundles

    /**
     * Loads `name` (and the bundles it depends on) if it isn't already, and holds it until the handle is released.
     * Resolves when its boot-tier assets are ready. `onProgress` follows this bundle's bytes (events carry every bundle's).
     */
    async Acquire(name: BundleId, onProgress?: (progress: BundleProgress) => void): Promise<BundleHandle> {
        const entry = this.EntryOf(name);
        this.refs.Retain(name);
        let released = false;
        const handle: BundleHandle = {
            bundle: name,
            Release: () => {
                if (!released) {
                    released = true;
                    this.ReleaseBundle(name);
                }
            }
        };
        try {
            await this.EnsureLoaded(name, entry, onProgress);
            this.EnsureAlive();
        } catch (error) {
            handle.Release();
            throw error;
        }
        return handle;
    }

    /** Loads `name` and keeps it for the life of the game - for `global`. */
    async LoadBundle(name: BundleId, onProgress?: (progress: BundleProgress) => void): Promise<void> {
        await this.Acquire(name, onProgress);
        this.refs.Pin(name);
    }

    /**
     * Makes `names` (usually one level's bundle) the level's assets: loads them, points bare sprite
     * names at them, then lets go of the previous level's - in that order, so assets the two share
     * never unload, and a restart onto the same bundle costs nothing. With no names it just lets go.
     */
    async UseLevelBundle(...names: BundleId[]): Promise<void> {
        const acquired: BundleHandle[] = [];
        try {
            for (const name of names) {
                acquired.push(await this.Acquire(name));
            }
            this.EnsureAlive();
        } catch (error) {
            acquired.forEach(handle => handle.Release());
            throw error;
        }
        const previous = this.levelHandles;
        this.levelHandles = acquired;
        this.SetScope(names);
        previous.forEach(handle => handle.Release());
    }

    /** The bundles bare names resolve in: `names` nearest first, then `global`. */
    SetScope(names: string[]): void {
        this.EnsureAlive();
        const chain = names.slice();
        if (chain.indexOf("global") < 0 && this.manifest && this.manifest.bundles["global"]) {
            chain.push("global");
        }
        this.scope = chain;
        AssetFactory.inst.SetScope(chain);
        this.emit("scope:changed", chain);
    }

    IsBundleLoaded(name: BundleId): boolean {
        const state = this.bundles.get(name);
        return !!state && state.done && !state.disposed;
    }

    // Assets

    /** Whether the manifest has an asset called `id` (it may not be loaded). */
    Has(id: AssetId): boolean {
        const dot = id.indexOf(".");
        const entry = this.manifest && dot > 0 ? this.manifest.bundles[id.slice(0, dot)] : undefined;
        return !!entry && !!entry.assets[id];
    }

    IsLoaded(id: AssetId): boolean {
        const found = this.Locate(id);
        if (!found.state || !found.state.done || found.state.disposed) {
            return false;
        }
        switch (found.asset.kind) {
            case "sprite":
            case "animation":
                return true;
            default:
                return found.state.loadedKeys.has(id);
        }
    }

    /**
     * Loads one asset of a bundle you hold - for a `background` or `lazy` one. Resolves at once if
     * it's loaded, and waits for the load already running if there is one. (Sprites come with their bundle.)
     */
    async Load(id: AssetId): Promise<void> {
        const found = this.Locate(id);
        if (!found.state || found.state.disposed) {
            throw new Error(`"${id}" is in bundle "${found.bundle}", which isn't loaded - Acquire it first.`);
        }
        await found.state.ready;
        this.EnsureAlive();
        if (found.asset.kind !== "sprite" && found.asset.kind !== "animation") {
            await this.LoadUnits(found.state, [id]);
        }
    }

    /** Where `id`'s file is served from, version query included - for a DOM `<img>`, say. A sound gives the format this browser plays. */
    Url(id: AssetId): string {
        const found = this.Locate(id);
        const asset = found.asset;
        let path: string | undefined;
        if (asset.kind === "sound") {
            path = this.sound ? this.sound.Pick(asset.urls) : asset.urls[0];
        } else if (asset.kind !== "sprite" && asset.kind !== "animation") {
            path = asset.url;
        }
        if (!path) {
            throw new Error(`"${id}" is a ${asset.kind} and has no file of its own.`);
        }
        return this.Versioned(found.entry, path);
    }

    Texture(id: ImageId | SpriteId | AnimationId): Texture {
        const found = this.Loaded(id, ["image", "sprite", "animation"]);
        return found.asset.kind === "image" ? (found.state.values[id] as Texture) : AssetFactory.inst.CreateTexture(id);
    }

    Sprite(id: ImageId | SpriteId): Sprite {
        return new Sprite(this.Texture(id));
    }

    Animation(id: AnimationId): AnimatedSprite {
        this.Loaded(id, ["animation"]);
        return AssetFactory.inst.CreateAnimatedSprite(id);
    }

    /** A data file's parsed JSON - typed by the game's `DataTypeRegistry` if it declares one for `id`. */
    Data<I extends DataId>(id: I): DataOf<I> {
        const found = this.Loaded(id, ["data"]);
        return found.state.values[id] as DataOf<I>;
    }

    Binary(id: BinaryId): ArrayBuffer {
        const found = this.Loaded(id, ["binary"]);
        return found.state.values[id] as ArrayBuffer;
    }

    /** The name `BitmapText` knows the font by (its `face`, which isn't the id). */
    FontName(id: FontId): string {
        const found = this.Loaded(id, ["font"]);
        return (found.asset as FontAsset).face;
    }

    /**
     * Plays a sound, loading it first if it hasn't been (a `lazy` or `background` one). A
     * `StopSound` before it has loaded cancels the play.
     */
    async PlaySound(id: SoundId, options?: SoundPlayOptions): Promise<void> {
        const adapter = this.SoundAdapter(id);
        if (this.IsLoaded(id)) {
            adapter.Play(id, options);
            return;
        }
        const token = {};
        this.playing.set(id, token);
        await this.Load(id);
        if (this.destroyed || this.playing.get(id) !== token) {
            return;
        }
        this.playing.delete(id);
        adapter.Play(id, options);
    }

    StopSound(id: SoundId): void {
        this.playing.delete(id);
        if (this.sound && !this.destroyed) {
            this.sound.Stop(id);
        }
    }

    /**
     * Fetches a data or binary file again, bypassing the cache - so a hand edit shows up without a
     * page reload. Emits `asset:reloaded` with the id.
     */
    async Reload(id: DataId | BinaryId): Promise<void> {
        const found = this.Locate(id);
        if (found.asset.kind !== "data" && found.asset.kind !== "binary") {
            throw new Error(`"${id}" is a ${found.asset.kind} - only data and binary files can be reloaded.`);
        }
        const state = found.state;
        if (!state || !state.done || state.disposed) {
            throw new Error(`"${id}" is in bundle "${found.bundle}", which isn't loaded.`);
        }
        const response = await this.fetcher(this.Versioned(found.entry, (found.asset as FileAsset).url) + "&r=" + Date.now(), { cache: "no-store" });
        if (!response.ok) {
            throw new Error(`Couldn't reload "${id}": ${response.status} ${response.statusText}`);
        }
        const value = found.asset.kind === "data" ? await response.json() : await response.arrayBuffer();
        if (state.disposed || this.destroyed) {
            return;
        }
        state.values[id] = value;
        this.emit("asset:reloaded", id);
    }

    /** What's loaded and how often it has been fetched - for the dev console and for tests. */
    Stats(): { loadJobs: number; bundles: { [name: string]: { refs: number; loaded: boolean; pinned: boolean; bytes: number } } } {
        const bundles: { [name: string]: { refs: number; loaded: boolean; pinned: boolean; bytes: number } } = {};
        this.bundles.forEach((state, name) => {
            bundles[name] = { refs: this.refs.Count(name), loaded: state.done, pinned: this.refs.IsPinned(name), bytes: state.bytesLoaded };
        });
        return { loadJobs: this.loadJobs, bundles };
    }

    /**
     * Takes everything down, for `Game.destroy`: loads in flight are abandoned (their promises reject
     * with `AssetsDestroyedError`, never hang), sounds and bitmap fonts - which live in process-wide
     * tables that would outlast the game - are removed, and later calls throw. Textures are left to
     * `utils.destroyTextureCache`, which the game runs right after. Safe to call twice.
     */
    Destroy(): void {
        if (this.destroyed) {
            return;
        }
        this.destroyed = true;
        this.scheduledUnloads.forEach(cancel => cancel());
        this.scheduledUnloads.clear();
        this.inFlight.forEach(cancel => cancel());
        this.inFlight.clear();
        this.bundles.forEach(state => this.DisposeState(state, false));
        this.bundles.clear();
        this.refs.Clear();
        this.levelHandles = [];
        this.playing.clear();
        this.removeAllListeners();
    }

    // Loading

    private EnsureLoaded(name: string, entry: BundleEntry, onProgress?: (progress: BundleProgress) => void): Promise<void> {
        let state = this.bundles.get(name);
        if (!state) {
            const created = this.NewState(name, entry);
            state = created;
            this.bundles.set(name, created);
            created.ready = this.Boot(created);
            // Whoever awaits `ready` sees the failure; this just keeps the state from lingering.
            created.ready.catch(() => this.Discard(created));
        }
        if (!onProgress || state.done) {
            return state.ready;
        }
        const listeners = state.listeners;
        listeners.add(onProgress);
        return state.ready.then(
            () => { listeners.delete(onProgress); },
            error => { listeners.delete(onProgress); throw error; }
        );
    }

    private NewState(name: string, entry: BundleEntry): BundleState {
        return {
            name, entry, done: false, ready: null, deps: [], results: [], values: {}, loadedKeys: new Set(), units: new Map(), soundIds: new Set(),
            bytesLoaded: 0, bytesTotal: 0, listeners: new Set(), scheduled: false, unloadWhenDone: false, disposed: false
        };
    }

    private async Boot(state: BundleState): Promise<void> {
        this.emit("bundle:start", state.name);
        for (const dependency of state.entry.dependsOn) {
            // The manifest names its bundles with plain strings; the typed `BundleId` is for callers.
            state.deps.push(await this.Acquire(dependency as BundleId));
            this.EnsureAlive();
        }
        const keys = state.entry.atlases.map(atlas => atlas.name).concat(this.IdsInTiers(state.entry, ["boot"]));
        await this.LoadUnits(state, keys, true);
        this.EnsureAlive();

        this.RegisterSprites(state);
        state.done = true;
        this.emit("bundle:complete", state.name);

        if (state.unloadWhenDone) {
            state.unloadWhenDone = false;
            this.ScheduleUnloadIfFree(state.name);
        }
        const background = this.IdsInTiers(state.entry, ["background"]);
        if (background.length) {
            this.LoadUnits(state, background).catch(() => {
                // Already reported (`bundle:error`, console) by the job; a bundle can still be used without them.
            });
        }
    }

    private IdsInTiers(entry: BundleEntry, tiers: AssetTier[]): string[] {
        return Object.keys(entry.assets).filter(id => {
            const asset = entry.assets[id];
            return asset.kind !== "sprite" && asset.kind !== "animation" && tiers.indexOf(asset.tier) >= 0;
        });
    }

    private RegisterSprites(state: BundleState): void {
        const factory = AssetFactory.inst;
        Object.keys(state.entry.assets).forEach(id => {
            const asset = state.entry.assets[id];
            if (asset.kind === "sprite" || asset.kind === "animation") {
                factory.AddBundleAsset(state.name, id, (asset as FrameAsset).frames);
            }
        });
    }

    /** Loads whichever of `keys` aren't loading yet as one job, and resolves when all of them have loaded. */
    private async LoadUnits(state: BundleState, keys: string[], trackProgress = false): Promise<void> {
        const fresh = keys.filter(key => !state.units.has(key));
        if (fresh.length) {
            const job = this.RunJob(state, fresh, trackProgress);
            fresh.forEach(key => state.units.set(key, job));
            // A failed job's keys are free to be asked for again.
            job.catch(() => fresh.forEach(key => state.units.get(key) === job && state.units.delete(key)));
        }
        const jobs: Promise<void>[] = [];
        keys.forEach(key => {
            const job = state.units.get(key);
            if (jobs.indexOf(job) < 0) {
                jobs.push(job);
            }
        });
        await Promise.all(jobs);
    }

    private async RunJob(state: BundleState, keys: string[], trackProgress: boolean): Promise<void> {
        const items: LoadItem[] = [];
        const sounds: { id: string; asset: SoundAsset }[] = [];
        keys.forEach(key => {
            const atlas = state.entry.atlases.find(a => a.name === key);
            if (atlas) {
                items.push({ type: "atlas", key, url: atlas.json, bytes: atlas.bytes, scaleMode: atlas.scaleMode });
                return;
            }
            const asset = state.entry.assets[key] as AssetEntry;
            if (asset.kind === "sound") {
                sounds.push({ id: key, asset });
            } else if (asset.kind !== "sprite" && asset.kind !== "animation") {
                items.push({ type: asset.kind, key, url: asset.url, bytes: asset.bytes });
            }
        });

        if (trackProgress) {
            state.bytesTotal += items.reduce((sum, item) => sum + item.bytes, 0) + sounds.reduce((sum, s) => sum + s.asset.bytes, 0);
            this.EmitProgress(state);
        }
        const advance = (bytes: number) => {
            if (trackProgress) {
                state.bytesLoaded += bytes;
                this.EmitProgress(state);
            }
        };

        this.loadJobs++;
        const failures: LoadFailure[] = [];
        const work: Promise<void>[] = [];

        if (items.length) {
            const handle = this.loader.Load(items, { baseUrl: this.baseUrl, query: "v=" + state.entry.hash, retries: this.retries, onItem: item => advance(item.bytes) });
            this.inFlight.add(handle.Cancel);
            work.push(handle.promise.then(
                result => {
                    this.inFlight.delete(handle.Cancel);
                    if (this.destroyed || state.disposed) {
                        result.Dispose(!this.destroyed);
                        throw new AssetsDestroyedError();
                    }
                    state.results.push(result);
                    Object.keys(result.values).forEach(key => (state.values[key] = result.values[key]));
                },
                error => {
                    this.inFlight.delete(handle.Cancel);
                    if (!(error instanceof AssetLoadError)) {
                        throw error;
                    }
                    failures.push(...error.failures);
                }
            ));
        }
        sounds.forEach(({ id, asset }) => {
            work.push(this.LoadSound(state, id, asset).then(
                () => advance(asset.bytes),
                error => {
                    if (this.destroyed || error instanceof AssetsDestroyedError) {
                        throw error;
                    }
                    failures.push({ id, url: asset.urls[0], message: (error && error.message) || String(error) });
                }
            ));
        });

        await Promise.all(work);
        if (!failures.length) {
            keys.forEach(key => state.loadedKeys.add(key));
        }
        if (failures.length) {
            const error = new AssetLoadError(state.name, failures);
            console.error(error.message);
            if (!this.destroyed) {
                this.emit("bundle:error", state.name, error);
            }
            throw error;
        }
    }

    private async LoadSound(state: BundleState, id: string, asset: SoundAsset): Promise<void> {
        if (!this.sound) {
            throw new Error(`"${id}" is a sound, but no sound adapter was given: Init(url, { sound: new PixiSoundAdapter() }).`);
        }
        const path = this.sound.Pick(asset.urls);
        if (!path) {
            throw new Error(`none of its formats (${asset.urls.join(", ")}) can be played in this browser.`);
        }
        // Registered before it has loaded, so tearing the bundle down mid-load still removes it.
        state.soundIds.add(id);
        await this.sound.Load(id, this.Versioned(state.entry, path));
        if (this.destroyed || state.disposed) {
            this.sound.Remove(id);
            throw new AssetsDestroyedError();
        }
    }

    private EmitProgress(state: BundleState): void {
        const progress = { bundle: state.name, loaded: state.bytesLoaded, total: state.bytesTotal };
        this.emit("bundle:progress", progress);
        state.listeners.forEach(listener => listener(progress));
    }

    // Unloading

    private ReleaseBundle(name: string): void {
        if (this.destroyed) {
            return;
        }
        this.refs.Release(name);
        this.ScheduleUnloadIfFree(name);
    }

    private ScheduleUnloadIfFree(name: string): void {
        const state = this.bundles.get(name);
        if (!state || state.scheduled || !this.refs.IsFree(name)) {
            return;
        }
        if (!state.done) {
            state.unloadWhenDone = true;
            return;
        }
        state.scheduled = true;
        // The scheduler may run the callback before it has returned the way to cancel it.
        const pending: { cancel?: () => void } = {};
        pending.cancel = this.schedule(() => {
            this.scheduledUnloads.delete(pending.cancel);
            state.scheduled = false;
            this.UnloadNow(name);
        });
        this.scheduledUnloads.add(pending.cancel);
    }

    private UnloadNow(name: string): void {
        const state = this.bundles.get(name);
        // Someone acquired it again while the unload waited for its frame.
        if (this.destroyed || !state || !this.refs.IsFree(name)) {
            return;
        }
        this.bundles.delete(name);
        this.DisposeState(state, true);
        AssetFactory.inst.RemoveBundle(name);
        this.emit("bundle:unloaded", name);
    }

    /** A bundle that failed to load: forget it entirely, so asking again starts afresh. */
    private Discard(state: BundleState): void {
        if (this.destroyed || state.disposed) {
            return;
        }
        if (this.bundles.get(state.name) === state) {
            this.bundles.delete(state.name);
        }
        this.DisposeState(state, true);
        AssetFactory.inst.RemoveBundle(state.name);
    }

    private DisposeState(state: BundleState, unloading: boolean): void {
        state.disposed = true;
        state.results.forEach(result => result.Dispose(unloading));
        state.results = [];
        if (this.sound) {
            const sound = this.sound;
            state.soundIds.forEach(id => sound.Remove(id));
        }
        state.soundIds.clear();
        state.values = {};
        state.loadedKeys.clear();
        state.units.clear();
        if (unloading) {
            state.deps.forEach(handle => handle.Release());
        }
        state.deps = [];
    }

    // Lookup

    private EnsureAlive(): void {
        if (this.destroyed) {
            throw new AssetsDestroyedError();
        }
    }

    private EntryOf(name: string): BundleEntry {
        this.EnsureAlive();
        if (!this.manifest) {
            throw new Error("Assets haven't been initialised: await game.assets.Init(manifestUrl) first.");
        }
        const entry = this.manifest.bundles[name];
        if (!entry) {
            const hint = Suggest(name, Object.keys(this.manifest.bundles));
            throw new Error(`No asset bundle "${name}"${hint ? ` - did you mean "${hint}"?` : "."}`);
        }
        return entry;
    }

    private Locate(id: string): { bundle: string; entry: BundleEntry; asset: AssetEntry; state: BundleState | undefined } {
        this.EnsureAlive();
        if (!this.manifest) {
            throw new Error("Assets haven't been initialised: await game.assets.Init(manifestUrl) first.");
        }
        const dot = id.indexOf(".");
        const bundle = dot > 0 ? id.slice(0, dot) : "";
        const entry = this.manifest.bundles[bundle];
        const asset = entry && entry.assets[id];
        if (!asset) {
            if (!this.allIds) {
                this.allIds = [];
                Object.keys(this.manifest.bundles).forEach(name => this.allIds.push(...Object.keys(this.manifest.bundles[name].assets)));
            }
            const hint = Suggest(id, this.allIds);
            throw new Error(`No asset "${id}"${hint ? ` - did you mean "${hint}"?` : dot > 0 ? "" : " (ids are <bundle>.<name>)."}`);
        }
        return { bundle, entry, asset, state: this.bundles.get(bundle) };
    }

    /** `id`'s asset, checked to be one of `kinds` and loaded. */
    private Loaded(id: string, kinds: string[]): { asset: AssetEntry; state: BundleState } {
        const found = this.Locate(id);
        if (kinds.indexOf(found.asset.kind) < 0) {
            throw new Error(`"${id}" is a ${found.asset.kind}, not a ${kinds.join(" or ")}.`);
        }
        const state = found.state;
        if (!state || !state.done || state.disposed) {
            throw new Error(`"${id}" is in bundle "${found.bundle}", which isn't loaded.`);
        }
        const asset = found.asset;
        if (asset.kind !== "sprite" && asset.kind !== "animation" && !state.loadedKeys.has(id)) {
            throw new Error(`"${id}" hasn't loaded yet (its tier is "${asset.tier}") - await game.assets.Load("${id}") first.`);
        }
        return { asset, state };
    }

    private SoundAdapter(id: string): ISoundAdapter {
        this.Locate(id);
        if (!this.sound) {
            throw new Error(`"${id}" is a sound, but no sound adapter was given: Init(url, { sound: new PixiSoundAdapter() }).`);
        }
        return this.sound;
    }

    private Versioned(entry: BundleEntry, path: string): string {
        return this.baseUrl + path + "?v=" + entry.hash;
    }
}
