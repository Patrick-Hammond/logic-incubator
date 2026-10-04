# logic-incubator API reference

Signatures and behaviour of the public surface of the three packages, plus the asset build tool's command line,
configuration files and plugin interface. For explanations, examples and workflows see the
[user guide](user-guide.md).

**Conventions**

- Import paths use the package prefixes `@logic-incubator/lib/...`, `@logic-incubator/engine/...`,
  `@logic-incubator/editor/...`, which map to each package's `src/` folder. `default` below means the module's
  default export.
- Methods are PascalCase (`LoadBundle`); properties and getters are camelCase or PascalCase as written.
- "Pure" modules import no pixi and run under plain Node.
- Types shown as `SpriteId`, `SoundId`, ... are plain `string` until a game generates its asset declarations.

## Contents

**[lib](#lib)**
[Game](#game) ·
[GameComponent](#gamecomponent) ·
[SceneManager](#scenemanager) ·
[Timing](#timing) ·
[Display helpers](#display-helpers) ·
[Assets](#assets) ·
[Asset ids](#asset-ids) ·
[Asset manifest](#asset-manifest) ·
[Asset errors](#asset-errors) ·
[Loader and sound interfaces](#loader-and-sound-interfaces) ·
[PixiSoundAdapter](#pixisoundadapter) ·
[LoadingScreen](#loadingscreen) ·
[AssetFactory](#assetfactory) ·
[Asset build tool](#asset-build-tool) ·
[Keyboard](#keyboard) ·
[GamePad](#gamepad) ·
[VirtualJoystick](#virtualjoystick) ·
[Storage and Url](#storage-and-url) ·
[Tween and Easing](#tween-and-easing) ·
[Math](#math) ·
[Store](#store) ·
[Patterns, algorithms, data structures](#patterns-algorithms-data-structures) ·
[Utils and filters](#utils-and-filters) ·
[Tilemap](#tilemap)

**[engine](#engine)**
[Constants and events](#constants-and-events) ·
[DungeonMain](#dungeonmain) ·
[Level](#level) ·
[Level file format](#level-file-format) ·
[Asset metadata](#asset-metadata) ·
[Lighting](#lighting) ·
[Depth](#depth) ·
[Doors, regions and other level helpers](#doors-regions-and-other-level-helpers) ·
[Monsters](#monsters) ·
[Behaviours](#behaviours) ·
[Spawners](#spawners) ·
[Projectiles](#projectiles) ·
[Player state](#player-state) ·
[Encounter](#encounter) ·
[Views](#views) ·
[Player input](#player-input)

**[editor](#editor)**
[DungeonEditor](#dungeoneditor) ·
[EditorAssets](#editorassets) ·
[SavedLevel](#savedlevel) ·
[Map styling](#map-styling) ·
[Stores](#stores) ·
[EditorComponent](#editorcomponent) ·
[UI helpers](#ui-helpers) ·
[Sprite editor](#sprite-editor)

---

# lib

## Game

`@logic-incubator/lib/game/Game` - `default class Game extends Application` (pixi).

```ts
new Game(options: IGameOptions, showStats?: boolean)
```

`showStats` (default `false`) replaces the ticker with a `StatsTicker` that shows a stats.js panel.

### `IGameOptions`

| Field | Type | Meaning |
| --- | --- | --- |
| `width`, `height` | `number` | Canvas size in pixels. |
| `fit` | `"none" \| "border" \| "centered"` | How the canvas fits the window (default `"border"`). See [Display helpers](#display-helpers). |
| `fullscreen` | `boolean` | Requests fullscreen (screenfull) on the first pointer click. The target is the whole page (`document.documentElement`), not the canvas - a browser only paints the fullscreen element's subtree, so DOM UI you put over the canvas (the editor's panels, dialogs) stays visible. |
| `pixelArt` | `boolean` | Sets pixi's default scale mode to NEAREST. |
| `view` | `HTMLCanvasElement` | Use an existing canvas. |
| `autoStart`, `transparent`, `autoDensity`, `antialias`, `preserveDrawingBuffer`, `resolution`, `forceCanvas`, `backgroundColor`, `clearBeforeRender`, `forceFXAA`, `powerPreference`, `sharedTicker`, `sharedLoader`, `resizeTo` | | Passed to pixi's `Application`. |

### Members

| Member | Type | Notes |
| --- | --- | --- |
| `static inst` | `Game` | The current game. Set by the constructor; cleared by `destroy` (only if still this game). |
| `keyboard` | `Keyboard` | |
| `gamePad` | `GamePad` | |
| `sceneManager` | `SceneManager` | Scenes draw on `stage`. |
| `assets` | `Assets` | This game's asset bundles. |
| `dispatcher` | `EventEmitter` | The game's own events. |
| `resizeStrategy` | `IResizeStrategy` | |
| `interactionManager` | `interaction.InteractionManager` | getter |
| `Destroyed` | `boolean` | getter: whether `destroy` has run. |
| `destroy(removeView = true, stageOptions?)` | `void` | See below. |

Inherited from `Application`: `stage`, `ticker`, `renderer`, `screen`, `view`, `loader`.

### `destroy`

Overrides `Application.destroy`. Idempotent. Order: scenes (`sceneManager.Destroy`), `keyboard.Destroy`, `gamePad.Destroy`,
`dispatcher.removeAllListeners`, `assets.Destroy`, the window resize handler and fullscreen listener, `AssetFactory.Destroy`,
`utils.destroyTextureCache`, then pixi's own `destroy`; finally `Game.inst` is cleared. `removeView` also removes the canvas
(default `true`, unlike pixi's).

---

## GameComponent

`@logic-incubator/lib/game/GameComponent` - `default abstract class GameComponent`.

A scene, or a piece of one. Its lifecycle is driven explicitly by its owner (see the user guide, 4.2).

```ts
export interface IEmitter {
    on(event: string, fn: (...args: any[]) => void, context?: any): unknown;
    off(event: string, fn?: (...args: any[]) => void, context?: any): unknown;
}
```

### Fields

| Field | Type | |
| --- | --- | --- |
| `root` | `Container` | The component's display root. |
| `game` *(protected)* | `Game` | `Game.inst` at construction. |
| `assetFactory` *(protected)* | `AssetFactory` | `AssetFactory.inst` at construction. |

### Driven by the owner (public; each is a no-op when repeated)

| Method | Runs | Order |
| --- | --- | --- |
| `Initialise()` | `OnInitialise` once, then children's `Initialise` | owner, then children |
| `Show()` | `Initialise`, then bindings from `WhileShown`, `OnShow`, then children's `Show` | owner, then children |
| `Hide()` | children's `Hide` (reverse), `OnHide`, then bindings' `off` (reverse) | children, then owner |
| `Destroy()` | `Hide`, children's `Destroy` (reverse), `OnDestroy` (if initialised), disposers (reverse), `root.destroy({ children: true })` | children, then owner |
| `Attach<T extends GameComponent>(child: T, into: Container = this.root): T` | Adds `child.root` to `into`; initialises/shows it at once if this one already is | |

### Hooks (protected, override)

`OnInitialise()`, `OnShow()`, `OnHide()`, `OnDestroy()` - all default to no-ops.

### Helpers (protected)

| Method | Description |
| --- | --- |
| `Own(dispose: () => void): void` | Runs `dispose` on destroy, last registered first. |
| `WhileShown(on: () => void, off: () => void): void` | `on()` now if shown and at every `Show`; `off()` at every `Hide`. |
| `Listen(emitter: IEmitter, event: string, fn): void` | Subscribes `fn` (with `this` as context) until destroyed. |
| `ListenWhileShown(emitter: IEmitter, event: string, fn): void` | Subscribes only while shown. |
| `Tick(fn: (dt: number) => void): void` | Calls `fn` each frame of `game.ticker`, only while shown. |
| `AddToScene(id: string): void` | **Deprecated.** Use `owner.Attach(child)`. |

---

## SceneManager

`@logic-incubator/lib/game/SceneManager` - `default class SceneManager`. Created by `Game` (`game.sceneManager`).

| Member | Signature | Description |
| --- | --- | --- |
| `CurrentScene` | `string \| undefined` | Id of the scene on the stage. |
| `HasScene(id)` | `boolean` | |
| `GetScene(id)` | `GameComponent` | Throws `No scene "id" - add it with AddScene first.` |
| `AddScene(id, scene)` | `void` | Registers and **initialises** the scene (not shown). Throws if the id exists; if `OnInitialise` throws, the scene is un-registered and the error rethrown. Sets `scene.root.name = id` and makes it non-interactive. |
| `ShowScene(id)` | `void` | Hides the current scene, removes it from the stage, adds and shows `id`, makes its root interactive. Showing the current scene does nothing. |
| `RemoveScene(id)` | `void` | Destroys the scene (hiding it first if showing) and forgets it. |
| `Destroy()` | `void` | Removes every scene. |

---

## Timing

`@logic-incubator/lib/game/Timing`.

```ts
type Cancel = () => void;
function GetInterval(ms: number, callback: () => void, context?: any): Cancel;   // every ms, on Ticker.shared
function Wait(ms: number, callback: () => void, context?: any): Cancel;          // once, after ms
```

Both use wall-clock time (`Date.now()`), checked every tick.

---

## Display helpers

| Module | Exports |
| --- | --- |
| `game/display/Utils` | `RemoveFromParent(displayObject): DisplayObject`, `CallbackDone(onComplete?, context?)`, `CenterOn<T extends RectangleLike>(object: T, target: RectangleLike): T`, `CenterScreen(displayObject)` (centres on `Game.inst.screen`) |
| `game/display/ResizeStrategies` | `type ResizeStrategies = "none" \| "border" \| "centered"`, `interface IResizeStrategy { Resize(canvas) }`, `GetResizeStrategy(fit)`. `border` scales the canvas to fit the window preserving aspect and letterboxes; `centered` centres it at its own size; `none` does nothing. |
| `game/display/CameraControl` | `default class CameraControl implements ICameraControl` (`constructor(playerId)`, `Get(): ICameraTransform` - the gamepad stick as a rotation `Vec2`); `ICameraTransform { rotation: Vec2 }`, `ICameraControl { Get() }` |
| `game/display/AnimationSequence` | `class AnimationSequence` - see below |

### `AnimationSequence`

```ts
new AnimationSequence(clipNames: string[])      // bare AssetFactory names; each becomes an AnimatedSprite at animationSpeed 0.1
root: Sprite                                    // add this to the display list
Current: AnimatedSprite                         // getter
Play(clipName: string, onComplete?: () => void): AnimatedSprite
PlayLooped(clipName: string, onLoop?: () => void): AnimatedSprite
PlaySequence(clipNames: string[], onComplete?: () => void): void
Stop(): void
```

---

## Assets

`@logic-incubator/lib/assets/Assets` - `default class Assets extends EventEmitter` (eventemitter3). One per `Game`
(`game.assets`); constructed by `CreateAssets` in `assets/PixiAssets`.

```ts
new Assets(options: AssetsOptions)

interface AssetsOptions {
    loader: IBundleLoader;
    /** Runs fn after the frame being drawn has been drawn; returns a cancel. Default: setTimeout(fn, 0). */
    schedule?: (fn: () => void) => () => void;
    fetch?: typeof fetch;
}

interface AssetsInitOptions {
    sound?: ISoundAdapter;      // needed only by a game with sounds
    retries?: number;           // failed files retried this many times (default 2)
}

type BundleProgress = { bundle: string; loaded: number; total: number };   // bytes of the bundle's boot-tier load

interface BundleHandle {
    readonly bundle: string;
    Release(): void;            // idempotent
}
```

### State

| Member | Type | |
| --- | --- | --- |
| `IsReady` | `boolean` | A manifest has been read. |
| `IsDestroyed` | `boolean` | |
| `IsDev` | `boolean` | The manifest was built without `--production`. |
| `ManifestUrl` | `string` | Where `Init` read the manifest from (`""` if it was given one directly). |
| `Catalogue()` | `{ name, atlases, ids }[]` | What the manifest holds, for tools: per bundle, its atlas names (`~atlas.<bundle>.<sheet>.<page>`) and every asset id. Empty before `Init`. |
| `Scope` | `string[]` | Bundles a bare sprite name resolves in, nearest first, `global` last. A copy. |

### Initialisation

| Method | Description |
| --- | --- |
| `Init(manifestUrl: string, options?: AssetsInitOptions): Promise<void>` | Fetches the manifest with `cache: "no-cache"`, validates it, and uses its folder as the base for every asset url. Throws `Couldn't load the asset manifest ...` on a non-OK response. Initialises the scope to `global` (if the manifest has one). |
| `InitWithManifest(manifest: Manifest, baseUrl: string, options?: AssetsInitOptions): void` | As `Init` with the manifest in hand (`baseUrl` empty or ending in `/`). Throws if already initialised. |

### Bundles

| Method | Description |
| --- | --- |
| `Acquire(name: BundleId, onProgress?): Promise<BundleHandle>` | Loads the bundle and its `dependsOn` bundles if needed; resolves when boot-tier assets are ready (background-tier ones start after, unawaited). Ref-counted: one hold per call. Concurrent calls share one load. Rejects with `AssetLoadError` (the bundle is then forgotten) or `AssetsDestroyedError`. Unknown name: throws with a "did you mean". |
| `LoadBundle(name: BundleId, onProgress?): Promise<void>` | `Acquire` and pin: never unloads. |
| `UseLevelBundle(...names: BundleId[]): Promise<void>` | Acquires `names`, sets the scope to them (+ `global`), then releases the previous level's. On failure releases what it acquired and keeps the previous level. No names: releases the previous and clears the scope to `global`. |
| `SetScope(names: string[]): void` | Sets the scope chain (`global` appended if absent) and tells `AssetFactory`. Emits `scope:changed`. |
| `IsBundleLoaded(name: BundleId): boolean` | |

A bundle with no holders and no pin unloads **after the frame being drawn has rendered** (see `schedule`); acquiring it again
in that window cancels the unload. Its dependencies are released then and unload a frame later.

### Assets

| Method | Description |
| --- | --- |
| `Has(id: AssetId): boolean` | The manifest has the id (loaded or not). |
| `IsLoaded(id: AssetId): boolean` | Sprites/animations: the bundle is loaded. Others: that asset has finished loading. Throws for an unknown id. |
| `Load(id: AssetId): Promise<void>` | Loads one `background`/`lazy` asset of a bundle you hold; resolves at once if loaded; shares an in-flight load. Throws if its bundle isn't loaded. Sprites load with their bundle. |
| `Url(id: AssetId): string` | The asset's file url with `?v=<hash>`. Sounds give the first format the adapter says it can play. Throws for sprites/animations. |
| `Texture(id: ImageId \| SpriteId \| AnimationId): Texture` | |
| `Sprite(id: ImageId \| SpriteId): Sprite` | A new sprite each call. |
| `Animation(id: AnimationId): AnimatedSprite` | A new animated sprite each call. |
| `Data<I extends DataId>(id: I): DataOf<I>` | Parsed JSON (typed by `DataTypeRegistry`, else `unknown`). |
| `Binary(id: BinaryId): ArrayBuffer` | |
| `FontName(id: FontId): string` | The font's `face` - what `BitmapText` is given as `font.name`. |
| `PlaySound(id: SoundId, options?: SoundPlayOptions): Promise<void>` | Plays at once if loaded; otherwise loads, then plays unless `StopSound(id)` was called meanwhile. Rejects if loading fails; throws if no sound adapter was given. |
| `StopSound(id: SoundId): void` | Stops playing instances and cancels a pending play. |
| `Reload(id: DataId \| BinaryId): Promise<void>` | Re-fetches (bypassing cache), replaces the value, emits `asset:reloaded`. Other kinds throw. |
| `Stats()` | `{ loadJobs: number; bundles: { [name]: { refs, loaded, pinned, bytes } } }`. For the dev console and tests. |
| `Destroy(): void` | See below. |

Accessors throw a descriptive error for: an unknown id (with a did-you-mean), the wrong kind (`"x" is a image, not a data`),
a bundle that isn't loaded, an asset whose tier hasn't loaded yet, or before `Init`.

### Events

| Event | Arguments |
| --- | --- |
| `bundle:start` | `(name)` - a bundle began loading. |
| `bundle:progress` | `(progress: BundleProgress)` |
| `bundle:complete` | `(name)` - boot-tier assets are ready and sprites registered. |
| `bundle:error` | `(name, error: AssetLoadError)` - also emitted for background/lazy failures. |
| `bundle:unloaded` | `(name)` |
| `scope:changed` | `(chain: string[])` |
| `asset:reloaded` | `(id)` |

### `Destroy`

Idempotent. Cancels scheduled unloads; abandons in-flight loads (their promises reject with `AssetsDestroyedError`);
removes the sounds it registered and the bitmap fonts of loaded bundles; clears state; removes all listeners. It does **not**
destroy textures one by one - `Game.destroy` follows it with `utils.destroyTextureCache`. Afterwards every method rejects or
throws `AssetsDestroyedError`.

### Related modules

- `assets/BundleRefs` (`default class BundleRefs`): `Count(name)`, `Retain(name): number`, `Release(name): number` (never
  below 0), `Pin(name)`, `IsPinned(name)`, `IsFree(name)` (no holders and not pinned), `Clear()`.
- `assets/AssetScope` (`class ScopedNames`): `new ScopedNames(has: (key) => boolean)`, `Chain`, `SetChain(chain)`,
  `Invalidate()`, `Resolve(name): string | undefined` (a registered key first; else `<bundle>.<name>` over the chain; cached).
- `assets/PixiAssets`: `CreateAssets(getTicker: () => Ticker): Assets` - an `Assets` with a `PixiBundleLoader` that unloads at
  the ticker's `UPDATE_PRIORITY.UTILITY` (after render).

---

## Asset ids

`@logic-incubator/lib/assets/AssetIds` - types only. The game's generated `assets.d.ts` (and an optional hand-written file)
augment the three empty interfaces:

```ts
interface AssetRegistry {}       // "global.title": "image";  ...
interface BundleRegistry {}      // "global": true; ...
interface DataTypeRegistry {}    // "level1.level": LevelFile;  (hand-written)

type AssetKind = "sprite" | "animation" | "image" | "sound" | "data" | "binary" | "font";

type AssetId;        // every id (string until augmented)
type SpriteId, AnimationId, ImageId, SoundId, DataId, BinaryId, FontId;   // the ids of one kind
type DrawableId = SpriteId | AnimationId;
type BundleId;       // every bundle name
type BundleOf<I extends string>;   // BundleOf<"level1.hit"> = "level1"
type DataOf<I extends string>;     // DataTypeRegistry[I] if declared, else unknown
```

Until a game's declarations exist (or when none have items of a kind), the unions fall back to `string`; once a registry is
non-empty, a kind with no assets is `never`.

---

## Asset manifest

`@logic-incubator/lib/assets/AssetManifest` - types and a validator (pure). Written by the build, read by `Assets.Init`.

```ts
type AssetTier = "boot" | "background" | "lazy";

type SpriteAsset    = { kind: "sprite";    frames: string[] };            // texture keys "<bundle>.<frame>"
type AnimationAsset = { kind: "animation"; frames: string[] };            // in order
type FileAsset  = { kind: "image" | "data" | "binary"; url: string; bytes: number; tier: AssetTier };
type SoundAsset = { kind: "sound"; urls: string[]; bytes: number; tier: AssetTier };   // one per encoding, preferred first
type FontAsset  = { kind: "font"; url: string; face: string; bytes: number; tier: AssetTier };
type AssetEntry = SpriteAsset | AnimationAsset | FileAsset | SoundAsset | FontAsset;

type AtlasEntry = { name: string; json: string; bytes: number; scaleMode?: "nearest" | "linear" };

type BundleEntry = {
    dependsOn: string[];
    preload: "boot" | "manual";     // informational; the runtime does not act on it
    hash: string;                   // content hash: the ?v= query
    bytes: number;
    atlases: AtlasEntry[];
    assets: { [id: string]: AssetEntry };
};

type Manifest = { version: 1; dev: boolean; bundles: { [name: string]: BundleEntry } };

function ValidateManifest(json: unknown): Manifest   // throws "Invalid asset manifest: ..." 
```

`ValidateManifest` rejects: a non-object; a version other than 1 (telling you to rebuild); malformed bundles; a
`dependsOn` naming a bundle that isn't there; an asset id not prefixed by its bundle; an unknown kind; an unknown tier.

---

## Asset errors

`@logic-incubator/lib/assets/AssetErrors`.

```ts
type LoadFailure = { id: string; url: string; message: string };

class AssetLoadError extends Error {
    constructor(bundle: string, failures: LoadFailure[]);
    bundle: string;
    failures: LoadFailure[];       // every asset that failed, after retries
}

class AssetsDestroyedError extends Error { }   // the game went away mid-load, or a later call after destroy

function Suggest(name: string, candidates: string[]): string | undefined;   // nearest candidate, if a likely typo
```

Both error classes set the prototype explicitly, so `instanceof` works under the ES5 target.

---

## Loader and sound interfaces

`@logic-incubator/lib/assets/IBundleLoader` - what `Assets` needs from the thing that fetches files, so the loading rules
test against fakes.

```ts
type LoadItem =
    | { type: "atlas"; key: string; url: string; bytes: number; scaleMode?: "nearest" | "linear" }
    | { type: "image" | "data" | "binary" | "font"; key: string; url: string; bytes: number };

interface LoadResult {
    values: { [key: string]: unknown };       // image -> Texture; data -> JSON; binary -> ArrayBuffer; font -> true
    Dispose(destroyTextures: boolean): void;  // frees spritesheets, fonts and (if asked) textures
}

interface LoadOptions { baseUrl: string; query: string; retries: number; onItem?(item: LoadItem): void }
interface LoadHandle  { promise: Promise<LoadResult>; Cancel(): void }
interface IBundleLoader { Load(items: LoadItem[], options: LoadOptions): LoadHandle }

type SoundPlayOptions = { loop?: boolean; volume?: number };

interface ISoundAdapter {
    Pick(urls: string[]): string | undefined;   // first url this browser can play
    Load(alias: string, url: string): Promise<void>;
    Has(alias: string): boolean;
    Remove(alias: string): void;                // safe if absent
    Play(alias: string, options?: SoundPlayOptions): void;
    Stop(alias: string): void;
}
```

`assets/PixiBundleLoader` (`default class PixiBundleLoader implements IBundleLoader`) loads with a **fresh pixi `Loader` per
attempt**, sets `defaultQueryString` to the bundle's `v=hash`, passes `loadType: XHR, xhrType: BUFFER` for binaries and
`metadata.imageMetadata.scaleMode` for atlases, charges a child resource's failure (an atlas image, a font page) to the item that
asked for it, retries only the failed items (250 ms x attempt), and records what each item made so `Dispose` can free exactly
that. `Cancel()` destroys the loader and rejects with `AssetsDestroyedError`.

---

## PixiSoundAdapter

`@logic-incubator/lib/assets/PixiSoundAdapter` - `default class PixiSoundAdapter implements ISoundAdapter`. The only file that
imports `pixi-sound` (an optional peer dependency of lib).

| Method | Behaviour |
| --- | --- |
| `Pick(urls)` | First url whose extension (read past any `?query`) `sound.utils.supported` allows. |
| `Load(alias, url)` | `fetch`es the file, replaces any sound under `alias`, registers the bytes with `preload: true`, resolves when decoded. Rejects with `404 Not Found`-style text on a bad response. |
| `Has(alias)` / `Play(alias, options?)` / `Stop(alias)` | By alias; `Stop` ignores an unknown alias. |
| `Remove(alias)` | Removes a loaded sound at once. If it is **still being decoded**, the removal waits for the decode to finish (pixi-sound throws from its audio callback if the sound is destroyed under it). |

Requires Web Audio (the file's bytes are passed to pixi-sound as an `ArrayBuffer`).

---

## LoadingScreen

`@logic-incubator/lib/assets/LoadingScreen` - `default class LoadingScreen extends GameComponent`.

```ts
new LoadingScreen({ width: number; height: number; onRetry?: () => void })
```

A progress bar summed over every bundle's `bundle:progress`; resets on `bundle:start`; on `bundle:error` shows
`Couldn't load "<bundle>" (<n> file(s))` (plus ` - click to retry` and a click handler if `onRetry` was given).

---

## AssetFactory

`@logic-incubator/lib/loading/AssetFactory` - `default class AssetFactory`; a singleton: `AssetFactory.inst`,
`AssetFactory.Destroy()` (resets it; called by `Game.destroy`).

Makes sprites and animations from **bare names**, resolving them through the asset scope (a qualified id resolves to itself;
a name registered with `Add` resolves to itself).

| Member | Description |
| --- | --- |
| `SpriteNames: string[]` / `AnimationNames: string[]` | Bare names in scope, each once (a level's sprite hiding a global one is listed once). Cached; do not mutate. |
| `Has(name): boolean` | Resolves to a loaded sprite or animation. |
| `IsAnimation(name): boolean` | Resolves to several frames. False for an unknown name. |
| `Resolve(name): string \| undefined` | The registered key the name means. |
| `SetScope(chain: string[])` / `ScopeChain(): string[]` | The bundles searched, nearest first. Set by `Assets`. |
| `Create(name): Sprite \| AnimatedSprite` | `null` if unknown. One frame = a sprite, several = an animation. |
| `CreateSprite(name)`, `CreateAnimatedSprite(name)` | Throw `"name" is not a loaded sprite or animation` if unknown. |
| `CreateTexture(name)`, `CreateTextures(name)` | First frame / every frame. |
| `CreateFrameTexture(frameKey)` | One frame by its frame key (`knight_idle_anim_f2`), looked up bare then through the scope. Throws `No frame ...`. |
| `CreateBitmapText(fontName, size): BitmapText` | |
| `WarnMissing(name)` | `console.warn`s once per name. |
| `Add(name, frameNames, textures?)` | Registers a sprite/animation that belongs to no bundle; with `textures`, puts each in pixi's cache under its frame name. |
| `AddBundleAsset(bundle, id, frameKeys)`, `Remove(id)`, `RemoveBundle(bundle)` | Called by `Assets` as bundles load and unload. |

---

## Asset build tool

Plain Node (CommonJS), in `packages/lib/scripts/`. No transpilation: run it with `node`.

### Command line

```
node packages/lib/scripts/build-assets.js [--config <file>] [--production] [--check] [--clean] [--report]
```

| Flag | Meaning |
| --- | --- |
| `--config <file>` | The config (default `./assets.config.json`). |
| `--production` | Skip `devOnly` roots in the output and manifest (`"dev": false`). Their ids stay in the declarations. |
| `--check` | Write nothing; fail if the declarations (or a plugin's synced file) are stale. |
| `--clean` | Delete the output folder first. |
| `--report` | Print a size table per bundle. |

Exit code `0` success, `1` errors (printed first, then warnings), `2` unknown argument.

### `assets.config.json`

Paths are relative to the file. Unknown keys are an error (with a suggestion).

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `roots` | `(string \| { dir: string; devOnly?: boolean })[]` | required | Folders whose immediate sub-folders are bundles. |
| `out` | `string` | `".assets"` | Output folder: `public/` (served) and `.cache/` (atlas and file-hash caches). |
| `dts` | `string` | none | Where to write the id declarations. |
| `dtsModule` | `string` | `"@logic-incubator/lib/assets/AssetIds"` | The module the declarations augment. |
| `plugins` | `string[]` | `[]` | Plugin modules. |
| `limits` | `{ imageBytes, soundBytes, dataBytes, bundleBytes }` | 1.5 MB, 2 MB, 1 MB, 25 MB | Warn above these. (`binary` uses `imageBytes`, `font` uses `dataBytes`.) |
| `soundFormats` | `string[]` | `["ogg","m4a","mp3","wav"]` | Accepted sound extensions, most preferred first. |

### `bundle.json`

| Key | Type | Meaning |
| --- | --- | --- |
| `dependsOn` | `string[]` | Bundles loaded with this one. Must exist; cycles are errors. |
| `preload` | `"boot" \| "manual"` | Default `"boot"` for `global`, else `"manual"`. Recorded in the manifest only. |
| `ignore` | `string[]` | Globs over bundle-relative posix paths: `*` (not `/`), `**`, `?`; a glob without `/` matches the file name at any depth. |
| `overrides` | `string[]` | Sprite/animation names allowed to shadow ones in a bundle this depends on (or `global`). |
| `animPattern` | `string` | Regex source with **two groups** (animation name, frame index). Default `^(.+)_f(\d+)$`. |
| `atlas` | object | `maxSize` (4096), `padding` (0), `extrude` (1), `trim` (true), `alphaThreshold` (0), `pot` (false), `scaleMode` (`"nearest"`/`"linear"`), `sheets` (`{ [sheet]: <any of the above> }`). |
| `assets` | `{ [localName]: { tier } }` | `tier`: `"boot"` (default), `"background"`, `"lazy"`. Unknown names are an error; sprites/animations have no tier. |

### Classification and ids

See the user guide, 5.2, for the table. In short: kind by extension; `sprites/<sheet>/*.png` are frames, `sprites/<sheet>.json` + `.png` a
packed sheet; id = `<bundle>.<file name minus extension, lowercased, "-" and spaces to "_">`; frame names group into
animations by `animPattern`, which requires indices `0..N` with no gaps and no duplicates (a lone frame 0 becomes a sprite).

### Output (`<out>/public`)

```
manifest.json
<bundle>/atlases/<sheet>_<page>.json + .png     pixi 5 spritesheet JSON; frame keys "<bundle>.<frame>"
<bundle>/images|sounds|data|binary/<id-local>.<ext>
<bundle>/fonts/<id-local>.fnt + <id-local>_<page>.png
```

The manifest's atlas resource names are `~atlas.<bundle>.<sheet>.<page>`. Every write is "if changed"; orphans are deleted.

### Diagnostics

`{ level: "error" | "warning"; bundle?: string; file?: string; message: string }`. Errors: invalid names; duplicate ids; an image id
equal to a frame; animation gaps/duplicates; invalid `bundle.json` (unknown keys, bad `preload`/`tier`); missing font pages or
face; unknown/cyclic `dependsOn`; a font face used twice; invalid data JSON; a frame larger than `maxSize`; an unreadable PNG; the
same bundle in two roots; stale declarations under `--check`. Warnings: unclassified files; shadowed sprites; unused
`overrides`; oversized assets/bundles; a fully transparent frame; a data file that looks like a packed sheet.

### Programmatic API

```js
const { BuildAssets } = require("packages/lib/scripts/assets/build");

BuildAssets({ configPath, production?, check?, clean? })
// -> { ok: boolean, diagnostics: Diagnostic[], manifest: Manifest | null, dts: string | null,
//      written: string[], removed: string[], bundles: BundleModel[] }
```

Phases: scan -> classify -> plugins (`afterScan`; then re-scan) -> validate -> (check, or) pack atlases and write outputs.

Other modules in `packages/lib/scripts/assets/` (each pure except where noted): `ids` (`NormalizeLocalName`, `IsValidLocalName`,
`IsValidBundleName`, `MakeId`, `SplitId`, `ParseFrameName`, `GroupFrames`, `KindOfExtension`, `CompareKeys`, `Suggest`),
`classify` (`ClassifyBundle`, `GlobToRegExp`), `validate` (`ValidateModel`), `atlas` (`PackAtlas`, `AtlasJson`), `image`
(`TrimBounds`, `Crop`, `Blit`, `Extrude`, `NewImage`), `png` (the only pngjs user: `ReadPng`, `WritePng`), `fnt` (`ParseFnt`,
`RewritePages`), `manifest` (`StableStringify`, `Hash`), `dts` (`GenerateDts`, `IsDtsStale`), `emit`, `cache`, `scan`, `config`,
`report`.

### Plugin interface

```js
exports.afterScan = function (context) { ... }
```

| `context` field | |
| --- | --- |
| `bundles` | Classified bundle models: `{ name, dir, devOnly, dependsOn, preload, overrides, animPattern, sheets, assets, frameLocals }`; each `assets` item is `{ id, local, kind, tier, files: [{rel, ext}], frames?, face?, pages?, bytes }`. |
| `config` | The loaded config. |
| `check` | `true` under `--check`: report instead of writing. |
| `production` | `true` under `--production`. |
| `Report(level, message, bundle?, file?)` | Adds a diagnostic. |

A plugin may also export `onSpriteSaved(context)`, called by the [sprite API](#sprite-api) after a save: `{ bundle, name, isNew, category?, copyMetaFrom?, config, Report(level, message) }`
(`bundle` is the model as it was before the save).

### `AssetsWebpackPlugin`

`@logic-incubator/lib/scripts/assets/webpack-plugin` (CommonJS `module.exports`). `new AssetsWebpackPlugin({ configPath })`. Runs
`BuildAssets` on `beforeRun` and `watchRun`, with `production` = `compiler.options.mode === "production"`; logs diagnostics through
webpack's infrastructure logger; fails the compile on errors; registers each root as a context dependency. A build that fails because a file was gone for a
moment (`ENOENT`, `EBUSY`, `EPERM` or `EACCES` - an editor saving by delete-and-write, `git checkout`) is retried up to three times, 250 ms apart,
rather than failing the compile (a failed watch compile leaves the dev server waiting until something else changes); any other error fails at once. Outside `production` mode it also mounts
the [sprite API](#sprite-api) at `/__sprite-api` on the dev server (added to any `devServer.setupMiddlewares` the game has); `{ spriteApi: false }`
leaves it out.

### Sprite API

`packages/lib/scripts/assets/sprite-api.js` - what the in-game sprite editor talks to. `AssetsWebpackPlugin` mounts `CreateSpriteApi({ configPath })`
at `/__sprite-api` on the dev server (not in `production` mode; `spriteApi: false` disables it). Plain Node; the planning functions take the loaded
config, so tests run them on a temp folder with no server.

| Request | Response |
| --- | --- |
| `GET /list` | `{ bundles: [{ name, sheets, packedSheets, names }] }` - the editable bundles (not `devOnly`), their sheet folders and pre-packed sheets, and every asset name in them. |
| `GET /sprite?bundle=&name=` | `{ bundle, name, kind, frames, sheet, dir, editable, reason }` - `editable` is false (with a `reason`) for a pre-packed or dev-only sprite. |
| `GET /frame?bundle=&name=&index=` | The frame's source PNG (`image/png`). |
| `POST /save` | Body `{ bundle, name, mode: "overwrite" \| "create", sheet?, category?, copyMetaFrom?, frames: [base64 PNG...] }` -> `{ ok, bundle, name, kind, frames, width, height, written, removed, changed, notes }`. |

Errors are `{ error, details? }` with `400` (bad request), `403` (refused or a dev-only bundle), `404`, `409` (the name is taken), `413` (over 48 MB),
`422` (can't be edited, or the bundle would be left with an error) or `500`.

Every request must come from loopback, with a `localhost` `Host`, no foreign `Origin`, and the header `X-Sprite-Editor: 1`; the service never answers a
CORS preflight. `RefuseRequest(req)` is the check (exported for tests).

Exports: `CreateSpriteApi`, `ListBundles(config)`, `DescribeSprite(config, bundle, name)`, `ReadFrame(config, bundle, name, index)`, `ParseSaveRequest(body)`,
`PlanSave(config, request)` (works out the files to write and remove, and re-classifies the bundle as it would be - throws an `ApiError` if that adds an
error), `ApplySave(plan)` (writes new files through dot-named temp files, then removes old ones), `SaveSprite(config, body)` (all of those, then each
plugin's `onSpriteSaved`), `RefuseRequest`, `ApiError`, `MAX_FRAMES` (100), `MAX_SIZE` (512), `DEFAULT_SHEET` (`"user"`).

`ids.js` gained the naming rules the service and the editor share: `SpriteNameProblem(name)` (a message, or `null`), `FrameFileNames(name, count)` and
`MAX_SPRITE_NAME`. `build.js` exports `ScanAndClassify`, whose models now also carry `files` and `rawConfig`.

---

## Keyboard

`@logic-incubator/lib/io/Keyboard` - `default class Keyboard extends EventEmitter`; `game.keyboard`. Takes over
`document.onkeydown`/`onkeyup`.

| Member | Description |
| --- | --- |
| events `"keydown"`, `"keyup"` | `(event: KeyboardEvent)` |
| `KeyPressed(keycode: number): boolean` | The key is down. |
| `AnyKeyPressed(): boolean` | |
| `KeyPressedMinTime(ms: number, keycode: number): boolean` | `true` once, then not again for `ms` while held. |
| `Destroy(): void` | Releases the document handlers (only if still its own), listeners, state. Safe twice. |

`export const enum Key` - legacy `keyCode` values: `Backspace=8`, `Tab`, `Enter=13`, `Shift`, `Ctrl`, `Alt`, `Escape=27`,
`Space=32`, `PageUp`..`Home`, `LeftArrow=37`, `UpArrow`, `RightArrow`, `DownArrow=40`, `Insert`, `Delete`, `Zero`..`Nine` (48-57),
`A`..`Z` (65-90), `Numpad0`..`Numpad9` (96-105), `Multiply`, `Add=107`, `Subtract=109`, `DecimalPoint`, `Divide`, `F1`..`F12`
(112-123), `NumLock`, `ScrollLock`, `SemiColon`, `Equals`, `Comma`, `Dash`, `Period`, `ForwardSlash`, `Tilde`, `OpenBracket`,
`ClosedBracket`, `Quote`, plus aliases (`Hash`, `Star`, `UnderScore`, `PlusSign`, ...).

---

## GamePad

`@logic-incubator/lib/io/GamePad` - `default class GamePad extends EventEmitter`; `game.gamePad`. Uses the Gamepad events, or
polls every 500 ms where unsupported. `enum GamePadEvents { CONNECTED = "connected", DISCONNECTED = "disconnected" }` (argument:
the controller index).

| Member | Returns / notes |
| --- | --- |
| `controllers: Gamepad[]` | By index; `null` for disconnected. |
| `IsConnected()` | Any controller. |
| `GetButton(controller, button)` | `{ touched, pressed, value } \| null`. A shared, reused object. |
| `GetButtonMinTime(ms, controller, button)` | The button once per `ms` while fully pressed, else `null`. |
| `GetStick(controller, stick, threshold)` | `Vec2 \| null` (shared). Stick N reads axes 2N and 2N+1; `null` if no controller or too few axes. Components under `threshold` are zeroed - so a stick at rest still returns a (zero) vector. |
| `GetStickDirection(controller, stick, threshold)` | `Direction \| null` (`"none"` at rest). |
| `GetDPad(controller)` | `Direction \| null`; reads axis 9 (as some controllers report it). |
| `Destroy()` | Stops listening/polling. Safe twice. |

Logs connect/disconnect details to the console.

---

## VirtualJoystick

`@logic-incubator/lib/io/VirtualJoystick` - `default class VirtualJoystick` (wraps nipplejs).

`Create(options?: JoystickManagerOptions): void` - adds a joystick (ids are creation order). `GetDirection(id: number): Direction` -
`"none"` below force 0.6, else the stick's angle direction. `Destroy()` removes them all.

---

## Storage and Url

`@logic-incubator/lib/io/Storage`:

```ts
SaveTextFile(fileName: string, output: string): boolean            // triggers a download; false if the File API is missing
LoadTextFile(file: File): Promise<string>
SaveToLocalStorage(key: string, data: string): boolean
LoadFromLocalStorage(key: string): string | null
FileAPISupported(): boolean
ShowOpenFileDialog(): Promise<FileList>                             // rejects if none chosen
```

`@logic-incubator/lib/io/Url`: `GetExtension(url): string` (with the dot), `RemoveExtension(url): string`,
`ImageSequenceIndex(url): number`, `GetNextInImageSequence(url): string | null` - helpers for numbered image sequences.

---

## Tween and Easing

`@logic-incubator/lib/tween/Tweener` - driven by `Ticker.shared`.

```ts
function Tween<T extends object>(target: T, to: Partial<Record<keyof T, number>>, ms: number,
                                 easing?: EasingFunction, onComplete?: () => void): Cancel

function TweenWithOptions<T extends object>(target: T, to: Partial<Record<keyof T, number>>, ms: number,
                                            options?: TweenOptions): Cancel

interface TweenOptions {
    easing?: EasingFunction;     // default Easing.Linear
    pingPong?: boolean;          // play back to the start values; each leg takes `ms`
    repeat?: number;             // extra plays; Infinity loops; default 0
    onComplete?: () => void;     // after the last play (never with Infinity)
    onRound?: () => void;        // after every play, including the last
}
```

Values are read from `target` when the tween starts and written each tick. `ms <= 0` applies the end values at once. The returned
`Cancel` stops the tween where it is.

`@logic-incubator/lib/tween/Easing`:

```ts
type EasingFunction = (t: number) => number     // 0..1 -> eased progress
const Easing: {
    Linear: EasingFunction;
    Quad | Cubic | Quart | Quint | Sine | Expo | Circ | Back | Bounce | Elastic: { In, Out, InOut: EasingFunction };
}
```

---

## Math

`@logic-incubator/lib/math/Geometry`:

```ts
type Vec2Like = { x: number; y: number };   type Vec3Like = { x; y; z };   type RectangleLike = { x; y; width; height };

class Vec2 {
    constructor(x = 0, y = 0);   x; y;
    get length(): number;        get normalized(): Vec2Like;
    IsZero(): boolean;
    Set(x: number, y?: number): Vec2;       // y defaults to x
    Offset(x: number, y?: number): Vec2;
    Copy(point: Vec2Like): void;   Clone(): Vec2;
    Equals(point: Vec2Like): boolean;   Equals(x: number, y: number): boolean;
}

class Rectangle {
    constructor(x = 0, y = 0, width = 0, height = 0);
    left top right bottom, topLeft topRight bottomLeft bottomRight, centerLeft centerTop centerRight centerBottom center   // getters
    Set(x, y, width?, height?): Rectangle;   Offset(x, y): Rectangle;
    Contains(px, py): boolean;   ContainsPoint(p: Vec2Like): boolean;
    Equals(rect: RectangleLike): boolean;   Copy(rect): void;   Clone(): Rectangle;
}
```

`@logic-incubator/lib/math/Utils`: `Sign(v)`, `CeilN(v)` (ceil of the magnitude, keeping the sign), `Lerp(start, end, amt)`,
`UpperLimit(v, limit)` (clamp magnitude), `LowerLimit(v, limit)` (zero below the limit), `Truncate(n, digits)`.

---

## Store

`@logic-incubator/lib/patterns/redux/Store` - `default abstract class Store<T extends object, U>`.

```ts
interface IAction<U> { type: number | string; data?: U; canUndo?: boolean }

constructor(maxUndo = 0)
state: T;   prevState: T                       // getters
Subscribe(callback: (prev: T, state: T) => void, context: any): () => void     // returns the unsubscribe
Dispatch(action: IAction<U>): void             // pushes undo if action.canUndo; notifies if the reducer returned a new object
Load(state: T): void;   LoadJSON(json: string): void;   SerializeJSON(): string
Undo(): void                                   // no-op if maxUndo is 0 or nothing to undo
protected abstract DefaultState(): T
protected abstract Reduce(state: T, action?: IAction<U>): T      // pure: return the same object for "no change"
```

Notification iterates a copy of the subscribers, so unsubscribing during a notification is safe.

---

## Patterns, algorithms, data structures

| Module | API |
| --- | --- |
| `patterns/ObjectPool` (`default`) | `new ObjectPool<T>(initialSize, ctor: () => T, reset?: (item: T) => void)`; `Get(): T`; `Put(item)`; `RestoreAll()` (resets and returns every popped item); `Popped: T[]` |
| `patterns/EnumerateTypes` | `AddTypes<T>(...values: T[]): T`, `SubtractTypes`, `MultiplyTypes` - element-wise over objects of numbers |
| `patterns/FunctionUtils` | `Memoize(fn)` (caches on the first argument), `NullFunction()` |
| `algorithms/PathSearch` | `interface ISearchGraph<T> { data: T[][]; GetAdjacent(node): SearchNode[] }`; `abstract class SearchNode { parent; position: Vec2Like; visited; abstract CheckValid(): boolean }`; `FindShortestPath(graph, start, end): Vec2Like[]`; `FindClosestNode(graph, position, nodes)`; `BredthFirstSearch(graph, start, end)`; `GetPath(node, pathInOut?)` |
| `datastructures/Queue` | `class Queue<T>`: `Queue.Create<U>(capacity?)`; `Queue(item)` (drops the oldest past capacity); `Dequeue()`; `Count()`; `Read(): T[]` |

---

## Utils and filters

| Module | API |
| --- | --- |
| `utils/Types` | `type Direction = "up" \| "down" \| "left" \| "right" \| "none"`; `type RGB = { r, g, b }`; `type Dictionary<T> = { [id: string]: T }` |
| `utils/StatsTicker` | `class StatsTicker extends Ticker` - a ticker that shows a stats.js panel (removed on `destroy`) |
| `utils/Debug` | `MakeDraggable(displayObject)`, `MoveWithArrowKeys(displayObject)` (log positions to the console; dev aids) |
| `filters/OverlayBlendFilter` | `class OverlayBlendFilter extends Filter`; `new OverlayBlendFilter(backdrop: Sprite)` - blends the filtered layer against the backdrop sprite's texture with a real overlay blend; only the backdrop's own texture is read |

---

## Tilemap

`@logic-incubator/lib/tilemap` - vendored `@pixi/tilemap` 3.2.1 for pixi 5.2.1; see `packages/lib/src/tilemap/README.md` for the changes
(bug fixes, per-tile tint and flicker, container alpha).

Exports: `CompositeTilemap`, `Tilemap`, `TileOptions`, `TilemapShader`, `TilemapGeometry`, `TileRenderer`, `TextileResource`, `settings`.

`CompositeTilemap extends Container`:

| Member | |
| --- | --- |
| `new CompositeTilemap(tileset?: BaseTexture[])` | |
| `tile(texture: Texture \| string \| number, x: number, y: number, options?: TileOptions): this` | Adds a tile (a texture, a texture key, or an index into the tileset). |
| `clear(): this` | Removes all tiles. |
| `tileset(textures: BaseTexture[]): this` | |
| `tileRotate(rotate)`, `tileAnimX(offset, count)`, `tileAnimY(offset, count)`, `tileAnimDivisor(d)`, `tileTint(tint)`, `tileFlicker(intensity, seed?)` | Change an option of the **last added** tile (chainable): `map.tile(t, x, y).tileTint(0xff0000)`. |

`TileOptions`: `u`, `v`, `tileWidth`, `tileHeight`, `animX`, `animY`, `animCountX`, `animCountY`, `animDivisor`, `rotate`, `alpha`,
`tint` (packed RGB, default `0xffffff`), `flicker` (0..1, GPU-animated), `flickerSeed`.

`settings`: `TEXTURES_PER_TILEMAP` (16), `TEXTILE_DIMEN` (1024), `TEXTILE_UNITS` (1), `TEXTILE_SCALE_MODE`, `use32bitIndex` (false), `DO_CLEAR` (true).
Do not change after the renderer has initialised.

---

# engine

## Constants and events

`@logic-incubator/engine/Constants`:

| Name | Value | |
| --- | --- | --- |
| `GameWidth`, `GameHeight` | 1280, 720 | The canvas the engine is designed for. |
| `HudWidth` | 320 | Width of the HUD column on the right. |
| `PlayWidth` | `GameWidth - HudWidth` (960) | Where gameplay renders. |
| `TileSize` | 16 | Pixels per tile. |
| `AnimationSpeed` | 0.2 | Animated-tile speed. |
| `PlayerSpeed` | 0.8 | |
| `const enum Scenes` | `GAME = "game"`, `EDITOR = "editor"` | The engine's own scene ids. |

`@logic-incubator/engine/Events` - string constants emitted on `game.dispatcher`:

| Constant | Value | Arguments |
| --- | --- | --- |
| `LEVEL_LOADED` | `"levelloaded"` | - |
| `LEVEL_CREATED` | `"levelCreated"` | - |
| `CAMERA_MOVED` | `"cameraMoved"` | - |
| `PLAYER_DAMAGED` | `"playerDamaged"` | `(damage, hitPointsLeft)` |
| `PLAYER_DIED` | `"playerDied"` | - |
| `MONSTER_KILLED` | `"monsterKilled"` | `(type, x, y)` |
| `SPAWNER_DESTROYED` | `"spawnerDestroyed"` | `(spawner)` |

---

## DungeonMain

`@logic-incubator/engine/DungeonMain` - `class DungeonMain extends GameComponent`; add it as `Scenes.GAME`.

```ts
type PlayerSetup = {
    sprite: string;                                       // animation name
    hitPoints: number;                                    // half-hearts
    hearts: { full: string; half: string; empty: string };// sprite names
    weapons: WeaponDef[];                                 // the first is equipped; fired while a fire direction is held
};

type DungeonMainOptions = {
    player: PlayerSetup;
    level: () => LevelFile | undefined;                   // asked on every start and restart
    levelBundle?: () => string | undefined;               // the asset bundle the level plays in
    playerSprite?: () => string | undefined;              // the animation to draw the player with, in place of player.sprite
};

new DungeonMain(options: DungeonMainOptions)
```

`playerSprite` is asked for each time a level starts (on `LEVEL_CREATED`, before the player is reset): when it returns an animation
name the player is drawn with that (`Player.SetSprite`), otherwise with `player.sprite`. It is how a game lets the player pick a character.

Lifecycle: `OnInitialise` builds the `Level`, attaches `Camera`, `TileMapView` and `Hud`, creates `Player`, `EntityRenderer` and
`Encounter`, binds asset metadata (`BindAssetMetadata`) and listens for `LEVEL_CREATED` / `PLAYER_DIED`. `OnShow` and each restart
(1.5 s after `PLAYER_DIED`) call `Reload`: prepare the assets (`LevelAssets.Prepare` - refresh dev metadata, then
`UseLevelBundle(levelBundle())`), then `Level.LoadLevel(level())` unless the scene was destroyed meanwhile. `OnDestroy` destroys the
player, disposes the level and releases the level bundle (when `levelBundle` was given).

---

## Level

`@logic-incubator/engine/level/Level` - `default class Level`. Built by `DungeonMain`; `LoadLevel` fills it.

```ts
type Tile = Brush & { texture: Texture; anim?: AnimatedSprite };
type Door = { cells: Vec2Like[]; tile: Tile; isOpen: boolean; regionIds: number[]; openSprite: string; closedSprite: string; lockId: number };
type Pickup = Vec2Like & { tile: Tile | null; value: PickupValue };      // tile is null for a PICKUP brush on an empty cell
type CollectedPickup = { value: PickupValue; sprite: string | null };    // sprite = the tile it was, for an item or key with none of its own
```

| Field | Type | |
| --- | --- | --- |
| `levelData` | `Tile[][][][]` | `[layer][x][y]` -> tiles at that cell, in paint order. |
| `tileLayers` | `LevelLayer[]` | Drawn in order. |
| `collisionData` | `boolean[][]` | Per cell: a `collidable` tile or the `collision` brush. |
| `heightData` | `number[][]` | From the `z-index` brush. |
| `lightData` | `BakedLight[][]` | Baked from lights. |
| `doorData`, `doors` | | Door footprints and the doors found. |
| `doorVersion` | `number` | Goes up each time a door opens or closes - how anything worked out from which doors are closed (the monsters' flow field) knows it's stale. |
| `regionData`, `boundaryRegionData`, `regions`, `visibleRegions` | | Region analysis; see below. |
| `boundRect` | `Rectangle` | The map's bounds in cells. |
| `playerStartPosition` | `Vec2Like \| undefined` | |
| `spawners`, `pickups`, `depths` | | |

| Method | Description |
| --- | --- |
| `LoadLevel(file: LevelFile): void` | Builds everything from a level file (and the metadata store). Unknown sprite names drop just their tiles, with a one-off warning. Emits `LEVEL_LOADED`. |
| `Dispose(): void` | Stops animated tiles' sprites. |
| `HeightAt(x, y): number` | |
| `IsSolid(x, y): boolean` | A wall, a spawner, or anywhere off the map. Not a closed door - the player walks onto one to open it. |
| `IsDoorClosed(x, y): boolean` | Whether the cell belongs to a door that is closed right now. Monsters can't enter one (their path and their movement both stop at it); the player can. A door with no sprite pair to swap never opens, so isn't in `doors` and doesn't count. |
| `RemoveSpawner(spawner)` | Opens a destroyed spawner's cells. |
| `IsDoorLocked(x, y, canOpen): boolean` | A closed door that doesn't open for the player (`canOpen(lockId)` says whether a lock does: it's unlocked, or they hold its key) - what their collider treats as a wall. A closed door that opens for them isn't: they walk onto it to open it. |
| `CollectPickupsAt(x, y): CollectedPickup[]` | Collects and hides every pickup at the cell; the caller applies them. |
| `LightAt(x, y): BakedLight` | |
| `UpdateDoors(x, y, canOpen?)` | Opens/closes doors by the player's tile (call each frame) - a door opens only if `canOpen(door.lockId)` (with none given, every door does - so with the player's keys, an unlocked door always does); bumps `doorVersion` for each that changes. |
| `UpdateVisibleRegions(x, y)` | Recomputes which regions are reachable through open doors (call after `UpdateDoors`). |
| `IsCellVisible(x, y): boolean` | |

---

## Level file format

`@logic-incubator/engine/level/LevelFormat` - types and one enum; no runtime imports.

```ts
const enum DataBrushName { PLAYER_START = "player-start", COLLISION = "collision", Z_INDEX = "z-index", PICKUP = "pickup" }
type DataBrushValue = number | LightValue | SpawnerValue | PickupValue | DoorLockValue;

type Brush = {
    name: string;            // a bare sprite/animation name, or a DataBrushName
    position: Vec2Like;      // map cells
    pixelOffset: Vec2Like;
    rotation: number;
    scale: Vec2Like;
    layerId: number;
    data: DataBrushValue;    // null on a tile unless it overrides a light/spawner value
};

type LevelLayer = { id: number; name: string; isData: boolean };

type LevelFile = {
    editorData: { layers: LevelLayer[] };
    levelData: { levelData: Brush[] };
};
```

---

## Asset metadata

`@logic-incubator/engine/level/AssetMetadata`:

```ts
type DoorValue = { id: number; open: boolean };
const AssetCategories: readonly [
    { id: "dungeon"; name: "Dungeon" }, { id: "entities"; name: "Entities" }, { id: "weapons"; name: "Weapons" },
    { id: "items"; name: "Items" }, { id: "misc"; name: "Misc" }, { id: "user"; name: "User" },
];                                                  // the editor palette's tabs, in order
type AssetCategory = "dungeon" | "entities" | "weapons" | "items" | "misc" | "user";
const DefaultAssetCategory: AssetCategory = "misc";   // where a sprite with no category is listed
IsAssetCategory(value: unknown): value is AssetCategory

type AssetMetadata = {
    category?: AssetCategory;   // which editor palette tab lists this sprite; no effect in play
    collidable?: boolean;
    door?: DoorValue;
    light?: LightValue;
    spawner?: SpawnerValue;
    pickup?: PickupValue;
};
type AssetMetadataMap = { [assetName: string]: AssetMetadata };
```

`default class AssetMetadataStore` - singleton (`AssetMetadataStore.inst`, `AssetMetadataStore.Destroy()`).

| Method | Description |
| --- | --- |
| `Add(bundle, map)` | Adds or replaces a bundle's metadata. A `light` that isn't complete (`brightness`, `tint`, `range`, all finite numbers) or a `category` that isn't one of `AssetCategories` is dropped with a console warning naming the asset; the entry's other fields are kept. |
| `Remove(bundle)` | |
| `SetScope(chain: string[])` | The bundles searched, nearest first (then the unscoped bucket). |
| `Load(map)` | Replaces everything with one unscoped map - for a game or test with metadata but no bundles. |
| `Get(assetName): AssetMetadata \| undefined` | First hit through the chain. |
| `CategoryOf(assetName): AssetCategory` | The asset's `category` through the chain, else `misc`. |
| `GetDoorPartner(assetName): string \| undefined` | The other half of a door pair (same `door.id`, opposite `open`), searched first in the bundle that defines this half. |

`@logic-incubator/engine/level/AssetMetadataBinding`:

```ts
function BindAssetMetadata(assets: Assets, store: AssetMetadataStore): AssetMetadataBinding
interface AssetMetadataBinding { Refresh(): Promise<void>; Dispose(): void }
```

Keeps the store in step with the bundles: a bundle's `<bundle>.assets_meta` data asset is added on `bundle:complete` (and for bundles
already loaded when bound), removed on `bundle:unloaded`, re-added on `asset:reloaded`; the store's scope follows `scope:changed`.
`Refresh` reloads every bound metadata file (dev). `Dispose` unsubscribes and removes what it added.

`@logic-incubator/engine/level/LevelAssets` - `default class LevelAssets`: `new LevelAssets(host: { IsReady; IsDev; UseLevelBundle(...) },
metadata: { Refresh() })`; `Prepare(bundle: string | undefined): Promise<boolean>` - in a dev build refreshes metadata first (failures ignored),
then `UseLevelBundle`; resolves `false` (quietly if the game was destroyed, with a `console.error` otherwise) when the level can't be built;
`true` if the game has no asset bundles at all.

---

## Lighting

`@logic-incubator/engine/level/Lighting` (pure):

```ts
type LightValue = { brightness: number; tint: number; range: number };
type LightSource = Vec2Like & { value: LightValue };
type BakedLight = { brightness: number; tint: number };

const AMBIENT_LIGHT = 0.3;          // brightness of a cell no light reaches
const AMBIENT_TINT = 0xffffff;

IsLightValue(value): value is LightValue            // loose: an object with "range"
IsCompleteLightValue(value): value is LightValue    // strict: all three finite numbers
BakeLighting(lights: ReadonlyArray<LightSource>, width: number, height: number): BakedLight[][]
```

`BakeLighting`: peak brightness is clamped to [0, 1]; linear falloff to `range` tiles (floored at the ambient level); overlapping lights keep the
brighter one and its tint (no colour blending); no occlusion.

---

## Depth

`@logic-incubator/engine/level/Depth` (pure; height is visual only):

`BaseZScale` (1), `ZScaleRatio` (1.04), `ZFadeStep` (0.1), `MinZFade` (0.05), `CameraZoomRatio` (1.08), `MaxCameraZoom` (2), `MinCameraZoom` (0.4),
`ZoomSettleDelay` (0.1), `ZoomSettleSpeed` (0.75); `ZScale(z)`, `CameraZoom(z)`, `ZBandAlpha(z, playerZ)`, `type ZoomState = { value, z }`,
`StepZoom(state, z, heldTime, dt): ZoomState`, `HeightAt(heightData, x, y)`, `IsHeightGap(z1, z2): boolean` (a step of more than one height is blocked).

---

## Doors, regions and other level helpers

Pure helpers behind `Level`; exported for tests and tooling.

| Module | Exports |
| --- | --- |
| `level/Doors` | `FindDoorGroups(doorIds): Vec2Like[][]` (connected islands of door cells), `DoorFootprint(anchor, spriteSize, offset, tileSize): Vec2Like[]` (the cells a sprite drawn top-left on a cell covers) |
| `level/Regions` | `type Region = { id; cells }`, `type RegionMap`, `FindRegions(...)` (connected walkable components), `RegionIdsTouching(...)` |
| `level/ImplicitData` | `EffectiveLight(brush, meta)`, `EffectiveSpawner(brush, meta)` (a placement's override else the sprite's default), `FindImplicitPlacements(...)`, `OrphanedExplicitData(...)` |
| `level/MapBounds` | `type MapBounds`, `FindMapBounds(brushes)` |
| `level/TileCollision` | `default class TileCollision` - `new TileCollision(level, blocked?)`; `TestX(from, dir)`, `TestY(from, dir)`: the corrected position on a collision, else `null`. `blocked(x, y)` names extra cells that count as solid for that collider (asked live) - `Encounter` gives its monsters' collider the closed doors, while the player's has none |
| `view/helpers/PlayerMovement` | `MoveDamping`, `CentreTile(position)`, `BoxCentre(position)`, `ResolveMove(...)`, `interface MoveCollider` |
| `view/helpers/CameraWindow` | `ViewOrigin(centre, baseWidth, baseHeight, zScale)` |
| `view/helpers/SpriteDrawOffset` | `SpriteDrawPosition(position, viewOffsetTiles, texture)` (feet on the bottom of a monster's one-tile box, centred across it) |

---

## Monsters

`@logic-incubator/engine/level/entities/MonsterRoster` (pure):

```ts
type MonsterType = string;

interface MonsterDef {
    idle: string;               // animation standing still (also its picture in the editor's spawner dialog)
    run: string;                // animation while moving (same as idle for a single loop)
    hitPoints: number;
    speed: number;              // a multiple of the player's
    contactDamage: number;      // half-hearts per touch; 0 = harmless
    contactCooldown: number;    // seconds between touches from one monster
    ranged?: Weapon;            // shoots at a visible player within `range` tiles
    behaviour: () => IMonsterBehaviour;   // called once per monster spawned
}

interface IMonsterRoster<T extends MonsterType = MonsterType> {
    types: ReadonlyArray<T>;                  // listing order in the editor
    defaultPool?: ReadonlyArray<T>;           // a new spawner's pool (default: the first type)
    defs: { readonly [K in T]: MonsterDef };
    spawnerSprite?: string;                   // drawn over a spawner; its size sets the solid footprint
}
```

`default class MonsterRoster` - singleton (`inst`, `Destroy()`): `Load(roster)`, `Types`, `DefaultPool`, `SpawnerSprite`, `Has(value): value is MonsterType`,
`Def(type)`, `IdleAnimation(type)`. Load it before the editor or any level is created.

## Behaviours

`@logic-incubator/engine/level/entities/Behaviours` (pure):

```ts
type MonsterContext = {
    position: Vec2Like;       // top-left of the monster's one-tile box, pixels
    tile: Vec2Like;           // the cell under its centre
    player: Vec2Like;
    flow: IFlowField;         // walking distances to the player
    tileSize: number;
    dt: number;               // seconds since the last frame
    random: () => number;     // [0, 1)
};
interface IMonsterBehaviour { Steer(context: MonsterContext): Vec2Like }   // length 0 (still) .. 1 (full speed)

class Chase implements IMonsterBehaviour
class Wander implements IMonsterBehaviour       // new Wander({ aggroRange = 5, turnEvery = 1.5, pace = 0.5 }): amble, then chase for good once the player is within aggroRange tiles' walk
class KeepDistance implements IMonsterBehaviour // new KeepDistance({ range = 5, slack = 1.5 }): hold ~range tiles' walk away
FollowFlow(context): Vec2Like                   // down the flow field (straight at the player within a tile)
Toward(from, to): Vec2Like                      // unit vector
Separation(index, positions, radius): Vec2Like  // a push away from neighbours so a crowd spreads out
```

`@logic-incubator/engine/level/entities/FlowField`: `UNREACHABLE = -1`; `interface IFlowField { DistanceAt(x, y); NextCell(x, y); AwayCell(x, y) }`;
`default class FlowField implements IFlowField` - `new FlowField(width, height, isSolid, isHeightGap?)`, `MarkDirty()`, `Update(targetX, targetY): boolean`.

## Spawners

`@logic-incubator/engine/level/entities/Spawners` (pure):

```ts
type SpawnerValue = {
    monsters: MonsterType[];     // pool; one is picked at random per spawn
    interval: number;            // seconds between spawns
    maxAlive: number;            // cap on this spawner's live monsters
    total: number;               // monsters before going dormant; 0 = unlimited
    activationRange: number;     // only while the player is within this many tiles; 0 = always
    hitPoints: number;           // damage to destroy it; 0 = indestructible
};
type Spawner = Vec2Like & { value: SpawnerValue; cells: Vec2Like[] };
type SpawnerState = { spawner; countdown; alive; produced; hitPoints; destroyed };

DefaultSpawnerValue(): SpawnerValue         // pool = the roster's default; interval 3, maxAlive 4, total 0, activationRange 10, hitPoints 10
IsSpawnerValue(value): value is SpawnerValue
SanitiseSpawnerValue(value): SpawnerValue   // drops unknown monsters, floors numbers at 0, fills defaults
SpawnerCells(anchor, spriteSize | undefined, tileSize): Vec2Like[]   // the solid footprint
```

plus `CreateSpawnerState` and `StepSpawner` (used by `Encounter`).

## Projectiles

`@logic-incubator/engine/level/entities/Projectiles` (pure):

```ts
type ProjectileOwner = "player" | "monster";
type ShotSetup = { sprite: string; spriteAngle?: number; speed: number; damage: number; range: number };   // speed px/frame; range in tiles
type Weapon = ShotSetup & { cooldown: number };            // seconds between shots
type WeaponDef = { icon: string; shot: Weapon };           // icon = the HUD weapon slot
type Projectile = { x, y, vx, vy, owner, damage, sprite, spriteAngle?, range, dead };

CreateProjectile(from, direction, shot, owner, tileSize): Projectile
StepProjectile(projectile, dt, isBlocked, tileSize): Vec2Like | null    // the blocking cell it hit, else null
ProjectileBox(p), ContactBox(position, tileSize), SpriteBox(position, size, tileSize), Overlaps(a, b)
ProjectileSize = 6;  ContactInset = 2
```

## Player state

Pure modules under `level/entities/`:

| Module | API |
| --- | --- |
| `Health` | `type Health = { hitPoints, max, invulnerable }`; `InvulnerableTime = 1`; `CreateHealth(max)`, `IsDead(h)`, `DamageHealth(h, damage, invulnerableTime?): boolean` (false while invulnerable/dead), `HealHealth(h, amount): boolean` (restores up to the maximum; nothing for the dead), `TickHealth(h, dt)` |
| `Gold` | `type Gold = { amount }`; `CreateGold()`, `AddGold(gold, amount)` (never below 0) |
| `Inventory` | `InventorySize = 8`; `type Inventory = { slots: (string \| null)[] }`; `CreateInventory()`, `AddItem(inventory, sprite): boolean` |
| `Pickups` | `type PickupValue = { kind: "gold"; amount } \| { kind: "health"; amount } \| { kind: "key"; id } \| { kind: "weapon"; weapon: WeaponDef } \| { kind: "item"; sprite? }` (an item with no `sprite` is shown as its own tile); `PickupKinds`; `IsPickupValue(v)` (strict: a known kind with the fields it needs, finite numbers, a key id that's a whole number from 0 - also what tells a pickup from a light or spawner in a tile's `data`); `DefaultPickupValue(kind?)` |
| `Keys` | `NoLock = -1` (the lock of an unlocked door - every door by default - which opens for anyone, key or no key); `IsLocked(lock)` (0 and up); `type KeyRing = { keys: { id, sprite }[] }`; `CreateKeyRing()`, `AddKey(ring, id, sprite?): boolean` (false if that id is already held), `CanOpen(ring, lock): boolean` (the lock is `NoLock`, or a key with that id is held). There is no key that opens everything |

---

## Encounter

`@logic-incubator/engine/Encounter` - `default class Encounter` (no pixi). Everything alive besides the player.

```ts
new Encounter(level: EncounterLevel, options: EncounterOptions)

type EncounterOptions = {
    emit: (event: string, ...args: unknown[]) => void;           // the game's dispatcher
    sizeFor: (name: string) => { width: number; height: number } | undefined;   // a sprite's pixel size
    random?: () => number;
};
```

| Member | |
| --- | --- |
| `monsters: Monster[]`, `projectiles: Projectile[]`, `spawners: SpawnerState[]`, `spawnerFlash: Map` | State. |
| `Flow: FlowField` | Walking distances as of the last `Update`. |
| `Reset()` | Starts over from the level's spawners (call on every `LEVEL_CREATED`). |
| `Fire(from, direction, shot, owner)` | Adds a projectile. |
| `Update(dt, seconds, player: EncounterPlayer)` | One frame: `dt` in frames (movement), `seconds` for timers. |

Constants `MaxMonsters = 150`, `HitFlashTime = 0.15`. `EncounterLevel` and `EncounterPlayer` are the narrow interfaces it needs of `Level` and `Player`.

**Closed doors.** A monster can't enter a closed door (`Level.IsDoorClosed`). The flow field treats those cells as blocked, so a monster behind one has no path to the player (`DistanceAt` is `UNREACHABLE`: chasers hold still, wanderers keep wandering, and a spawner with an `activationRange` stays inactive); and the monsters' collider treats them as solid, so one steered at a door by a wander heading or another monster's push is stopped too. The field is recomputed when `Level.doorVersion` changes, not just when the player changes cell. Spawn cells are never closed-door cells. A monster a door shuts on (its box overlaps a closed-door cell) is walked out of it, whichever side it's nearer, using a collider that doesn't count the door's cells as solid - it can neither be trapped in the door nor slip through to the player. The player is unaffected - standing in a door is what opens it, and while they do the monsters can come through.

---

## Views

| Class | Module | Summary |
| --- | --- | --- |
| `Camera extends GameComponent` | `view/Camera` | `ViewRect`, `Scale`, `ScaledTileSize`, `Zoom`, `BaseViewWidth/Height`, `CurrentZ`, `EffectiveZoom`; `Move(x, y)`, `CenterOn(x, y)`, `Follow(pixelX, pixelY, amount)`, `SetZ(z)`, `UpdateZoom(dt)`. Emits `CAMERA_MOVED`. `new Camera(cameraControl?)`. |
| `TileMapView extends GameComponent` | `view/TileMap` | `new TileMapView(level, camera)`. Builds the tile layers, lit and banded by height, plus the `EntitiesLayer` (`"entities"`) and `ProjectilesLayer` (`"projectiles"`) containers; `LightTint(light)`, `TileGD8Rotation(rotation, scaleX, scaleY)`. Emits `LEVEL_CREATED`. |
| `Player` | `view/Player` | `new Player(camera, collision, level, setup)`; `Position`, `Centre`, `Tile`, `Texture`, `FacingX`, `Health`, `Gold`, `Inventory`, `Keys`, `EquippedWeapon`; `HasKeyFor(lockId)`, `IsLockedOut(x, y)` (a closed door they've no key for - what `DungeonMain` gives their collider); `Reset(startPosition)` (throws if the level has no player start), `SetSprite(animation)` (draw the player with another animation, keeping their position; a no-op for the one already in use), `Update(dt, seconds)` (input, movement, camera, doors, regions, pickups), `TakeShot(): Vec2Like \| null`, `Damage(n): boolean`, `Destroy()`. |
| `Hud extends GameComponent` | `view/Hud` | `new Hud(setup.hearts)`; `Render(health, gold, weaponIcon, inventory, keys)` - the keys panel shows each key's sprite and its id. Warns once per missing heart sprite. |
| `EntityRenderer` | `view/EntityRenderer` | `new EntityRenderer(camera, level)`; `Reset()` (call on `LEVEL_CREATED`), `Render(player, encounter)`. |

## Player input

`@logic-incubator/engine/input/PlayerControl`:

```ts
interface IPlayerInput {
    direction: Vec2;      // movement
    firing: boolean;      // Space, or the right stick pushed
    aimX: number;         // the right stick's horizontal component (0 from keyboard): sets facing
}
new PlayerControl(playerId: number);   Get(): IPlayerInput        // a shared object
```

Keyboard: arrows or WASD, Space. Gamepad (only when no key is down): left stick moves, right stick fires/aims.
`@logic-incubator/engine/input/StickInput`: `IsStickPushed(stick: Vec2Like | null): boolean` - a stick at rest is non-null but zero.

---

# editor

## DungeonEditor

`@logic-incubator/editor/DungeonEditor` - `class DungeonEditor extends EditorComponent`. Also exports `ResumeEditorScene(): string | undefined`: the editor scene's name on the page load
straight after the [sprite editor](#sprite-editor) reloaded the page, `undefined` otherwise (for a game's `GameEditor.startScene`). Once shown, the editor takes the
saved sprite's note and picks it as the brush.

```ts
new DungeonEditor(options: IDungeonEditorOptions = {})

interface IDungeonEditorOptions {
    titleScene?: string;              // T jumps to this scene
    dataBrushIcons?: DataBrushIcons;  // sprite over each data brush's colour
    mapStyle?: IStyler;               // the game's tiles for the generated maps (keys 1-8)
}
```

Add it with `sceneManager.AddScene(Scenes.EDITOR, new DungeonEditor(options))`, **after** loading the `editor` bundle (its components read icons in `OnInitialise`).
It attaches `Canvas`, `BrushTool`, `Tools`, `Palette`, `Layers`, `SelectedBrush`, `Toolbar`, `Keyboard` and `Menu`, restores the localStorage save, and keeps the
editor/game toggle (Enter) correct by listening to `LEVEL_CREATED`. The editor's DOM overlay is visible only while the editor scene is shown. `OnDestroy` removes the
overlay and injected styles and resets the editor's shared stores.

## EditorAssets

`@logic-incubator/editor/EditorAssets`:

```ts
const EditorBundle = "editor";                         // the asset bundle (packages/editor/assets/editor)
EditorIcon(name: string): ImageId                      // "arrow-up" -> "editor.arrow_up"
EditorFontName(assets: Assets): string                 // the face of the editor's small bitmap font
```

## SavedLevel

`@logic-incubator/editor/SavedLevel`: `type EditorSave = LevelFile & { editorData: IEditorState; levelData: LevelDataState }`; `MakeEditorSave(editorData, levelData)`;
`SaveLevel(save)`, `LoadSavedLevel(): EditorSave | undefined` - the localStorage copy (key `dungeonLevel`) saved when Enter hands the level to the game.

## Map styling

`@logic-incubator/editor/maps/Styler`:

```ts
interface IStyler extends MapTiles {                    // MapTiles = { floor: string; wall: string }
    StyleRoom(rect: RectangleLike, doors?: { [cell: string]: number }): Brush[];
}
ApplyMapStyle(map: IMap, styler: IStyler): IMap         // restyles each room of a digger/uniform/rogue map
```

`@logic-incubator/editor/maps/BaseStyle` - `abstract class BaseStyle implements IStyler`: implement `floor`, `wall`, `TopLeft`, `TopRight`, `BottomLeft`, `BottomRight`,
`TopWall`, `BottomWall`, `LeftWall`, `RightWall`, `Floor`, `Doors` (each returns `Brush[]`); protected `rect` (the room), `doors` (its door cells) and
`Fill(tileNames, x, y): Brush[]`.

`@logic-incubator/editor/maps/Generators`: `const enum MapType { DIGGER, ROGUE, UNIFORM, DIVIDED_MAZE, ELLER_MAZE, ICEY_MAZE, CELLULAR }`,
`interface IMap { type; levelData: Brush[]; dungeon }`, `GenerateMap(type, width, height, tiles: MapTiles): IMap` (uses rot-js).
`maps/ZTest`: `GenerateZTest(tiles): Brush[]` - the height test map (key 8).

## Stores

Both extend lib's `Store`.

`@logic-incubator/editor/stores/EditorStore` - `default class EditorStore` (UI state: tool, brush, layers, zoom, scene):
`const enum EditorActions` (`BRUSH_MOVED`, `ROTATE_BRUSH`, `FLIP_BRUSH_H`, `FLIP_BRUSH_V`, `BRUSH_CHANGED`, `BRUSH_HOVERED`, `BRUSH_VISIBLE`, `BRUSH_NUDGE`,
`DATA_BRUSH_INC`, `DATA_BRUSH_DEC`, `SET_DATA_BRUSH_VALUE`, `ZOOM_IN`, `ZOOM_OUT`, `MOUSE_BUTTON`, `CHANGE_SCENE`, `RESET`, `DUPLICATE_LAYER`, `REFRESH`, ...),
`const enum EditorTool { BRUSH = "brush", ERASE = "erase", DATA_SELECT = "data-select", STAMP = "stamp", DROPPER = "dropper", FILL = "fill", MOVE = "move" }`,
`const enum MouseButtonState { LEFT_DOWN, RIGHT_DOWN, UP, MIDDLE_DOWN }`, `IMPLICIT_LAYER_ID = -99999` (the always-present `attributes` data layer),
`MaxEditableLayers = 16`, `EditableLayerCount(layers)`, `ToolFitsLayer(tool, layer)` (data-select is only usable with a data layer selected - the store switches back to the brush when it isn't, and the toolbar hides its button), `type DataBrush = { name; colour; value }`, `type DataBrushIcons = { readonly [K in DataBrushName]?: string }`,
`DataBrushIcon(icons, name)`, `interface IEditorState`.

`@logic-incubator/editor/stores/LevelDataStore` - `default class LevelDataStore` (the painted brushes): `type Layer = LevelLayer & { selected; visible }`,
`type LevelDataState = { levelData: LevelData }`, `const enum LevelDataActions` (`COPY`, `RESET`, paint/erase actions, ...).

Layout constants (`@logic-incubator/editor/Layout`): `EditorWidth` (1280), `EditorHeight` (720), `InitalScale` (1.5), `SidebarWidth` (260), `ToolbarWidth` (40), `GridBounds`.

## EditorComponent

`@logic-incubator/editor/EditorComponent` - `abstract class EditorComponent extends GameComponent`: gives `editorStore` and `levelDataStore` (shared, lazily created)
to its subclasses; `static DestroyStores()` forgets them; `protected OpenSpriteEditor(request): Promise<boolean>` opens the [sprite editor](#sprite-editor) with a host built from the
stores. Its setup goes in `OnInitialise` like any component.

## UI helpers

Used by the editor's own views; available for editor extensions.

| Module | Exports |
| --- | --- |
| `ui/dom/Dom` | `El(tag, className, text?)`, `ButtonEl(className, text?, title?)`, `InjectStyles(id, css)`, `RemoveInjectedStyles()`, `InjectTheme()` |
| `ui/dom/EditorOverlay` | `default class EditorOverlay` - singleton DOM overlay (`inst`, `Destroy()`), `Slot(name: OverlaySlot): HTMLElement` with `OverlaySlot = "brushes" \| "selected" \| "layers" \| "tools" \| "help"`, `SetVisible(visible)` |
| `ui/dom/SpriteCanvas` | `default class SpriteCanvas` (draws textures to a 2D canvas); `FitIcon`, `VisibleBounds`, `DrawTexture`, `DrawDataBrushSwatch` |
| `ui/dialog/FormDialog` | `OpenFormDialog(options: FormDialogOptions): Promise<FormValues \| null>`, `IsFormDialogOpen()`; field specs `NumberField`, `TextField`, `ColourField`, `ToggleField`, `ChoiceField` (exactly one option), `MultiChoiceField` (`FieldSpec`), `ChoiceOption`; any field can have `visibleWhen(values)` to show only while it applies to the other values (a pickup's key id only for a key); `IsFieldVisible(field, values)`; options may set `saveLabel` and `cancelLabel` (`null` leaves Cancel out - a message with just an OK, which the sprite editor uses for alerts and confirms) |
| `DataBrushEditors` | `DataBrushEditorFor(name): DataBrushEditor \| undefined` - the dialog definitions for editing a value: `"light"`, `"spawner"`, `"pickup"` (the `PICKUP` brush's name - the same popup for the brush and for a tile that gives one), `"door"` (a door tile's lock: a Locked checkbox that reveals its key id) and the height. `EditorImages` carries the lookups they need from the game's art (`monster`, `hasSprite`) |
| `DataLabels` | `PickupLabel(pickup)`, `MapLabel(value)` (the short tag drawn over a value on the attributes overlay: `G10`, `H2`, `K3`, `W`, `I`, `L3` for a locked door - an unlocked one has no tag...; only characters the bitmap font has), `DescribePickup(pickup)`, `DescribeLock(lock)` (pure) |
| `views/PaletteCategories` | `type TileSet = { id: AssetCategory; name; brushes: string[] }`; `GroupByCategory(names, categoryOf): TileSet[]` (one set per category, in `AssetCategories` order, empty ones included, each sorted by name); `EmptyTabHint(id, canCreate?): string` (pure); `EmptyTabHint(id, canCreate?)` mentions the tab's + when the sprite editor is available |
| `tools/ToolGeometry` | `SpanRect(a, b)`, `RectCells(rect, border?)`, `InRect(rect, x, y)`, `FloodFill(start, bounds, keyAt)`, `TopmostBrushAt(...)` (a brush is only at its anchor cell), `TopmostBrushCovering(brushes, layers, cell, footprintOf, accept?)` (a brush is on top at every cell of its footprint - what the data-select tool uses, so a 2x2 spawner or door is the target wherever it's clicked), `BoundsOfCells(cells)`, `type CellRect` |

## Sprite editor

`@logic-incubator/editor/sprite/` - the sprite editor ([user guide 10.6](user-guide.md#106-the-sprite-editor)). Everything below the UI is pure (no DOM) and unit-tested.

| Module | What it is |
| --- | --- |
| `Colour` | `Rgba`, `Rgb`, `Transparent`, `PackColour` / `UnpackColour`, `ColourHex(c, withAlpha?)`, `ParseColour`, `Luminance`, `Hue`, `Saturation`, `ClampByte`. |
| `Png` | `DecodePng(bytes): Promise<{ width, height, rgba, indexed? }>` (all colour types and bit depths, Adam7, `tRNS`; `indexed` has `palette` and `indices` for palette PNGs), `EncodeIndexedPng(width, height, indices, palette)`, `EncodeRgbaPng`. Uses the browser's / Node's `CompressionStream`. |
| `Palette` | `MaxPaletteSize` (256), `DefaultPalette()`, `NearestIndex`, `IndexImage`, `RemapIndices`, `ExtractPalette(images, max, sort) -> { palette, exact }` (median cut; slot 0 transparent), `CompactPalette`, `SortPalette`, `FormatPalette("json" \| "pal" \| "gpl", name, colours)`, `ParsePalette(text)`. |
| `ChannelMixer` | `Mixer`, `IdentityMixer()`, `MixColour`, `MixPalette(palette, mixer, indices?)`, `MixerPresets`, `IsIdentityMixer`, `WeightRange`, `ConstantRange`. |
| `PaletteLibrary` | `new PaletteLibrary(storage)` - named palettes in local storage (`List`, `Get`, `Save`, `Delete`, `Rename`, `UnusedName`), `BuiltInPalettes`, `WithTransparentFirst`, `CheckPaletteName`. Works for the session if storage is blocked. |
| `Bitmap` | Palette-index bitmaps and the drawing maths: `LinePoints`, `RectPoints`, `EllipsePoints`, `BrushOffsets`, `PlotPoints` (with mirror), `FloodFill`, regions (`ReadRegion`, `WriteRegion`, `FillRegion`), `FlipHorizontal` / `FlipVertical`, `RotateClockwise` / `RotateCounterClockwise`, `ResizeBitmap`, `ShiftBitmap`, `CountUsage`. |
| `SpriteDocument` | The sprite being edited: immutable `SpriteState` (`width`, `height`, `palette`, `frames`) with copy-on-write undo (`Undo`, `Redo`, `MarkSaved`, `Dirty`, `Reset`), `ReplaceFrame`, frame operations (`AddFrame`, `RemoveFrame`, `MoveFrame`, `ReverseFrames`), `Resize`, `Crop(rect)` (every frame cut to a rectangle, clipped to the picture - false if there's nothing to crop), `TransformFrames`, palette operations (`SetColour` - with a coalescing key so a slider drag is one step -, `AddColour`, `SwapColours`, `RemoveColours`, `SortColours`, `RemoveUnusedColours`, `ExtractPaletteFromSprite`, `RemapToPalette`, `LoadColours`, `ApplyMixer`), `StateFromImages(decoded)`, `BlankState`, `ToRgba`. |
| `ToolController` | The drawing tools' pointer logic: `PointerDown` / `Move` / `Up`, `PreviewFrame` (the frame as it will be), `Marquee`, selection (`Copy`, `Cut`, `Paste`, `Delete`, `FlipSelection`, `RotateSelection`, `NudgeSelection`, `SelectAll`, `CropRect` - the selection as it lies on the frame, floating pixels put down first, for `SpriteDocument.Crop`), `Flush`, `Cancel`, `UndoFirst`, `SetTool`; `ToolSettings`, `SpriteClipboard`. |
| `Playback` | Frame timing for the preview: `Playback(frameCount)`, `Advance(ms)`, `Play` / `Pause` / `Stop` / `Seek`, `SetFps`, `SetMode("loop" \| "pingpong" \| "once")`; `DefaultFps` (12). |
| `SpriteNames` | The naming rules, matching `ids.js`: `ValidateSpriteName`, `SuggestSpriteName`, `NormalizeSpriteName`, `FrameFileNames`, `ParseFrameFile`. |
| `SpriteApi` | The client of the [sprite API](#sprite-api): `new SpriteApi(fetch?)` with `Available()`, `List()`, `Describe`, `ReadSprite`, `Save`; `SharedSpriteApi`; `SpriteApiError`; `ToBase64`. |
| `SpriteStore` | Where the editor gets sprites and puts them, behind one interface (`Kind`, `List`, `Read`, `Save`): `DiskStore` (the sprite API - on localhost under `npm start`) and `DownloadStore` (anywhere else: reads the page's loaded art, and a save hands the browser a `Download`); `ChooseStore(api, hosted, deliver)` asks the service once. Download helpers: `PackDownload(bundle, name, sheet, pngs)` (a PNG for one frame, a zip for several), `ObsoleteFiles`, `MetaSnippet`, `DescribeDownload` (the status line and the steps left to do by hand), `PngSize`. |
| `HostedSprites` | `CreateHostedSprites(deps)` - download mode's reader: bundles, sheets and names from `Assets.Catalogue()`, and a sprite's frames from the atlas its textures were loaded from (fetched, decoded, cut out). |
| `AtlasFrames` | `ComposeAtlasFrame(atlas, texture)` - one frame at its full size, trim put back, from the decoded atlas; `AtlasUrl`, `SheetOfAtlasUrl`; `AtlasTextureLike` (the few `Texture` fields it uses). |
| `Zip` | `CreateZip(entries, now?)` - a zip of `{ name, data }` files, stored (PNGs are compressed already), UTF-8 names, checked against real unzippers; `ZipNameProblem`. |
| `ManifestWatch` | `ReadBundleHash(manifestUrl, bundle)` and `WaitForBundleChange(...)` - how the editor knows a save's rebuild has landed. |
| `Resume` | The note left in session storage when the window closes after a save: `WriteResumeNote`, `TakeResumeNote`, `PeekResumeNote`. |
| `Recovery` | The snapshot taken as the page unloads under an open window, so a reload doesn't lose the sprite: `SpriteOrigin`, `Recovery`, `WriteRecovery`, `TakeRecovery`, `PeekRecovery`, `ClearRecovery`, `SerializeRecovery` / `ParseRecovery` (validates everything; stale ones, older than ten minutes, are ignored). |
| `Viewport` | Zoom and pan maths: `ScreenToImage`, `ImageCell`, `ZoomAt`, `StepZoom`, `FitView`, `PanBy`. |
| `OpenSpriteEditor` | `OpenSpriteEditor(context, request, defaults): Promise<boolean>` - `request` is `{ kind: "edit", bundle, name, category? }` or `{ kind: "new", category }`; resolves when the window closes. `host` is a `SpriteEditorHost`: the context's fields plus the dev server's `api` and the page's `hosted` reader - it picks the store. `RecoverSpriteEditor(host, recovery)` puts the window back after a reload. |
| `SpriteEditor` | `default class SpriteEditor` - the window itself (`SpriteEditor.Active`); `SpriteEditorContext` is what it needs of the page (`store`, `deliver(download)`, `metaOf(name)`, `manifestUrl`, `categories`, `persistLevel()`, `reload()`, storages). |
| `ui/*` | The window's parts: `CanvasView`, `Toolbox`, `PalettePanel`, `MixerPanel`, `Timeline`, `Menu`, `Dialogs` (the `FormDialog` descriptions and their checks), `FileIo`, `Icons`, `Styles`. |

Views open it with `EditorComponent`'s protected `OpenSpriteEditor(request)`, which builds the context from the editor's stores. `DungeonEditor` exports
`ResumeEditorScene(): string | undefined` - the editor scene's name on the load right after the sprite editor reloaded the page (or the page reloaded under an open
window), otherwise `undefined` - for a game's `GameEditor.startScene`. `SavedLevel` exports `MakeEditorSave(editorData, levelData)`.
