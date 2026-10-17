# logic-incubator API reference

Signatures and behaviour of the public surface of the four packages, plus the asset build tool's command line,
configuration files and plugin interface. For explanations, examples and workflows see the
[user guide](user-guide.md).

**Conventions**

- Import paths use the package prefixes `@logic-incubator/lib/...`, `@logic-incubator/engine/...`,
  `@logic-incubator/ui/...`, `@logic-incubator/editor/...`, which map to each package's `src/` folder. `default` below means the module's
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
[Tilemap](#tilemap) ·
[Particles](#particles) ·
[Net](#net)

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
[World and heroes](#world-and-heroes) ·
[Fixed step and seeded random](#fixed-step-and-seeded-random) ·
[Views](#views) ·
[Player input](#player-input) ·
[Online lobby](#online-lobby) ·
[Online play](#online-play) ·
[Quests and dialogs](#quests-and-dialogs)

**[ui](#ui)**
[UiLayer and ThemeFor](#uilayer-and-themefor) ·
[UiSystem](#uisystem) ·
[Skin and UiTheme](#skin-and-uitheme) ·
[Widgets](#widgets) ·
[Pure rules](#pure-rules)

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
| `Hide()` | children's `Hide` (reverse), `OnHide`, what `Track` holds is cancelled (reverse), then bindings' `off` (reverse) | children, then owner |
| `Destroy()` | `Hide`, anything `Track` still holds is cancelled, children's `Destroy` (reverse), `OnDestroy` (if initialised), disposers (reverse), `root.destroy({ children: true })` | children, then owner |
| `Attach<T extends GameComponent>(child: T, into: Container = this.root): T` | Adds `child.root` to `into`; initialises/shows it at once if this one already is. For **components**, not display objects (add those with `this.root.addChild`); a child can't be detached, so it lives until this one is destroyed | |

### Hooks (protected, override)

`OnInitialise()`, `OnShow()`, `OnHide()`, `OnDestroy()` - all default to no-ops.

### Helpers (protected)

| Method | Description |
| --- | --- |
| `Own(dispose: () => void): void` | Registers `dispose` to run once when this component is destroyed. It releases nothing now - the function is only stored. Takes any `() => void`. Runs after `OnDestroy`, last registered first. |
| `WhileShown(on: () => void, off: () => void): void` | `on()` now if shown and at every `Show`; `off()` at every `Hide` (`Destroy` hides first, so also then). |
| `Track(cancel: Cancel): Cancel` | Holds something started during a visit - a `Tween`, `Wait` or `GetInterval` - and calls `cancel` once if the component is hidden (just after `OnHide`) or destroyed before it finishes; the next visit starts clean. Returns a function that cancels it now and stops tracking (at most one cancel, however often it is called) - call it first to replace the thing with a new one. Tracking on a destroyed component cancels at once. |
| `Listen(emitter: IEmitter, event: string, fn): void` | Subscribes `fn` (with `this` as context) now and, through `Own`, unsubscribes when destroyed. |
| `ListenWhileShown(emitter: IEmitter, event: string, fn): void` | Subscribes at every `Show`, unsubscribes at every `Hide` (through `WhileShown`). |
| `Tick(fn: (dt: number) => void): void` | Calls `fn` each frame of `game.ticker`, only while shown (through `WhileShown`). |
| `debug: DebugTools` *(getter)* | Development helpers for this component (development builds only), made on first use; what they start stops when it is destroyed. See [DebugTools](#debugtools). |
| `AddToScene(id: string): void` | **Deprecated.** Use `owner.Attach(child)`. |

**`Own`, `WhileShown` or `Track`?** They tie something to the component's life over three different spans: `Own` once, at the end (destroy);
`WhileShown` repeatedly, starting and stopping at every show and hide; `Track` for something you start *during* a visit, which is cancelled at the
next hide (or destroy). `Own` is not limited to subscriptions - any cleanup goes in it:

```ts
const sparks = new Emitter(this.root, textures, config);
this.Own(() => sparks.destroy());                       // when destroyed: the same as sparks.destroy() in OnDestroy, but next to the line that made it
this.WhileShown(() => sparks.emit = true, () => sparks.emit = false);   // on every show / every hide

// in a click handler: a fade that is cancelled if the scene is hidden first - so its onComplete never fires on a scene that has gone
this.Track(Tween(this.title, { alpha: 0 }, 1000, Easing.Quad.In, () => this.game.sceneManager.ShowScene("next")));
```

### DebugTools

`@logic-incubator/lib/game/DebugTools` - `default class DebugTools`, reached as `this.debug` in any `GameComponent`. Development aids. Each helper
registers its own cleanup with the component (`Own`), so it stops when the component is destroyed.

**Development builds only.** `DebugEnabled(assets)` (exported beside the class) is `!assets.IsReady || assets.IsDev`: on when the asset manifest was
built without `--production`, and in a game that never loaded a manifest (it can't say which build it is); off in a production build. When off, every
call does nothing - the object is left alone, and the returned function is a no-op - and the component logs one warning, so a call left in by mistake
is noticed and harmless. Take the calls out before shipping anyway.

| Method | Description |
| --- | --- |
| `Drag(target: DisplayObject, options?: DragOptions): Cancel` | Makes any display object draggable, for positioning it by eye: press, drag, let go, and its position in its parent's space is logged as an object literal (`label: {x:640, y:360}`), ready to paste. Returns a function that stops it sooner. |
| `Emitter(target: Emitter \| Emitter[], options?: EmitterPanelOptions): Cancel` | Opens a side panel for tuning a particle emitter while the game runs: its settings as controls, a picker for the particle image, and the config as JSON to copy out. See [Emitter panel](#emitter-panel). Returns a function that takes it out of the panel (the last one out closes it). |
| `Watch(title: string, read: () => ReadonlyArray<string>): Cancel` | Keeps `read`'s lines on screen, under `title`, in a small DOM box over the page's top-left corner, read again every 250 ms (a `read` that throws shows its message instead). One box serves the page, a section per watch. Returns a function that takes the watch away sooner (the last one out removes the box). The box is `OpenWatch(title, read): Cancel` in `@logic-incubator/lib/debug/WatchPanel`, a no-op without a `document`. |

```ts
this.debug.Drag(this._title);                                  // logs "Sprite: {x:640, y:360}" - or the object's `name` - on every drop
this.debug.Drag(this._title, { label: "title", snap: 0 });     // a name for the log line; free movement
```

`DragOptions` (from `@logic-incubator/lib/utils/DragObject`, which also exports the standalone `DragObject(target, options): Cancel`):

| Option | Default | |
| --- | --- | --- |
| `snap` | `1` | Round the position to a multiple of this while dragging, in the parent's units. `0` moves freely. |
| `log` | `true` | Log the position when the object is dropped. |
| `label` | the object's `name`, else its class | Name used in that log line. |

**What is logged** is the object's own `position`, so drag the thing you are placing. A container that sits at (0, 0) with its contents laid out
inside it (an emitter spawning at `ownerPos`, say) reports only how far it was dragged: position the container, and give its contents (0, 0).

How it behaves: the object moves in its **parent's space**, so a scaled, rotated or offset parent is fine, and it keeps the point you grabbed
under the pointer. A drag is followed wherever the pointer goes (off the object, off the canvas) and ends when it is released anywhere. Works with
the mouse, a finger or a pen; only the main button starts a drag. While on, the object is `interactive` with a `move` cursor (both put back by the
returned function). Pressing stops the press reaching the object's ancestors, so a drag-enabled parent doesn't move as well.

The object has to be reachable by pixi's interaction: shown, with no ancestor that has `interactiveChildren = false` (a scene that is not showing, and
the engine's tile, entity and shot layers, have), and not covered by another interactive object, which takes the press instead. A plain `Container`
works when something inside it is under the pointer.

#### Emitter panel

`this.debug.Emitter(emitter)` (or an array of emitters made from one config) opens a DOM panel over the right of the page - so it stays visible in
fullscreen, which covers the whole document - modelled on the [pixi-particles editor](https://pixijs.github.io/pixi-particles-editor/). Code in
`@logic-incubator/lib/debug/`: `OpenEmitterPanel(target, options)` (the panel, which `Emitter` calls), `EmitterConfigModel` (the working copy and the
list of fields, no DOM), `ApplyEmitterConfig(emitters, config, art?)`, `EmitterOverlay` (draws the outlines over the game) and `BuildSpawnOutline(config,
ownerX, ownerY, rotation)` (the lines it draws, no pixi).

```ts
this.debug.Emitter(fire);                                  // one emitter
this.debug.Emitter(torches, { label: "torches" });         // several made from one config: one set of controls drives them all
```

`EmitterPanelOptions`: `label` - the name in the panel's list (default `Emitter 1`...); `config` - a config to start from instead of the emitter's own
(`emitter.originalConfig`). The emitter has to have been set up with a config. One panel serves the page: a second call adds a group to its list
(a drop-down in the header when there is more than one). `-` minimises the panel to its title bar, at 30% opacity so the game shows through (full opacity while the pointer is over it; `-` again restores it), `x` closes it. The outlines stay. It opens 460 px wide (at most 94% of the window); drag its
left edge to resize, down to 340 px. Rows with several inputs (the rectangle's x, y, w, h) wrap rather than squash. A box left empty - or not a number -
goes back to the value the emitter is using when you leave it.

- **Hover a parameter's name** for what it does (a tooltip on every label - including the spawn shape's own rows). Each `Row` in the schema has a
  required `help` string, so a new setting can't be added without one.
- **Controls**, as the editor has them: alpha, scale (and its minimum multiplier), colour, speed (and its minimum multiplier), acceleration, max
  speed, start rotation, no particle rotation, rotation speed and acceleration, lifetime, blend mode (the four that work in WebGL); the spawn
  frequency, emitter lifetime (`-1` is for ever), max particles, particles per wave, spawn chance, spawn type (`point`, `rect`, `circle`, `ring`,
  `burst`) with that shape's own settings, spawn position and add at back; and **Live until outside area**, which adds a `killRect` (starting as the
  game's screen plus 100 px on every side) with its x, y, w, h to edit. The `{ start, end }` and `{ list: [...] }` shapes of a property are both
  read; for a list, start and end are its first and last values and the steps between are left alone. What has no control (`ease`, `extraData`, the
  particle class, `spawnPolygon`) is carried through untouched. Choosing a spawn type adds the shape it needs to the config, so the emitter can
  always be set up. A note shows when one setting overrides another (end speed is ignored while there is an acceleration).
- **Changes apply at once** (a moment after the last one, so dragging a slider doesn't thrash the emitter): the config is applied with the emitter's
  `init`, which also ends its live particles. What `init` would reset is put back - the owner position (`updateOwnerPos`), the rotation, `emit`
  and `autoUpdate` - so tuning a torch doesn't move it or stop it updating. If a config can't be applied, the emitter goes back to what it had and
  the panel says why; the other emitters in the group are not touched.
- **The panel edits a copy.** The config you loaded (a data file's parsed JSON, which several emitters may share) is never changed: take the result
  out with **Copy JSON** (the editor's format, ready to paste into the data file), **Download**, or **Load** a `.json` file in. **Reset** goes back to
  what the panel opened with. A loaded file that isn't a config - or can't be applied - is refused with the reason, and what was there stays.
- **Particle image.** Type a loaded sprite or animation name (a type-ahead lists them) and it becomes the particles' art for the whole group - an
  animation's frames are picked from at random, one per particle - or **Upload an image** from your computer for this session. The thumbnail shows
  the first frame. The art is not part of the config, so Copy JSON gives the settings only: the sprite name is for the code that makes the emitter.
- **Emitting** stops and starts new particles on the whole group; **Restart** sets the emitters up again from the panel.
- **Outlines** (on by default; the **Outlines** tick box switches them) are drawn on the game's stage, over everything, for every emitter in the
  group, in the colours of the legend beside the tick box:
  - **spawn shape** (cyan): the rectangle, circle, ring (outer and inner), the rays of a burst (one per particle of a wave; a ring round the point when
    the spacing is 0, since each goes in a random direction) or the polygon chain;
  - **spawn point** (yellow cross): where particles are emitted from - the owner's position plus `pos`;
  - **kill area** (red): the `killRect`, if there is one.

  They follow the controls at once, before the emitters are set up again, and follow the emitters: a shape is in its container's space and is carried to
  the stage through that container's `worldTransform`, so it moves, scales and turns with the container; the owner position (`updateOwnerPos`) and the
  rotation (`rotate`) are the emitter's own. The kill area is already in stage coordinates. They match where particles really appear: `rotate` turns
  `pos` about the owner as well as the shapes, and the outline does too. Drawn as one `Graphics` on the stage's root, taken off when the panel closes.
- Typing in the panel does not reach the game's keyboard handler (key events stop at the panel), so editing a number can't move the player.

Development builds only, like the rest of `this.debug`.

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
| `SetSoundVolume(id: SoundId, volume: number): void` | How loud a sound is, 0 to 1, for what is playing now and what plays later (on top of a play's own `volume`). Does nothing for a sound that isn't loaded. |
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
    SetVolume(alias: string, volume: number): void;   // 0 to 1, for what is playing now and what plays later
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
| `utils/DragObject` | `DragObject(target, options?: DragOptions): Cancel` - drag any display object to position it by eye; what `this.debug.Drag` uses. See [DebugTools](#debugtools). |
| `utils/Debug` | `MoveWithArrowKeys(displayObject)` (logs the position; dev aid); `MakeDraggable(displayObject)` - **deprecated**, now `DragObject` with its defaults. |
| `colour/ColourTransform` | Colour changes on a packed `0xRRGGBB` number (the form pixi takes for a tint), returning a new colour; alpha bits are ignored. `Darken(colour, amount)` - `amount` 0..1 scales all channels down, 0 unchanged, 1 black (`Darken(0xFFFFFF, 0.5)` is `0x808080`). `ShiftHue(colour, degrees)` - turns the hue round the wheel (red + 120 is green; negative turns back, wraps past 360), keeping saturation and brightness; greys come back unchanged. |
| `filters/OverlayBlendFilter` | `class OverlayBlendFilter extends Filter`; `new OverlayBlendFilter(backdrop: Sprite)` - blends the filtered layer against the backdrop sprite's texture with a real overlay blend; only the backdrop's own texture is read |

---

## Tilemap

`@logic-incubator/lib/tilemap` - vendored `@pixi/tilemap` 3.2.1 for pixi 5.2.1; see `packages/lib/src/tilemap/README.md` for the changes
(bug fixes, per-tile and per-corner tint, flicker, container alpha).

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
`tint` (packed RGB, default `0xffffff`), `cornerTints` (12 numbers: RGB for the top-left, top-right, bottom-right and bottom-left corners,
blended across the tile; 1 leaves a channel unchanged, above 1 brightens; overrides `tint`), `flicker` (0..1, GPU-animated), `flickerSeed`.

`settings`: `TEXTURES_PER_TILEMAP` (16), `TEXTILE_DIMEN` (1024), `TEXTILE_UNITS` (1), `TEXTILE_SCALE_MODE`, `use32bitIndex` (false), `DO_CLEAR` (true).
Do not change after the renderer has initialised.

---

## Particles

`@logic-incubator/lib/particles` - vendored `pixi-particles` 4.3.1 for pixi 5.2.1; see `packages/lib/src/particles/README.md` for the changes
and examples. Configs are what the [pixi-particles editor](https://pixijs.github.io/pixi-particles-editor/) exports.

Exports: `Emitter`, `EmitterConfig`, `OldEmitterConfig`, `Particle`, `AnimatedParticle`, `PathParticle`, `ParticleUtils`, `PolygonalChain`,
`PropertyList`, `PropertyNode`, `LinkedListContainer`.

`Emitter`:

| Member | |
| --- | --- |
| `new Emitter(parent: Container, art, config: EmitterConfig \| OldEmitterConfig, ticker = Ticker.shared)` | `art`: a texture or an array of them (each particle takes one at random). Particles are added to `parent`, in its space. Emits at once unless `config.emit` is false. `ticker` is only used by `autoUpdate`. |
| `update(seconds: number)` | Advance the particles and spawn new ones. Call once a frame unless `autoUpdate` is on. |
| `autoUpdate: boolean` | Run `update` from `ticker` (default false; the config's `autoUpdate`). |
| `emit: boolean` | Spawn new particles. Setting false lets the live ones finish. |
| `playOnce(callback?)` | Start emitting; `callback` runs when the last particle has died. |
| `playOnceAndDestroy(callback?)` | The same, then `destroy()`s itself. Turns `autoUpdate` on. |
| `updateOwnerPos(x, y)`, `updateSpawnPos(x, y)`, `rotate(rotation)`, `resetPositionTracking()` | Move the spawn point (`ownerPos + spawnPos`) / turn the emitter / stop interpolating the spawn position across the next jump. |
| `killRect: Rectangle \| null` | If set (from `config.killRect: { x, y, w, h }` by `init`), particles live until their centre leaves it instead of dying of age. In the **stage's (global) coordinates** - so one rect serves emitters in containers placed or scaled differently, and it can be bigger than the screen to let particles drift in. `lifetime` then only sets how long alpha, scale, colour and speed take to reach their end values, which the particle holds from then on. A particle that never leaves the area never dies: mind `maxParticles`. |
| `particleCount`, `parent` | Live particles; the container they are added to (null once destroyed). |
| `cleanup()`, `destroy()` | Kill the live particles now; release everything, including the ticker listener. |

`LinkedListContainer extends Container` keeps its children as a linked list instead of an array, so adding and removing particles is cheap; it
does not fill `children`. Use it as an emitter's `parent` when there are many.

## Net

`@logic-incubator/lib/net/...` - what online play travels on: a binary writer and reader, the `Transport` connections carry
messages over, direct links between peers, the relay's rules and the client side of them. All pure; the relay server itself is `relay/` at the repo root
(see the [user guide](user-guide.md#15-networking-and-the-relay)).

### Bytes

`@logic-incubator/lib/net/Bytes` - little-endian. `ByteWriter` grows as it goes; every method but `ToBytes` returns the writer, to chain.

```ts
new ByteWriter(capacity = 64)
writer.U8(v) / U16(v) / U32(v) / I8(v) / I16(v) / I32(v) / F32(v) / F64(v) / Bool(v)
writer.String(text)          // UTF-8 after a u16 byte length; RangeError past 65535 bytes
writer.Bytes(bytes)          // after a u32 length
writer.Raw(bytes)            // no length: for the end of a message, read back with Rest()
writer.Length: number;  writer.Clear(): this   // starts again, keeping the room made
writer.ToBytes(): Uint8Array // a copy, safe to send or keep

new ByteReader(bytes: Uint8Array)   // reads a view of bytes, from its byteOffset
reader.U8() ... F64(), Bool(), String(), Bytes() (a copy), Rest() (a view of what's left)
reader.Remaining: number;  reader.AtEnd: boolean
```

Reading past the end throws `RangeError`, so a short or garbled message never passes for a good one.

### Transport

`@logic-incubator/lib/net/Transport` - a connection carrying whole messages, in order, between two ends.

```ts
type Message = string | Uint8Array;

interface Transport {
    readonly IsOpen: boolean;
    Send(message: Message): void;                                // does nothing once closed
    OnMessage(listener: (message: Message) => void): () => void; // returns what stops it
    OnClose(listener: (reason: string) => void): () => void;     // once, at either end's close or a lost connection
    Close(): void;                                               // both ends hear of it; safe twice
}

abstract class TransportBase implements Transport   // the listener bookkeeping; subclasses call Deliver(message) and End(reason)
```

| Module | |
| --- | --- |
| `WebSocketTransport` (default export) | `static Connect(url, { timeoutMs = 10000, create? }): Promise<WebSocketTransport>` - resolves once open; rejects with an `Error` if it can't connect or there's no answer in time. `create(url)` makes the socket (`new WebSocket(url)` by default; a test passes a `WebSocketLike`). Asks for binary as `arraybuffer`; text arrives as a string, binary as a `Uint8Array`. `Close()` ends this end at once. `CloseReason(code, reason)` turns a close event into words: the reason given, else `closed`, `going away`, `connection lost` (1006) or `closed (code)`. |
| `Loopback` | `LoopbackPair(): [Transport, Transport]` - two ends joined in memory; a message arrives a moment after `Send` (a promise callback, never during it), as a copy. `new LoopbackRelay(options?: RelayRoomsOptions)` - a relay in memory with the real one's rules: `Connect(): Transport` is a new connection to it; `rooms` is its `RelayRooms`. `new LoopbackLinks(options?)` - direct links in memory (see [Direct links](#direct-links)): `Make` is the `LinkMaker` to give every session in a room; the links find each other by their signals, as WebRTC's do. `options` (`{ unreachable?, fastLoss = 0, random = Math.random }`, changeable as it runs): `unreachable` links never open; `fastLoss` is the share of fast-lane messages lost. `links` is every link made; `CutAll()` fails every open one at both ends (the relay is left be). |
| `Lag` | `WithLag(transport, lag): Transport` - the lag simulator. `lag`: `{ delayMs, jitterMs = 0, lossChance = 0, lossDelayMs = 200, random = Math.random }`. Each message, each way, waits `delayMs` plus up to `jitterMs`; a `lossChance` share also waits `lossDelayMs`, as if lost and sent again - holding up those behind it, since messages stay in order. One lagged end adds twice the delay to a round trip. Closing it sends what's queued first; a close from the other end arrives after what was sent before it. `WithLinkLag(link, lag): PeerLink` - the same for a direct link: its reliable lane as `WithLag`, its fast lane each message on its own delay (so one can overtake another), and a `lossChance` share lost outright. Setting the link up isn't slowed. |

### Direct links

`@logic-incubator/lib/net/PeerLink` - a direct connection between two peers of a room, alongside the relay, with two lanes: the reliable
lane (whole and in order, as the relay) and the fast lane (may lose a message or deliver it out of order, never holding up the ones
behind). `RelaySession` sets them up and sends by them ([RelaySession](#relaysession)); a game only chooses the `LinkMaker`.

```ts
interface PeerLink {
    readonly IsOpen: boolean;                                    // both lanes open, from OnOpen until it closes
    Send(payload: Uint8Array, fast: boolean): void;              // does nothing unless open
    Signal(signal: string): void;                                // a signal from the other end's link
    OnSignal(listener: (signal: string) => void): () => void;    // signals to pass to the other end: an offer, an answer, addresses
    OnOpen(listener: () => void): () => void;                    // once
    OnMessage(listener: (payload: Uint8Array, fast: boolean) => void): () => void;
    OnClose(listener: (reason: string) => void): () => void;     // once: closed at either end, failed, or never got going
    Close(): void;                                               // safe twice
}
type LinkMaker = (offer: boolean) => PeerLink;                  // offer: the end that starts it (a guest's, to the host)
type LinkState = "relay" | "linking" | "direct";
abstract class PeerLinkBase implements PeerLink                  // the listener bookkeeping; subclasses call Emit(signal), Opened(), Deliver(payload, fast), End(reason)
```

`@logic-incubator/lib/net/WebRtcLink` - default export `class WebRtcLink extends PeerLinkBase`, a link between two browsers.

```ts
new WebRtcLink(offer: boolean, { iceServers = [{ urls: StunServers }], peerConnection = RTCPeerConnection }?)
WebRtcLink.Supported: boolean          // the page has RTCPeerConnection
StunServers = ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"]
PieceBytes = 16384                      // the most the reliable lane sends at once; longer messages go in pieces and are put back together
```

Two data channels agreed beforehand at both ends (`negotiated`, ids 0 and 1): the reliable lane ordered and resending, the fast lane
unordered with `maxRetransmits: 0`. The offering end sends its offer as soon as it's made; the other answers; both send each address
they find (addresses that come before the description wait for it). Signals are JSON text. It ends (`OnClose`) when either channel
closes (`closed`), the connection fails (`failed`), or setting up throws (`couldn't offer: ...`). No TURN server: when two machines
can't reach each other it never opens, and `RelaySession` gives up on it.

### Relay rooms and protocol

`@logic-incubator/lib/net/RelayRooms` - the relay's whole rule set, bar the sockets. It imports nothing and uses only TypeScript Node can strip
(no enums, no parameter properties), because the relay server runs this file directly.

```ts
RelayVersion = 1;  RelayHost = 0;  RelayBroadcast = 255;  RoomSeats = 4;
RoomCodeLetters = "CFGHJKLMNPQRTWX";  RoomCodeLength = 5;

type RelayError = "bad-request" | "version" | "no-room" | "room-full" | "busy";
type RelayRequest = { t: "host"; v: number; game: string } | { t: "join"; v: number; game: string; code: string };
type RelayNotice = { t: "hosted"; code; you: 0 } | { t: "joined"; code; you; peers: number[] } | { t: "peer-joined"; peer }
                 | { t: "peer-left"; peer } | { t: "error"; error: RelayError } | { t: "closed"; reason: "host-left" };

interface RelayLink { SendText(text): void; SendBytes(bytes): void; Close(): void }   // a connection, as the rooms reach it
interface RelayConnection { Text(text): void; Bytes(bytes): void; Closed(): void }  // what they're told of it

new RelayRooms({ random = Math.random, maxRooms = 1000 }?)
rooms.Connect(link: RelayLink): RelayConnection
rooms.RoomCount: number;  rooms.PeerCount: number
NormaliseRoomCode(text): string      // " cfg-hj " -> "CFGHJ"; "" if it can't be a code
ParseRequest(text): RelayRequest | null
```

The protocol, on one connection:

1. The first message is a text frame, JSON: a `host` request opens a room for that `game`; a `join` request joins the room with that code
   (any case) - only for the same `game`. The answer is `hosted` (the host is peer 0) or `joined` (peer 1 to 3, with who's already there),
   or `error` and the connection closed: `version` for another `RelayVersion`, `no-room`, `room-full` (four already), `busy` (`maxRooms`
   open), `bad-request`.
2. Then bytes: a binary frame `[to][payload...]` reaches peer `to` - or everyone else for `RelayBroadcast` - as `[from][payload...]`.
   Bytes for an empty seat, for the sender itself, or before a room, are dropped. Text frames after joining are ignored (kept for later versions).
3. Notices, as text: `peer-joined` and `peer-left` to everyone else in the room. When the host leaves, every guest gets `closed`
   (`host-left`) and the relay closes their connections; the room is gone.

Codes are five consonants, drawn at random, never one that's open. The letters leave out any a blocky pixel font draws like another
letter or a digit (B, D, S, V, Z), so a code read off the screen is typed as it was meant.

### RelaySession

`@logic-incubator/lib/net/RelaySession` - default export `class RelaySession extends EventEmitter` (eventemitter3, so a component can `Listen`).

```ts
static Host(transport, game: string, options?: RelayJoinOptions): Promise<RelaySession>
static Join(transport, game: string, code: string, options?: RelayJoinOptions): Promise<RelaySession>
// both reject with RelayRefusedError (reason: RelayError, message: RefusalText(reason)), or an Error if the
// connection ends or the relay doesn't answer - closing the transport
type RelayJoinOptions = {
    timeoutMs?: number;          // for the relay's answer - 10000
    links?: LinkMaker;           // direct links (see Direct links): a guest links to the host as it joins; the host answers. Both ends need it
    linkTimeoutMs?: number;      // how long a link may take to open before the relay carries everything - LinkTimeoutMs (10000)
};

session.Code: string;  session.You: number;  session.IsHost: boolean;  session.IsOpen: boolean
session.Peers: ReadonlyArray<number>      // everyone else in the room, in peer order
session.Send(to: number, payload: Uint8Array, fast = false): void   // by the open link to `to`, else the relay; `fast`: the link's fast lane
session.Broadcast(payload: Uint8Array, fast = false): void          // one copy by the relay - or each peer its own way, once any is linked
session.LinkTo(peer: number): LinkState  // "direct" once the link is open and switched to, "linking" while it's set up, else "relay"
session.Leave(): void                    // closes the connection - and the room, from the host
session.Drop(reason: string): void       // lets go of a connection taken for lost (gone quiet): closes it as Leave does,
                                         // but CLOSED hears `reason`, so a listener can get back in on a new one

RelayEvents = { MESSAGE: "message", PEER_JOINED: "peer-joined", PEER_LEFT: "peer-left", CLOSED: "closed", LINKED: "linked", UNLINKED: "unlinked" }
// message (from: number, payload: Uint8Array) · peer-joined (peer) · peer-left (peer)
// closed (reason: "left" | "host-left" | Drop's reason | the connection's own reason) - once; every listener is dropped after it
// linked (peer) - messages to and from peer go by the link now
// unlinked (peer, wasOpen: boolean) - the link ended, or never opened in time; the relay carries on. One that was open may have lost what was on it
LinkPayload = 0xff                        // the first byte of the session's own messages (setting up a link), never handed on
LinkTimeoutMs = 10000
RefusalText(reason: RelayError): string   // "There's no game with that code." ...
```

The session is made in the same moment as the relay's answer, so it hears everything after it. Listen to it before your next `await`.

With `links`, a guest's link signals go to the host by the relay, as payloads starting `LinkPayload`; a game's own messages must start
with any other byte. When its link opens, each end sends a switch marker by the relay ahead of anything by the link, and holds what the
other's reliable lane brings until the other's marker comes - so nothing sent by the relay is overtaken. The fast lane is delivered as
it comes. A link that closes, fails or isn't open within `linkTimeoutMs` emits `UNLINKED` and is let go; there's no second try in that
session. A peer leaving, or the session closing, closes its links.

### Relay server

`relay/server.mjs` at the repo root (Node 22.18 or newer, not a workspace). `npm start --prefix relay` runs it from the environment;
tests and other programs can start one themselves:

```js
import { StartRelay } from "../relay/server.mjs";

const relay = await StartRelay({
    port: 8787,              // 0 for any free port
    host: undefined,         // every interface
    heartbeatMs: 15000,      // a connection that misses a ping between two of these is dropped
    maxPayload: 1048576,     // largest message, in bytes
    maxRooms: 1000,          // more and hosting is refused as "busy"
    origins: [],             // page origins allowed to connect; none listed for any
    log: message => {}
});
relay.port;  relay.rooms;    // the RelayRooms it runs
await relay.close();         // ends every connection and stops
```

| Environment | Option |
| --- | --- |
| `PORT`, `HOST`, `MAX_ROOMS` | `port`, `host`, `maxRooms` |
| `ALLOWED_ORIGINS` | `origins`, comma-separated - matched as browsers send them, so case and a trailing `/` don't matter |

`GET /health` answers `{ "ok": true, "rooms": n, "peers": n }`; any other plain HTTP request gets a 404. `relay/fly.toml` and
`.github/workflows/relay.yml` deploy it to Fly.io as one machine (see `relay/README.md`).

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
| `PLAYER_DAMAGED` | `"playerDamaged"` | `(damage, hitPointsLeft, hero)` |
| `PLAYER_DIED` | `"playerDied"` | `(hero)` - one hero fell; they drop their keys and the rest play on |
| `ALL_PLAYERS_DIED` | `"allPlayersDied"` | - (every hero is down: the level is over and starts over) |
| `LEVEL_COMPLETED` | `"levelCompleted"` | `(hero)` - a hero reached an `EXIT` cell: the level is over, every hero comes back for the next start |
| `GAME_PAUSED` | `"gamePaused"` | - (`DungeonMain.Pause()` stopped play) |
| `GAME_RESUMED` | `"gameResumed"` | - (`DungeonMain.Resume()` set it going again) |
| `MONSTER_KILLED` | `"monsterKilled"` | `(type, x, y, hero)` - `hero` is whose shot killed it (-1 for none) |
| `SPAWNER_DESTROYED` | `"spawnerDestroyed"` | `(spawner)` |
| `PICKUP_COLLECTED` | `"pickupCollected"` | `(hero, tileX, tileY)` - a hero picked up what was on that cell |
| `KEYS_DROPPED` | `"keysDropped"` | `(hero, tileX, tileY)` - a fallen hero's keys landed on that cell |
| `NPC_BUMPED` | `"npcBumped"` | `(hero, tileX, tileY)` - a hero walked into the NPC on that cell (a `DIALOG` brush), where talking is on (`World.SetTalk`); `DungeonMain` starts the talk |
| `TALK_STARTED` | `"talkStarted"` | `(hero, tileX, tileY)` - a talk with that cell's NPC began: play holds still until `TALK_ENDED` |
| `TALK_ENDED` | `"talkEnded"` | - (the talk is over, play goes on) |
| `QUEST_UPDATED` | `"questUpdated"` | `(id, state: QuestState, progress, was: QuestState)` - one of the level's quests was given, moved on, met or handed in |

`hero` is always a hero's slot, from 0 - their place in `DungeonMainOptions.heroes`. On an online guest every one of these about play comes from
the host's snapshots (see [Online play](#online-play)).

---

## DungeonMain

`@logic-incubator/engine/DungeonMain` - `class DungeonMain extends GameComponent`; add it as `Scenes.GAME`.

```ts
type PlayerSetup = {
    sprite: string;                                       // animation name
    hitPoints: number;                                    // half-hearts
    hearts?: { full: string; half: string; empty: string };// sprite names; without them the HUD draws the UI skin's hearts
    weapons: WeaponDef[];                                 // the first is equipped; fired while a fire direction is held; copied for each level start
    lightSpell?: LightSpell;                              // a mage-light they call up with the cast control; none if left out
};

type HeroSlot = {
    input?: InputDevice | null;                           // what they're played with (default DefaultInput: the keyboard, or the first gamepad without it); null: played on another machine
    sprite?: string;                                      // the animation they're drawn with, in place of player.sprite
    lightSpell?: LightSpell | null;                       // null for none; left out, player.lightSpell
    name?: string;                                        // what heads their row in the HUD; left out, "PLAYER n"
};

type DungeonMainOptions = {
    player: PlayerSetup;                                  // every hero's, unless their HeroSlot says otherwise
    heroes?: () => ReadonlyArray<HeroSlot> | undefined;   // who plays, one slot per hero (hero 0 first), asked on every start and restart; none or empty: one hero
    level: () => LevelFile | undefined;                   // asked on every start and restart
    levelBundle?: () => string | undefined;               // the asset bundle the level plays in
    seed?: () => number | undefined;                      // what the level's random numbers start from, asked on every start and restart; undefined: a new one
    net?: () => NetPlay | undefined;                      // online: the run this machine plays in (CreateNetPlay), asked on every start and restart; undefined: offline
    playerSprite?: () => string | undefined;              // a lone hero's animation, in place of player.sprite (only without heroes)
    playerLightSpell?: () => LightSpell | null | undefined;  // a lone hero's light spell: null for none, undefined to keep player.lightSpell (only without heroes)
    overlay?: (main: DungeonMain) => GameComponent;       // drawn over the HUD and kept with the scene: a pause menu, an end-of-level screen
    manualRestart?: boolean;                              // the end of a level waits for Restart() instead of starting over by itself (default false)
};

new DungeonMain(options: DungeonMainOptions)

main.Effects: Effects | undefined       // where a game plays particle effects; undefined until the scene is initialised
main.Paused: boolean                    // Pause() is in force
main.WaitingForRestart: boolean         // the level is over (everyone down, or a hero out), with manualRestart: everything holds still until Restart()
main.CanRestart: boolean                // Restart() does something: offline, or the host of an online run
main.Net: NetPlay | null                // the online run being played, as net() gave it when the level started
main.Talking: boolean                   // the hero is talking to an NPC: play holds still (and Pause does nothing) until TALK_ENDED
main.Pause(): void                      // nothing moves, shoots or spawns until Resume(); emits GAME_PAUSED. Online the world plays on: only the heroes played here stand still. Does nothing before a level has started or once it's over
main.Resume(): void                     // emits GAME_RESUMED
main.Restart(): void                    // starts over now, every hero on their feet, with whatever level() hands back (what happens by itself a moment after the end, without manualRestart); online, the host's starts it over on every machine, and a guest's does nothing
```

**Talks and quests** ([Quests and dialogs](#quests-and-dialogs)): a level started offline with one hero turns talking on (`World.SetTalk(true)`; off
otherwise), and `NPC_BUMPED` starts a talk: a `DialogRunner` over the NPC's script, with the world's quests and flags, rewards going to the
hero (`Hero.ApplyPickup`), shown in a `DialogView` with the NPC's tile as the portrait. `TALK_STARTED` and `TALK_ENDED` frame it; a level
starting over ends it. A `QuestTracker` over the play area shows `World.quests` every frame and is told of each level start (`Begin`).
A `ShoutView`, under the `Hud`, draws what the NPCs shout (their script's `shout` part) while the hero is in earshot; it's given the
level's NPCs only when talking is on, and a talk hushes it.
The tracker and the talk are attached after the `Hud` and before the `overlay`, so a game's overlay (a pause menu) stays on top - it should stop taking keys
between `TALK_STARTED` and `TALK_ENDED`, as `in-dungeons-we-dwell`'s `GameOverlay` does (`UiSystem.SetActive(false)`).

`overlay` is how a game puts its own UI over the dungeon without the engine knowing what it is: it is called once, when the scene initialises, and what it
returns is attached above the HUD (shown, hidden and destroyed with the scene). It gets the scene so it can `Pause`, `Resume` and `Restart` it, and listens to
`ALL_PLAYERS_DIED`, `LEVEL_COMPLETED` and the other events for the rest. `in-dungeons-we-dwell`'s `GameOverlay` is a pause menu (cancel while playing) and an
end screen (YOU DIED or LEVEL CLEARED).

`heroes` is asked for each time a level starts (on `LEVEL_CREATED`): one `HeroSlot` per hero, so its length is the party's size. Each hero gets a
`PlayerControl` for their `input`, and a `HeroView` drawn with their `sprite`. Without `heroes` (or when it returns `undefined` or an empty array)
there is one hero, played with `DefaultInput`: `playerSprite` and `playerLightSpell` are asked for at the same moment, for the animation they're drawn
with (`player.sprite` when it returns `undefined`) and their light spell (`null` for none, `undefined` to keep `player.lightSpell`). A game's character
select hands its picks to the scene through these.

A hero whose `input` is `null` is played on another machine, in an online run: no `PlayerControl` is made for them, so here they get no input, and the
camera leaves them out. The camera keeps to the heroes played on this machine - every hero, when none is - and while those are all down, follows the
first teammate still standing and not away (with no one, it stays on the fallen). `Hud.SetNames` heads each row with the slot's `name`, the rows played
here in the skin's `focus` colour when the party is spread over machines.

**Online** (`net`, see [Online play](#online-play)): each step hands the inputs to `NetPlay.Step` in place of `World.Step`, each frame calls
`NetPlay.Frame` before drawing, draws each hero `NetPlay.DrawOffset(i)` from where they are, and draws the monsters and shots from `NetPlay.Entities`
(a guest's copy of the host's) when it isn't null. Every event the world emits goes to `NetPlay.Record` as well as the dispatcher. On each
`LEVEL_CREATED` it calls `NetPlay.Begin` with the world, the level, the dispatcher and a `restart` that starts the level over. A guest's level end
always waits for the host (`CanRestart` is false), and while waiting it still calls `Frame` and draws the HUD, so a player leaving shows. In a development
build it shows `NetPlay.Stats()` with `this.debug.Watch("NET", ...)` for the visit.

With more than one hero all played here, the party shares the screen: the world holds them within a span of each other (`World.SetLeash(PartySpan(view))`),
and the camera frames the box round the living heroes, zooming out to fit them (`PartyZoom`, down to `MinPartyZoom`) - see [World and heroes](#world-and-heroes).
A party spread over machines isn't held together.

Play runs in fixed steps of `StepSeconds` (1/60 s - see [Fixed step and seeded random](#fixed-step-and-seeded-random)), as many each
display frame as its time calls for, and none after a step that ends the level. A step reads every hero's controls (`PlayerControl.Get`, in slot
order) and hands them to `World.Step`, which moves the heroes, opens doors, updates what's seen, collects pickups, fires and runs the `Encounter`. Then,
once a frame, it places each hero for drawing between their last two steps (`HeroView.Place(alpha)`), calls `Level.UpdateLights` with the seconds
played so far and the lights that move - each hero's carried torch (`HeroView.Light`) and mage-light while it's lit (`HeroView.SpellLight`), and every
live shot with a `light`, keyed by the shot, all where they're drawn - and moves the camera: `SetZ` for the height under the first living hero,
`UpdateZoom`, `ZoomForParty` and `Follow` the centre of the box round the living heroes played here, where they're drawn (all of those, once they're down; after the
lights, since moving the camera draws the tiles; the pull is the same per second at any frame rate). Last it draws the figures
(`EntityRenderer.Render(views, encounter, alpha)`) and the HUD (`Hud.RenderHeroes`). Each level start re-seeds the encounter's random numbers
(`World.Reset`, which calls `Encounter.Reset`) from `seed()` - a new seed when it's left out or returns `undefined`, so an online run's machines,
given the host's seed, spawn the same monsters.

Lifecycle: `OnInitialise` builds the `Level`, attaches `Camera`, `TileMapView`, `Effects` (into the camera) and `Hud`, creates the `EntityRenderer` and
the `World`, binds asset metadata (`BindAssetMetadata`) and listens for `LEVEL_CREATED`, `ALL_PLAYERS_DIED` and `LEVEL_COMPLETED`. `OnShow` and each
restart (1.5 s after the level ends, or when told to with `manualRestart`) call `Reload`: prepare the assets (`LevelAssets.Prepare` - refresh dev metadata,
then `UseLevelBundle(levelBundle())`), then `Level.LoadLevel(level())` unless the scene was destroyed meanwhile - so after `LEVEL_COMPLETED` a game moves
on by having `level` (and `levelBundle`) return the next one. On `LEVEL_CREATED` it resets the world for the slots `heroes` gives and keeps one
`HeroView` per slot from level to level. `OnDestroy` destroys the hero views, disposes the level and releases the level bundle (when `levelBundle` was given).

---

## Level

`@logic-incubator/engine/level/Level` - `default class Level`. Built by `DungeonMain`; `LoadLevel` fills it.

```ts
type Tile = Brush & { texture: Texture; anim?: AnimatedSprite; light?: number; spawner?: boolean };   // light: its baked light's index, for a tile that gives off light; spawner: a spawner is drawn as it (EntityRenderer draws it, not TileMapView)
type Door = { cells: Vec2Like[]; tile: Tile; isOpen: boolean; regionIds: number[]; openSprite: string; closedSprite: string; lockId: number };
type Pickup = Vec2Like & { tile: Tile | null; value: PickupValue };      // tile is null for a PICKUP brush on an empty cell
type CollectedPickup = { value: PickupValue; sprite: string | null };    // sprite = the tile it was, for an item or key with none of its own
type Talker = Vec2Like & { value: DialogValue; script: DialogScript; tile: Tile | null };   // an NPC: its script as read, and the tile drawn there
```

| Field | Type | |
| --- | --- | --- |
| `levelData` | `Tile[][][][]` | `[layer][x][y]` -> tiles at that cell, in paint order. |
| `tileLayers` | `LevelLayer[]` | Drawn in order - not the data layers, nor the player layer (`TileLayerOrder`). |
| `playerLayer` | `number` | How many of `tileLayers`, from the first, are drawn under the heroes, monsters and shots - where the level's player layer sits among them; the rest are drawn over them. All of them in a level without a player layer. |
| `collisionData` | `boolean[][]` | Per cell: a `collidable` tile or the `collision` brush. |
| `heightData` | `number[][]` | From the `z-index` brush. |
| `lightGrid` | `LightGrid` | Light at every tile corner, baked from lights with walls casting shadows; read it with `CellCornerLight`, `SampleLight` or `FootLight` ([Lighting](#lighting)). |
| `lightBake` | `LightBake` | What `lightGrid` was built from (each light's `LightShape` and the corners' occlusion); `ComposeLighting(level.lightBake, scales, level.lightGrid)` rebuilds the grid with lights at new strengths. |
| `lights` | `SceneLights` | Keeps `lightGrid` up to date frame by frame from `lightBake`: flicker, lights switched off, lights that move ([Lighting](#lighting)). |
| `doorData`, `doors` | | Door footprints and the doors found. |
| `doorVersion` | `number` | Goes up each time a door opens or closes - how anything worked out from which doors are closed (the monsters' flow field) knows it's stale. |
| `regionData`, `boundaryRegionData`, `regions`, `visibleRegions` | | Region analysis; see below. |
| `boundRect` | `Rectangle` | The map's bounds in cells. |
| `playerStartPosition` | `Vec2Like \| undefined` | |
| `exits` | `Vec2Like[]` | Every cell painted with the `exit` data brush - see `IsExit`. |
| `spawners` | `Spawner[]` | Every spawner tile and `SPAWNER` brush, one to a cell (`FindSpawners`) - a brush on a spawner tile's cell decides what it does. Each is drawn as a tile on its cell (`SpawnerTile`) - a spawner tile, else the top one that isn't floor - or, with none, as the roster's `spawnerSprite`; that picture's footprint (`cells`) is solid until `RemoveSpawner`. |
| `pickups`, `depths` | | |
| `talkers` | `Talker[]` | Every `DIALOG` brush: an NPC's cell (solid in `collisionData`, though it blocks no light), its script read against the level's quests (lines with mistakes left out, each warned of), and the top tile there. |
| `bosses` | `Boss[]` | Every `BOSS` brush whose monster the roster has (`Boss = Vec2Like & { value: BossValue }`); one it hasn't is left out with a warning. `Encounter.Reset` places them. |
| `quests` | `QuestDef[]` | The level's quests: the well-formed ones in `levelData.quests` (`ReadQuests`). |

| Method | Description |
| --- | --- |
| `LoadLevel(file: LevelFile): void` | Builds everything from a level file (and the metadata store). Unknown sprite names drop just their tiles, with a one-off warning. Emits `LEVEL_LOADED`. |
| `Dispose(): void` | Stops animated tiles' sprites. |
| `HeightAt(x, y): number` | |
| `IsSolid(x, y): boolean` | A wall, a spawner, or anywhere off the map. Not a closed door - a hero walks onto one to open it. |
| `IsFloor(x, y): boolean` | Open floor: in a region and not solid - not a wall, a door, a spawner or off the map. Where the party starts (`StartCells`) and what's dropped lands. |
| `IsExit(x, y): boolean` | Whether the cell is a way out (an `exit` brush): a hero standing on one ends the level (`World`). |
| `IsDoorClosed(x, y): boolean` | Whether the cell belongs to a door that is closed right now. Monsters can't enter one (their path and their movement both stop at it); the heroes can. A door with no sprite pair to swap never opens, so isn't in `doors` and doesn't count. |
| `RemoveSpawner(spawner)` | Opens a destroyed spawner's cells, and takes away the tile it's drawn as (`SpawnerTile`), putting out its light if it gives one. |
| `SpawnerTile(spawner): Tile \| null` | The tile a spawner is drawn as - the one `FindSpawners` picked on its cell - or null for one the roster's `spawnerSprite` stands in for. |
| `IsDoorLocked(x, y, canOpen): boolean` | A closed door that doesn't open for the heroes (`canOpen(lockId)` says whether a lock does: it's unlocked, or one of them holds its key - `World.TeamCanOpen`) - what their collider treats as a wall. A closed door that opens for them isn't: they walk onto it to open it. |
| `CollectPickupsAt(x, y): CollectedPickup[]` | Collects and hides every pickup at the cell; the caller applies them. Called each step for each living hero's tile, in slot order, so the first there gets it. A pickup whose tile gives off light (a torch) takes its light with it: that baked light is switched off. |
| `DropPickup(x, y, value: PickupValue, sprite): Vec2Like` | Puts a pickup down - a fallen hero's keys: on that cell, or the nearest open floor (`IsFloor`) when it's a door or a wall, so it can't be shut away. Drawn as `sprite` on the top tile layer under the heroes (`playerLayer`; the bottom one if every layer is over them; nothing is drawn for `null`); collected like any other. Returns the cell it landed on. |
| `UpdateLights(time, moving)` | Rebuilds `lightGrid` for `time` seconds of play, with `moving: MovingLight[]` cast where they are now (`SceneLights.Update`). Call once a frame, before the level is drawn. |
| `UpdateDoors(tiles: Vec2Like[], canOpen?)` | Opens/closes doors by the tiles the living heroes stand on (call each step): a door is open while any of them is in one of its cells and `canOpen(door.lockId)` (with none given, every door does - so with the team's keys, an unlocked door always does), and shut once the last leaves. One that's open stays open while anyone is in it, even if the key went with a hero who fell (`DoorOpens`). Bumps `doorVersion` for each that changes. |
| `SetDoorOpen(index, open)` | Opens or shuts `doors[index]` as it is - its sprite swapped, `doorVersion` bumped - whoever stands where: what an online guest does with the host's doors. Does nothing if it's already so. |
| `UpdateVisibleRegions(tiles: Vec2Like[])` | Recomputes which regions are reachable through open doors from any of these tiles - what one hero sees, all see (call after `UpdateDoors`). |
| `IsCellVisible(x, y): boolean` | |
| `TalkerAt(x, y): Talker \| null`, `IsTalker(x, y): boolean` | The NPC on the cell, if any. |
| `Marked(kind, quest): number` | How many things the level marks for `quest` (`QuestLevel`): for `"collect"` its pickups with that `quest`, for `"kill"` its bosses; 0 for any other kind. |

---

## Level file format

`@logic-incubator/engine/level/LevelFormat` - types, one enum and two helpers; no runtime imports.

```ts
const enum DataBrushName { PLAYER_START = "player-start", COLLISION = "collision", Z_INDEX = "z-index", PICKUP = "pickup", EXIT = "exit",
                           DIALOG = "dialog", BOSS = "boss", SPAWNER = "spawner" }
type DataBrushValue = number | LightValue | SpawnerValue | PickupValue | DoorLockValue | DialogValue | BossValue;

type Brush = {
    name: string;            // a bare sprite/animation name, or a DataBrushName
    position: Vec2Like;      // map cells
    pixelOffset: Vec2Like;
    rotation: number;
    scale: Vec2Like;
    layerId: number;
    data: DataBrushValue;    // null on a tile unless it overrides a light/spawner value
};

type TileLayerKind = "floor" | "walls";   // the editor's: a floor/walls layer takes only that category's tiles
type LevelLayer = { id: number; name: string; isData: boolean; kind?: TileLayerKind;
                    isPlayer?: boolean };   // the player layer: holds nothing, marks where the figures are drawn among the tile layers

function IsTileLayer(layer: LevelLayer): boolean;   // not a data layer, nor the player layer
function TileLayerOrder(layers: LevelLayer[]): { tileLayers: LevelLayer[]; playerLayer: number };

type LevelFile = {
    editorData: { layers: LevelLayer[] };
    levelData: { levelData: Brush[]; quests?: QuestDef[] };   // quests: see Quests and dialogs; left out, none
};
```

The **player layer** (`isPlayer`) is a divider among the layers: the tile layers before it are drawn under the heroes, monsters,
spawners, shots and particle effects, and those after it over them - an arch or a treetop to walk under. `TileLayerOrder(layers)` gives
the tile layers in drawing order and `playerLayer`, how many of them are under the figures: all of them in a level without a player
layer (every level saved before there was one), which is how they were always drawn. A file with more than one goes by the first.

`EXIT` marks a way out: the level is over the moment any hero stands on one (`LEVEL_COMPLETED`). It isn't drawn, so paint stairs or a ladder
there too. A level with none has no way out but to fall. `DIALOG` is an NPC (`{ script }`, see `story/Talk`) and `BOSS` a monster placed by hand
(`BossValue`, see `level/entities/Bosses`) - both in [Quests and dialogs](#quests-and-dialogs). A `PickupValue` may carry a `quest`, the id of the quest it counts for.
`SPAWNER` is a monster spawner (`SpawnerValue`, see [Spawners](#spawners)): it makes the top tile on its cell that isn't floor a spawner, drawn as
that tile, as big as it and gone with it when it's destroyed. On bare floor it's drawn as the roster's `spawnerSprite`. Painted on a spawner
tile's cell, it decides what that spawner does.

---

## Asset metadata

`@logic-incubator/engine/level/AssetMetadata`:

```ts
type DoorValue = { id: number; open: boolean };
const AssetCategories: readonly [
    { id: "floor"; name: "Floor" }, { id: "walls"; name: "Walls" }, { id: "entities"; name: "Entities" },
    { id: "weapons"; name: "Weapons" }, { id: "items"; name: "Items" }, { id: "misc"; name: "Misc" }, { id: "user"; name: "User" },
];                                                  // the editor palette's tabs, in order
type AssetCategory = "floor" | "walls" | "entities" | "weapons" | "items" | "misc" | "user";
const DefaultAssetCategory: AssetCategory = "misc";   // where a sprite with no category is listed
IsAssetCategory(value: unknown): value is AssetCategory

type AssetMetadata = {
    category?: AssetCategory;   // which editor palette tab lists this sprite; no effect in play
    collidable?: boolean;
    blocksLight?: boolean;      // stops light; left out, follows collidable (see LightBlockersFor)
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
| `Add(bundle, map)` | Adds or replaces a bundle's metadata. A `light` that isn't complete (`brightness`, `tint`, `range`, all finite numbers), a `blocksLight` that isn't a boolean or a `category` that isn't one of `AssetCategories` is dropped with a console warning naming the asset; the entry's other fields are kept. |
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
type LightValue = { brightness: number; tint: number; range: number; flicker?: number };   // flicker: how far it wavers, as a share (0.15 is a torch)
type LightSource = Vec2Like & { value: LightValue };
type LightGrid = { width: number; height: number; data: Float32Array };   // RGB per tile corner, (width + 1) x (height + 1), row by row
type LightBlockers = { width: number; height: number; opaque: Uint8Array; floor: Float32Array };   // per cell, row by row
type LightShape = { origin: Vec2Like; rgb: number[]; flicker: number; corners: Uint32Array; shares: Float32Array };  // one light's shadowed reach
type LightBake = { width: number; height: number; occlusion: Float32Array; shapes: LightShape[]; blockers: LightBlockers };

const AMBIENT_LIGHT = 0.3;          // strength of the light where no light reaches
const AMBIENT_TINT = 0xa0b2ff;      // its colour: a cool blue
const MAX_LIGHT = 1.6;              // cap per channel once lights add up
const MAX_BRIGHTNESS = 2;           // cap on a light's brightness
const MAX_SPRITE_LIGHT = 1.25;      // cap on the light a sprite takes
const LIGHT_HEIGHT = 1.5;           // a light's height above its floor, in height steps (a step is a tile tall)
const LIGHT_RADIUS = 0.35;          // radius of a light's flame in tiles; shadows soften with it
const CORNER_OCCLUSION = [1, 0.85, 0.7, 0.6, 0.5];   // light kept at a corner with 0..4 walls around it

IsLightValue(value): value is LightValue            // loose: an object with "range"
IsCompleteLightValue(value): value is LightValue    // strict: all three finite numbers, and flicker one too if it's there
LightFalloff(distance: number, range: number): number   // (1 - (d / range)^2)^2, 0 at and past range
Flicker(time: number, seed: number): number          // -1..1, smooth; seed sets one light apart from another
FlickerScale(flicker: number, time: number, seed: number): number   // 1 + flicker * Flicker(time, seed), never below 0; exactly 1 for a steady light
BakeLighting(lights: ReadonlyArray<LightSource>, width: number, height: number, blockers?: LightBlockers): LightGrid
AmbientLightGrid(width: number, height: number): LightGrid
OpenLightBlockers(width, height): LightBlockers      // nothing blocks, all at height 0
LightBlockersFor(width, height, solid: (x, y) => boolean, floor: (x, y) => number,
    overrides: ReadonlyArray<{ x; y; blocks: boolean }>): LightBlockers
LightOrigin(blockers, x, y): Vec2Like                // where a light on cell (x, y) shines from
BakeLightShape(light: LightSource, blockers): LightShape
CastMovingLight(origin: Vec2Like, value: LightValue, blockers): LightShape   // a light at any point, in tiles, with fewer rays
CornerOcclusion(blockers): Float32Array              // light kept at each corner, row by row
BakeLights(lights, blockers): LightBake              // one shape per light, in order, plus the occlusion
ComposeLighting(bake, scales?: ArrayLike<number>, out?: LightGrid): LightGrid
CellCornerLight(grid, x, y, out): out                // 12 numbers: RGB at the cell's top-left, top-right, bottom-right, bottom-left corners
SampleLight(grid, x, y, out: number[]): number[]     // RGB blended between corners at a point in tile units
FootLight(grid, left, right, feetY, out): out        // a sprite's corner light from the floor under its feet, capped at MAX_SPRITE_LIGHT
LightToTint(rgb): number                             // packs RGB into 0xRRGGBB for a plain sprite's tint, capped at 1
```

`BakeLighting` works out light at tile corners, so a tile drawn with its four corners' light (`TileOptions.cornerTints`) is blended smoothly.
It is `BakeLights` then `ComposeLighting`. Every corner starts at the ambient light and each light adds `tint * brightness * LightFalloff`
(brightness clamped to `[0, MAX_BRIGHTNESS]`) times the share of its flame the corner can see; overlapping lights add up. The corner's
occlusion then darkens the total, and each channel is capped at `MAX_LIGHT`, so light can go above 1 and brighten a texture. Cells off
the grid take the nearest edge.

Shadows come from `LightBlockers`. `LightBlockersFor` makes a cell opaque where `solid` says so, unless a tile over it has `blocksLight`:
`true` from any tile makes it opaque, otherwise `false` from any tile lets light through. A light sits at the centre of its cell; on an
opaque cell (a torch on a wall) `LightOrigin` moves it just past the edge of the first open side (south, east, west, then north). Rays go
from 16 points across the flame to each corner, aimed just short of it, so a wall's corners facing the light are lit and those behind it
aren't. An opaque cell stops a ray, as does a cell whose floor stands more than half a step above the ray, which runs from `LIGHT_HEIGHT`
above the light's floor to the floor where it ends: a ledge two steps up hides its top but a stair rising a step a tile doesn't. Diagonal
walls whose cells only touch at corners still stop light. `CornerOcclusion` counts the opaque cells around each corner, plus cells two or
more steps above the lowest open one, and looks the count up in `CORNER_OCCLUSION`. Without blockers nothing is shadowed or occluded.

A `LightShape` keeps the corners a light reaches and its share at each, so `ComposeLighting` can rebuild the grid with each light scaled
by `scales[i]` (1 if left out; 0 switches it off) without casting rays again. Pass the previous grid as `out` to fill it in place.
`CastMovingLight` casts a light from any point (`(x + 0.5, y + 0.5)` is the centre of cell `(x, y)`) the same way, from 6 points across
its flame instead of 16, since it's cast again whenever it moves.

`@logic-incubator/engine/level/SceneLights` (pure) keeps a level's light up to date while it's played:

```ts
type MovingLight = Vec2Like & { value: LightValue; key?: unknown; scale?: number };   // in tiles; scale multiplies its strength

new SceneLights(bake: LightBake, grid: LightGrid)   // grid is filled in place by every Update
lights.Update(time: number, moving: ReadonlyArray<MovingLight>): LightGrid
lights.SetOn(index, on), IsOn(index)                // a baked light, by its place in the bake
lights.BakedCount, Scale(index), Origin(index), Colour(index)   // Scale: its strength at the last Update - its flicker, or 0 while off
lights.MovingScale(key), MovingColour(key)         // a keyed moving light's strength and colour at the last Update; undefined if it wasn't there
```

`Update` composes every baked light that's on at `FlickerScale(flicker, time, index)`, plus each moving light cast where it is now, at
its flicker times its `scale`. A moving light with a `key` (anything that stays the same from frame to frame - the shot it rides on) isn't
cast again until it has moved an eighth of a tile or its value changes, and keeps one flicker seed; a keyed light left out of `moving` is
forgotten.

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
| `level/Doors` | `FindDoorGroups(doorIds): Vec2Like[][]` (connected islands of door cells), `DoorFootprint(anchor, spriteSize, offset, tileSize): Vec2Like[]` (the cells a sprite drawn top-left on a cell covers), `DoorOpens(door, tiles, canOpen): boolean` (whether a door should be open with heroes on `tiles`: one of them is in its cells, and it's open already or `canOpen(door.lockId)` - so it never shuts on anyone) |
| `level/Regions` | `type Region = { id; cells }`, `type RegionMap`, `FindRegions(...)` (connected walkable components), `RegionIdsTouching(...)` |
| `level/ImplicitData` | `EffectiveLight(brush, meta)`, `EffectiveSpawner(brush, meta)` (a placement's override else the sprite's default), `FindImplicitPlacements(...)` (collision, `lightBlocks`, doors, lights, pickups), `FindSpawners(brushes, tileLayerOrder, metaFor, sizeFor, tileSize, spawnerSpriteSize)` (every spawner tile and `SPAWNER` brush, one to a cell, as a `SpawnerPlacement`: its value, the tile it's drawn as - a spawner tile, else the top one whose `category` isn't `floor`, else null for the roster's sprite - the brush if any, and its footprint), `OrphanedExplicitData(...)` |
| `level/MapBounds` | `type MapBounds`, `FindMapBounds(brushes)` |
| `level/TileCollision` | `default class TileCollision` - `new TileCollision(level, blocked?)`; `TestX(from, dir)`, `TestY(from, dir)`: the corrected position on a collision, else `null`. `blocked(x, y)` names extra cells that count as solid for that collider (asked live) - `Encounter` gives its monsters' collider the closed doors, `World` gives the heroes' the closed doors the team has no key for (`World.IsLockedOut`) |
| `view/helpers/PlayerMovement` | `MoveDamping`, `CentreTile(position)`, `BoxCentre(position)`, `ResolveMove(...)`, `interface MoveCollider` |
| `view/helpers/CameraWindow` | `ViewOrigin(centre, baseWidth, baseHeight, zScale)` |
| `view/helpers/FigureLayers` | The names of the layers the figures are drawn into, found by name in the camera's root: `GlowsLayer` (`"glows"`), `EntitiesLayer` (`"entities"`), `OrbsLayer` (`"orbs"`), `ProjectilesLayer` (`"projectiles"`) |
| `view/helpers/PartyFrame` | How the camera frames a party: `MinPartyZoom` (0.5 - zoomed out to half the usual), `PartyMargin` (3 tiles), `type PartyBox = { minX, minY, maxX, maxY }`, `PartyBounds(positions, out?): PartyBox` (round the heroes' top-lefts, in pixels), `PartyZoom(box, view): number` (1 down to `MinPartyZoom`: what fits the box, each hero's tile and the margin into a view `view` tiles across at zoom 1), `PartySpan(view)` (the furthest apart, in tiles, a party may spread so it still fits at `MinPartyZoom` - what `World.SetLeash` is given) |
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
    speed: number;              // a multiple of a hero's
    contactDamage: number;      // half-hearts per touch; 0 = harmless
    contactCooldown: number;    // seconds between touches from one monster
    ranged?: Weapon;            // shoots at the nearest hero within `range` tiles, from where the heroes can see
    behaviour: () => IMonsterBehaviour;   // called once per monster spawned
}

interface IMonsterRoster<T extends MonsterType = MonsterType> {
    types: ReadonlyArray<T>;                  // listing order in the editor
    defaultPool?: ReadonlyArray<T>;           // a new spawner's pool (default: the first type)
    defs: { readonly [K in T]: MonsterDef };
    spawnerSprite?: string;                   // drawn as a spawner with no tile to be (a SPAWNER brush on bare floor); its size sets the solid footprint
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
    player: Vec2Like;         // the nearest living hero's top-left
    flow: IFlowField;         // walking distances to the nearest living hero
    tileSize: number;
    dt: number;               // seconds since the last step
    random: () => number;     // [0, 1)
};
interface IMonsterBehaviour { Steer(context: MonsterContext): Vec2Like }   // length 0 (still) .. 1 (full speed)

class Chase implements IMonsterBehaviour
class Wander implements IMonsterBehaviour       // new Wander({ aggroRange = 5, turnEvery = 1.5, pace = 0.5 }): amble, then chase for good once a hero is within aggroRange tiles' walk
class KeepDistance implements IMonsterBehaviour // new KeepDistance({ range = 5, slack = 1.5 }): hold ~range tiles' walk away
FollowFlow(context): Vec2Like                   // down the flow field (straight at `player` within a tile)
Toward(from, to): Vec2Like                      // unit vector
Separation(index, positions, radius): Vec2Like  // a push away from neighbours so a crowd spreads out
```

`@logic-incubator/engine/level/entities/FlowField`: `UNREACHABLE = -1`; `interface IFlowField { DistanceAt(x, y); NextCell(x, y); AwayCell(x, y) }`;
`default class FlowField implements IFlowField` - `new FlowField(width, height, isSolid, isHeightGap?)`, `MarkDirty()`, `UpdateTargets(targets: Vec2Like[]): boolean`
(searches again when any target has changed cell or it was marked dirty, from every target at once, so each cell holds the walk to the nearest;
a solid or off-map target is left out, and with none every cell is `UNREACHABLE`), `Update(targetX, targetY): boolean` (`UpdateTargets` with one).

## Spawners

`@logic-incubator/engine/level/entities/Spawners` (pure):

```ts
type SpawnerValue = {
    monsters: MonsterType[];     // pool; one is picked at random per spawn
    interval: number;            // seconds between spawns
    maxAlive: number;            // cap on this spawner's live monsters
    total: number;               // monsters before going dormant; 0 = unlimited
    activationRange: number;     // only while a hero is within this many tiles' walk; 0 = always
    hitPoints: number;           // damage to destroy it; 0 = indestructible
};
type Spawner = Vec2Like & { value: SpawnerValue; cells: Vec2Like[] };
type SpawnerState = { spawner; countdown; alive; produced; hitPoints; destroyed };

DefaultSpawnerValue(): SpawnerValue         // pool = the roster's default; interval 3, maxAlive 4, total 0, activationRange 10, hitPoints 10
IsSpawnerValue(value): value is SpawnerValue
SanitiseSpawnerValue(value): SpawnerValue   // drops unknown monsters, floors numbers at 0, fills defaults
SpawnerCells(anchor, spriteSize | undefined, tileSize, pixelOffset = {x: 0, y: 0}): Vec2Like[]   // the solid footprint, as a door's
SpawnerPlacements(fromTiles, fromBrushes): T[]   // one to a cell, a SPAWNER brush's over a tile's; tiles' order, then the brushes' own cells
```

plus `CreateSpawnerState` and `StepSpawner` (used by `Encounter`).

## Projectiles

`@logic-incubator/engine/level/entities/Projectiles` (pure):

```ts
type ProjectileOwner = "player" | "monster";
type ShotSetup = { sprite: string; spriteAngle?: number; speed: number; damage: number; range: number; light?: LightValue };   // speed px per step (a 60th of a second); range in tiles; light: it glows as it flies
type Weapon = ShotSetup & { cooldown: number };            // seconds between shots
type WeaponDef = { icon: string; shot: Weapon };           // icon = the HUD weapon slot
type Projectile = { id, x, y, px, py, vx, vy, owner, hero, damage, sprite, spriteAngle?, range, dead, light? };   // x, y its centre; px, py where it was before the last step; hero: the slot of the hero who fired it, -1 for a monster's

CreateProjectile(from, direction, shot, owner, tileSize, id = 0, hero = -1): Projectile          // px, py start at from
StepProjectile(projectile, dt, isBlocked, tileSize): Vec2Like | null    // the blocking cell it hit, else null; sets px, py first
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
| `Pickups` | `type PickupValue = { kind: "gold"; amount } \| { kind: "health"; amount } \| { kind: "key"; id } \| { kind: "weapon"; weapon: WeaponDef } \| { kind: "item"; sprite? } \| { kind: "light"; light: LightValue; seconds? }` (an item with no `sprite` is shown as its own tile; a light is carried from then on, in place of any other, for `seconds` - 0 or left out for the rest of the level); `PickupKinds`; `IsPickupValue(v)` (strict: a known kind with the fields it needs, finite numbers, a key id that's a whole number from 0, a complete light - also what tells a pickup from a light or spawner in a tile's `data`); `DefaultPickupValue(kind?)` (a light: a torch that burns for 120 s) |
| `CarriedLight` | `type CarriedLight = { value, seconds, left }`; `GutterTime = 8`; `CreateCarriedLight(value, seconds?)` (0, negative or left out: burns for the rest of the level), `TickCarriedLight(light, seconds): boolean` (false once it's out), `CarriedLightScale(light)` (1, falling to 0 over its last `GutterTime` seconds) |
| `LightSpell` | `type LightSpell = { light: LightValue; seconds; recharge }` (lit for `seconds` - 0 for good - then `recharge` seconds before it can be cast again); `type LightSpellState = { spell, lit: CarriedLight \| null, recharging }`; `CreateLightSpellState(spell)`, `IsLightSpellReady(state)`, `CastLightSpell(state): boolean` (false unless ready), `TickLightSpell(state, seconds)`, `LightSpellScale(state)` (0 while not lit), `LightSpellStatusOf(state): { state: "ready" \| "lit" \| "recharging"; fill; seconds }` (what the HUD shows: a lit one's bar empties as it burns, a recharging one's fills back up) |
| `PlayerState` | A hero's whole state and one step of it. `type PlayerState = { position, previous, velocity, facingX, health, gold, inventory, keys, weapons, equippedIndex, fireCooldown, shot, carried, spell, orb, previousOrb, orbTime }` (`position` the top-left of their one-tile box in pixels, `previous` where it was before the last step; `orb` the floor under their mage-light). `CreatePlayerState(setup, startTile, lightSpell?)` (on `startTile`, at full health, with a **copy** of `setup.weapons`, so a weapon picked up is gone when the level starts over); `StepPlayer(state, input: IPlayerInput, dt, seconds, collider: MoveCollider)` (timers tick, `input` turns and moves them, a shot fired waits in `shot`, the mage-light drifts after them - it reads no device, so it runs the same for input from anywhere); `TakePlayerShot(state): Vec2Like \| null` (once), `DamagePlayer(state, n): boolean`, `EquippedWeapon(state)`, `ApplyPickup(state, pickup: CollectedPickup)` (gold, health, a key, a weapon - added and equipped -, an item, a light) |
| `Keys` | `NoLock = -1` (the lock of an unlocked door - every door by default - which opens for anyone, key or no key); `IsLocked(lock)` (0 and up); `type KeyRing = { keys: { id, sprite }[] }`; `CreateKeyRing()`, `AddKey(ring, id, sprite?): boolean` (false if that id is already held), `CanOpen(ring, lock): boolean` (the lock is `NoLock`, or a key with that id is held). There is no key that opens everything |

---

## Encounter

`@logic-incubator/engine/Encounter` - `default class Encounter` (no pixi). Everything alive besides the heroes: monsters go for whichever living hero is nearest.

```ts
new Encounter(level: EncounterLevel, options: EncounterOptions)

type EncounterOptions = {
    emit: (event: string, ...args: unknown[]) => void;           // the game's dispatcher
    sizeFor: (name: string) => { width: number; height: number } | undefined;   // a sprite's pixel size
    random?: () => number;                                        // [0, 1); left out, numbers seeded at each Reset
    killed?: (monster: Monster, hero: number) => void;            // a monster died, by that hero's shot (-1 for none) - told before MONSTER_KILLED
};
```

| Member | |
| --- | --- |
| `monsters: Monster[]`, `projectiles: Projectile[]`, `spawners: SpawnerState[]`, `spawnerFlash: Map` | State. Each monster and shot has an `id`, unique in the encounter until the next `Reset`, and a monster's `previous` is where its `position` was before the last step. These four are `EncounterView`, what drawing them needs - an online guest's `Replica` is one too. |
| `Flow: FlowField` | Walking distances as of the last `Update`. |
| `Reset(seed?, heroes = 1)` | Starts over from the level's spawners (call on every `LEVEL_CREATED` - `World.Reset` does), with ids from 1 and its random numbers started again from `seed` (a new one if left out), unless the options brought their own `random`. The same seed, level and heroes' moves play out the same. Monsters' and spawners' hit points are multiplied by `PartyToughness(heroes)`, rounded up. |
| `Seed` | What the random numbers started from at the last `Reset`. |
| `Fire(from, direction, shot, owner, hero = -1, seq = -1)` | Adds a projectile; a hero's shot names them by slot (`hero`), which `MONSTER_KILLED` passes on, and by the `seq` of the input it was fired with (an online guest's own shot, which its stand-in waits for). Heroes' shots pass through each other - there's no friendly fire. Each `Projectile` keeps its `setup` (`ShotSetup`) and `seq`. |
| `Update(dt, seconds, players: EncounterPlayer[])` | One step: `dt` in frames (movement; 1 at 60 a second), `seconds` for timers. Only the living among `players` count: the flow field leads to the nearest of them, each monster steers for (and faces, and shoots at) the nearest in a straight line, a touch or a shot hurts the first it reaches, and the dead take no more hits. With none alive, nothing moves. |

**Bosses.** `Reset` also places the level's `bosses` (`EncounterLevel.bosses`): each a `Monster` with `boss` set, its `quest`, and its own
hit points when its value gives them (times the party's toughness, like any monster's). It starts `asleep`: it stands still, and takes no part,
until a hero comes within `BossWakeRange` (8) tiles' walk of it while its cell is in sight (`IsCellVisible`), or hurts it; then it plays as its kind does.

Constants `MaxMonsters = 150`, `HitFlashTime = 0.15`, `ToughnessPerHero = 0.5`; `PartyToughness(heroes): number` - `1 + ToughnessPerHero * (heroes - 1)`:
x1 for one hero, x1.5 for two, x2.5 for four - more bows for the same crowd, without more monsters than `MaxMonsters`. `EncounterLevel` and
`EncounterPlayer` are the narrow interfaces it needs of `Level` and of a hero (`Hero`); `EncounterPlayer.Index` is the hero's slot, named in
`PLAYER_DAMAGED` and `PLAYER_DIED`. `EncounterView` is what's drawn of it - `{ monsters: MonsterLook[]; projectiles; spawners; spawnerFlash: { has } }`,
read-only, with `MonsterLook` the parts of a `Monster` that `EntityRenderer` reads (`previous`, `position`, `def`, `moving`, `animTime`, `hitFlash`,
`facingX`).

**Closed doors.** A monster can't enter a closed door (`Level.IsDoorClosed`). The flow field treats those cells as blocked, so a monster behind one has no path to a hero (`DistanceAt` is `UNREACHABLE`: chasers hold still, wanderers keep wandering, and a spawner with an `activationRange` stays inactive); and the monsters' collider treats them as solid, so one steered at a door by a wander heading or another monster's push is stopped too. The field is recomputed when `Level.doorVersion` changes, not just when a hero changes cell. Spawn cells are never closed-door cells. A monster a door shuts on (its box overlaps a closed-door cell) is walked out of it, whichever side it's nearer, using a collider that doesn't count the door's cells as solid - it can neither be trapped in the door nor slip through to the heroes. The heroes are unaffected - standing in a door is what opens it, and while one does the monsters can come through.

---

## World and heroes

Everything that plays out in a level, for any number of heroes, in pure modules under `sim/` (no pixi). `DungeonMain` owns the world, feeds it
each hero's input every step and draws it; a game rarely touches it directly.

`@logic-incubator/engine/sim/World` - `default class World`:

```ts
interface WorldLevel extends EncounterLevel, QuestLevel {   // the parts of Level a world uses
    playerStartPosition; quests; IsFloor(x, y); IsExit(x, y); IsTalker(x, y); IsDoorLocked(x, y, canOpen); UpdateDoors(tiles, canOpen);
    UpdateVisibleRegions(tiles); CollectPickupsAt(x, y); DropPickup(x, y, value, sprite);
}

new World(level: WorldLevel, options: EncounterOptions)

world.encounter: Encounter
world.Heroes: ReadonlyArray<Hero>      // every hero, in slot order, the fallen included
world.Living: Hero[]                   // those still standing, in slot order
world.Active: Hero[]                   // those in play: standing and not Away, in slot order - who steps, picks up and is gone for
world.AllDown: boolean                 // every hero has fallen, or every one standing is away - nothing steps until the next Reset
world.Completed: boolean               // a hero reached an exit - nothing steps until the next Reset
world.Reset(setup: Pick<PlayerSetup, "hitPoints" | "weapons">, lightSpells: (LightSpell | undefined)[], seed?): void
world.SetLeash(span: { width; height } | null): void   // in tiles; null lets the party roam
world.TeamCanOpen(lockId): boolean     // unlocked, or a living hero carries its key
world.IsLockedOut(x, y): boolean       // a closed door the team can't open - a wall to every hero
world.Collider: MoveCollider           // what the heroes move against - an online guest moves its own with it
world.Step(inputs: ReadonlyArray<HeroInput>, dt, seconds): void
world.RemoveHero(index): void           // their player has left: Gone, out of play for good (keys dropped, and the level ends if no one's left standing)
world.SetAway(index, away: boolean): void   // online, their player's connection has gone (true) or is back: out of play meanwhile, standing
                                        // where they were (the level ends if no one else is in play); never for a hero who is Gone
world.quests: QuestLog                  // how the level's quests stand - started over by Reset; each change emits QUEST_UPDATED
world.flags: Set<string>                // the words the level's dialog scripts have set - cleared by Reset
world.SetTalk(on: boolean): void        // whether walking into an NPC asks for a talk (NPC_BUMPED) - for one hero on one machine; off until turned on
world.RecordQuest(happening: QuestHappening, hero = 0): void   // counts something that happened toward the quests (QuestLog.Record);
                                        // hero gets the credit if it completes one that ends the level

type HeroInput = IPlayerInput | ReadonlyArray<IPlayerInput> | undefined   // a list: several steps' worth for that hero, played in turn this step
NoInput: IPlayerInput                   // standing still

WarpDistance = 8                                              // tiles
WarpTarget(hero, others: Hero[]): Hero | null                 // the nearest of others, if all are at least WarpDistance away
StartCells(start, count, isFloor): Vec2Like[]                 // start, then the open floor nearest it by steps (up to 6), the rest sharing start
```

`Reset` (call on every `LEVEL_CREATED`) makes one hero per entry of `lightSpells`, each with that spell, if any, and `setup`'s hit points and
weapons, on the cells `StartCells` gives round the level's `playerStartPosition` (it throws without one), and resets the encounter with the party's
size (`Encounter.Reset(seed, heroes)`).

`Step` runs one step of play, in this order:

1. Each hero in play (`Active`: living and not away), by slot, moves with `inputs[slot]` (standing still without one; a list of inputs moves them once for each, in order - an
   online host catching up on a guest's inputs). One holding the warp control first jumps to the nearest other hero in play, if every one of
   them is at least `WarpDistance` tiles away. With a leash, the others' positions bound where they can go (`LeashBoxFor`) and the edge stops
   them like a wall (`Leashed`).
2. Doors open and shut by where the heroes in play stand (`UpdateDoors`, with `TeamCanOpen`), and the regions they can see are recomputed together.
3. Each picks up what's under them, in slot order, so the first there gets it (`PICKUP_COLLECTED(hero, x, y)` when there was anything), and each
   thing picked up is counted toward the quests (a `collect` happening, with the pickup's `quest`). With talking on, a hero who has just walked into
   an NPC (`BumpedNpc`) emits `NPC_BUMPED` - once as they reach it, not again while they keep pushing.
4. A hero on an exit ends the level: `Completed` is set, `LEVEL_COMPLETED(hero)` emitted, and nothing else happens this step.
5. Each fires the shots they took, if any (`Encounter.Fire` with their slot and the input's `seq`), and the encounter steps with the heroes in
   play - so a monster never goes for, or hits, one who is away.
6. Each monster killed is counted toward the quests (a `kill` happening, with its type and its `quest`). A quest that `ends` the level, met this
   step, ends it as an exit does: `Completed`, and `LEVEL_COMPLETED` with the hero whose doing met it (checked at the start of the next step too,
   for one met by a dialog).
7. A hero who fell this step drops every key they carried (`Level.DropPickup`, then `KEYS_DROPPED(hero, x, y)` with the cell they landed on), for
   the others to pick up. Once none is left in play, `AllDown` is set and `ALL_PLAYERS_DIED` emitted.

Keys are the team's: a door opens for everyone if any living hero holds its key, and an open door never shuts on a hero in it, even if the key
went with a hero who fell. There is no hero-to-hero collision.

`@logic-incubator/engine/sim/Hero` - `default class Hero implements EncounterPlayer`: one hero's `PlayerState` and what can happen to it.

```ts
new Hero(index: number, setup: Pick<PlayerSetup, "hitPoints" | "weapons">)

hero.Index                    // their slot, from 0
hero.State: Readonly<PlayerState>
hero.Alive, Position, Centre, Tile, FacingX, Health, Gold, Inventory, Keys, EquippedWeapon, Spell
hero.HasKeyFor(lockId): boolean
hero.Reset(startTile, lightSpell?): void      // a fresh PlayerState there
hero.WarpTo(position): void                   // there at once (a top-left, in pixels) - nothing drawn between - their mage-light with them
hero.Step(input, dt, seconds, collider: MoveCollider): void   // StepPlayer
hero.ApplyPickup(pickup), TakeShot(): Vec2Like | null, Damage(n): boolean
hero.DropKeys(): HeldKey[]                    // every key they carry, leaving them none
hero.Gone: boolean                            // their player has left an online run (Leave) - not Alive, and the HUD says LEFT
hero.Leave(): void                            // out for good: no hit points, Gone until the next Reset
hero.Away: boolean                            // their player's connection to an online run has gone, for now: still Alive, but
                                              // out of play (World.Active), drawn faint, and the HUD says AWAY
hero.SetAway(away: boolean): void             // just the flag - World.SetAway is the host's way; a guest copies it from snapshots
hero.Writable: PlayerState                    // their state to write to - what an online guest copies the host's snapshots into
```

`@logic-incubator/engine/sim/Leash` - the screen's edge on a shared screen: `type LeashBox = { minX, minY, maxX, maxY }` (where a hero's top-left
may go, in pixels); `LeashBoxFor(others, span): LeashBox | null` (so that no one in `others` is further than `span` pixels away across or down;
null with no others); `Leashed(collider, box): MoveCollider` (`collider` with the box's edges as walls too: a hero stops at an edge on the axis they
push against it and slides along the other; one already outside can't go further out, and no gap is lined up through an edge).

---

## Fixed step and seeded random

`@logic-incubator/engine/FixedStep` (no pixi) runs play in steps of a fixed length whatever the display's frame rate, so it comes out the
same on a 60 Hz screen, a 144 Hz one or a slow phone, and on every machine in a game played together.

```ts
StepSeconds = 1 / 60;        // one step: the rate movement was tuned at (a dt of 1 frame)
MaxFrameSeconds = 0.1;       // most one display frame counts for, so a stall slows play down rather than running a burst of steps

const step = new FixedStep(stepSeconds = StepSeconds);
step.Advance(seconds): number   // adds a display frame's time; returns how many steps are due now (a step may run a tenth of a step early, so a 60 Hz display runs exactly one a frame)
step.Alpha: number              // 0 to 1: how far the time so far is between the last step and the next - what drawing goes between the last two steps by
step.Reset(): void              // forgets the time saved up - for a fresh start

Between(from, to, alpha, out): Vec2Like   // out set to the point alpha of the way from from to to - where to draw something between its last two steps
```

`@logic-incubator/engine/Random` (no pixi): `SeededRandom(seed): () => number` - numbers in `[0, 1)` like `Math.random`, the same ones for the
same seed on any machine (mulberry32); `NewSeed()` - a fresh 32-bit seed, different every time.

---

## Views

| Class | Module | Summary |
| --- | --- | --- |
| `Camera extends GameComponent` | `view/Camera` | `ViewRect`, `Scale`, `ScaledTileSize`, `Zoom`, `BaseViewWidth/Height`, `CurrentZ`, `EffectiveZoom` (the height zoom times `PartyZoom` - what the views scale by), `PartyZoom` (1, or less while a party is spread out); `Move(x, y)`, `CenterOn(x, y)`, `Follow(pixelX, pixelY, amount)`, `SetZ(z)`, `UpdateZoom(dt)`, `ZoomForParty(target, frames)` (eases `PartyZoom` towards `target` - from `PartyFrame.PartyZoom` - over `frames` 60ths of a second). Emits `CAMERA_MOVED`. `new Camera(cameraControl?)`. |
| `TileMapView extends GameComponent` | `view/TileMap` | `new TileMapView(level, camera)`. Builds the tile layers, lit and banded by height, plus, in drawing order, the `GlowsLayer` (`"glows"`), `EntitiesLayer` (`"entities"`), `OrbsLayer` (`"orbs"`) and `ProjectilesLayer` (`"projectiles"`) (names from `view/helpers/FigureLayers`, re-exported here); `TileGD8Rotation(rotation, scaleX, scaleY)`. Those four go where the level's player layer is (`level.playerLayer`): each height band's tile layers before it are drawn under them, and those after it - in a part of the band of their own (`"z-<n> over"`), with their own glows - over them, every band's lowest z first again. Each tile is drawn with its cell's corner light (`CellCornerLight`); a tile taller than a cell (a door, a statue) stands up, so like a figure it takes `FootLight` along its foot. A tile a spawner is drawn as (`Tile.spawner`) is left to `EntityRenderer`. A tile that gives off light gets a glow over its flame in its own band (`view/helpers/Glow`), at its light's strength that frame. Emits `LEVEL_CREATED`. |
| `HeroView` | `view/HeroView` | How one hero looks. `new HeroView(hero: Hero, animation)`; `Hero` (the hero it draws), `DrawPosition` (where they're drawn this frame, between their last two steps), `Texture`; `Reset(hero)` (point it at a new level's hero - `DungeonMain` keeps one view per slot from level to level), `SetSprite(animation)` (draw them with another animation; a no-op for the one already in use), `Place(alpha, offset?)` (places them, and their mage-light, for drawing `alpha` of the way through their last step, `offset` pixels from there - an online guest's correction being drawn away; call each frame after the steps), `Destroy()`. Their lights, as `MovingLight`s for `Level.UpdateLights` (null when they have none, and always once they've fallen), where they're drawn: `Light` (a torch they picked up, at their centre, dimming as it burns out) and `SpellLight` (their mage-light while it's lit, over the floor just behind them); `OrbPosition` is where the mage-light is drawn, floating and bobbing. |
| `Effects extends GameComponent` | `view/Effects` | `new Effects(camera)`; `Play(art, config, x, y): Emitter \| undefined` starts a particle effect at a position in world pixels (`art`: a sprite or animation name, `config`: an `EmitterConfig` or `OldEmitterConfig`; `undefined` after a one-off warning when `art` isn't loaded). Its layer sits in the camera root just above the shots (`ProjectilesLayer`) - so under any tile layers drawn over the figures -, placed every frame like the entities layer (`view/helpers/EffectsPlacement`), and goes back there on `LEVEL_CREATED` (on top of everything, if there's no shots layer), which also drops the level's effects. Emitters update from `Tick` (only while shown); a finished one (not emitting, no particles) is destroyed, a continuous one runs until `emit = false`. `DungeonMain` attaches it - use `main.Effects`. |
| `Hud extends GameComponent` | `view/Hud` | `new Hud(setup.hearts?)`; `RenderHeroes(heroes)` (every hero, in slot order, the fallen included: one gets the lone hero's panel, as `Render`; a party gets a `HudHeroRow` each, spread down the panel, and the team's keys at the bottom - every key any of them carries); `Render(health, gold, weaponIcon, inventory, keys, spell?)` (the lone hero's panel: hearts, gold, weapon, inventory, keys and `spell`, their `LightSpellState`, shown under the keys as a bar - the skin's `mp` bar, if it has one - and READY, LIT or RECHARGING with the seconds left; null or left out hides it). `SetNames(names: { name; own }[])` heads each row (in slot order) with `name` in place of PLAYER n, in the skin's `focus` colour for `own` - the players at this machine - and `muted` for the rest; rows made later take them too. Built from the UI kit (a `UiPanel`, a `UiIconRow` of hearts, `UiItemSlot`s and `UiInventoryGrid`s, `UiText`) in the skin of the loaded `ui` bundle - the game must load it first. Hearts are the game's own pictures when `setup.hearts` gives them (enlarged 3x, 2x in a party's rows), else the skin's. The keys panel shows each key's sprite and its id. Warns once per missing sprite. |
| `HudHeroRow extends Container` | `view/HudHeroRow` | One hero's row when a party plays: PLAYER n or `SetName(name, own)`'s (and DOWN, the row dimmed, once they've fallen - LEFT once their player has gone, AWAY while their player's connection is gone) and their hearts, their weapon slot, gold and light spell bar, and a strip of the items they carry. `new HudHeroRow(theme, index, rowWidth, heartTextures?)`, `Render(hero: HudHero)` (redraws only what changed), `static Height(theme)`. Also exports `type HudHero` (what a row reads of a `Hero`), `SpellStatusText(spell)`, `FitScale(texture, box)` and `TextureOf(name)`, which `Hud` shares. |
| `EntityRenderer` | `view/EntityRenderer` | `new EntityRenderer(camera, level)`; `Reset()` (call on `LEVEL_CREATED`), `Render(heroes: HeroView[], encounter, alpha = 1)` (each hero where their view was last `Place`d - a fallen one faint, a ghost where they fell, and one who is away as faint; monsters and shots `alpha` of the way through their last step; each spawner as its tile, `Level.SpawnerTile`, or the roster's sprite, red while it shows a hit). Draws a glow under the figures for each hero's torch and each glowing shot, and the mage-lights - a glow with a bright core - over them. |
| `DialogView extends GameComponent` | `view/DialogView` | A talk with an NPC over the play area, in its own `UiLayer`: a `UiDialogue` across the bottom with the NPC's portrait, and once a line with choices has come out in full, a `UiMenu` of them above it. `new DialogView(events: DialogViewEvents)` with `{ next(), choose(index), end() }`, each told a frame after the key press that did it; `Open(line: DialogLine, portrait?: Texture)` (a talk's first line; the portrait drawn as big as the skin's frame takes, by whole pixels), `Say(line)`, `Close()`, `IsOpen`. Its scope (`"dialog"`) takes accept (`onAccept`: the box goes on) and cancel (`end`). `DungeonMain` drives it. |
| `QuestTracker extends GameComponent` | `view/QuestTracker` | The quests under way and complete in the play area's top-left corner (name, `2/5` or DONE, then its `text`) over a shade, and a `UiToastHost` in the top-right: NEW QUEST as one is given, QUEST COMPLETE as one is met, and QUEST for each under way as a level begins. `Begin(log: QuestLog)` (a level started), `Render(log)` (call each frame; redrawn only when `log.Version` changes). Display-only (`input: false`). |
| `ShoutView extends GameComponent` | `view/ShoutView` | What the NPCs shout (`story/Shouts`), in speech bubbles over them: the skin's `speech` tooltip pointing at each NPC's sprite (the part the atlas trimmed it to, so at the figure rather than the room over its head), in its own `UiLayer` (`input: false`), kept to the play area. `new ShoutView(level, camera)`; `Begin(talkers, context: DialogContext)` (a level started: one `Shouter` for each NPC whose script has a shout part; pass none for no shouting), `Render(seconds, hearers: ReadonlyArray<Vec2Like>)` (each frame: moves them on, with the centres of the heroes who can hear - a cell's NPC shouts while one is `InEarshot` and the cell `IsCellVisible`), `Hush()` (a talk started). `DungeonMain` drives it, and doesn't `Render` it during a talk. |
| `TilePlacement` | `view/helpers/TilePlacement` | Pure: `TileRect(view: CameraView, cell, z, size, offset): PlacedRect` - where `TileMapView` draws a tile `size` pixels big, `offset` up and left of a cell's corner, on a cell of height `z`, in the camera's root (that height's band's scale and origin). `CameraView = { centre, baseWidth, baseHeight, scale, zoom, currentZ }`, as the `Camera`'s getters give them. |
| `GlowLayer extends Container` | `view/GlowLayer` | Glows added onto what's beneath them, from a pool of sprites: `Begin()`, `Add(x, y, look, pixelsPerTile)` per glow, `End()`. `CreateGlowTexture()` makes the soft white texture they're drawn with (the caller destroys it). |
| `Glow` | `view/helpers/Glow` | Pure: `GlowTextureSize`, `GlowRadius` (1.25 tiles), `GlowStrength` (0.3), `GlowFlameY` (0.3 - a lit tile's glow sits this far down its art), `OrbCoreRadius`; `GlowPixels(size)` (premultiplied white, fading like `LightFalloff`), `type GlowLook = { tint, alpha, radius }`, `LookOfGlow(rgb, scale, out)` (the light's colour at full saturation, stronger the brighter it is, swelling a little as it flickers), `LookOfOrbCore(rgb, scale, out)` (small, pale and nearly opaque). |

## Player input

`@logic-incubator/engine/input/PlayerControl`:

```ts
interface IPlayerInput {
    direction: Vec2;      // movement
    firing: boolean;      // Space, or the right stick pushed
    aimX: number;         // the right stick's horizontal component (0 from keyboard): sets facing
    casting: boolean;     // L, or the gamepad's Y (top face) button: calls up the hero's light spell
    warping?: boolean;    // K, or the gamepad's X (left face) button: a hero far from the rest of the party joins the nearest (see World)
    seq?: number;         // online: which of its player's inputs this is, from 1 (see Online play)
}
type InputDevice = { keyboard?: boolean; pad?: number };   // the keyboard, a gamepad by its browser index (from 0), or both
const DefaultInput: InputDevice = { keyboard: true, pad: 0 };

new PlayerControl(device: InputDevice = DefaultInput);   Get(): IPlayerInput        // a shared object, refilled
```

`DungeonMain` makes one `PlayerControl` per hero, for their `HeroSlot.input` (none for a hero whose `input` is `null`, who gets no input), and hands
what each reads to `World.Step` every step; no hero reads a device itself.

Keyboard: arrows or WASD, Space, L, K. Gamepad: left stick moves, right stick fires/aims, Y casts, X warps. A device with both reads the gamepad
only while no key is down. Give each couch player their own device - `{ keyboard: true }` for one, `{ pad: n }` for each of the others - so no
two read the same one.
`@logic-incubator/engine/input/StickInput`: `IsStickPushed(stick: Vec2Like | null): boolean` - a stick at rest is non-null but zero.

---

## Online lobby

`@logic-incubator/engine/net/...` - the dungeon's side of online play, on a `RelaySession` ([Net](#net)): the lobby messages, getting the
same level onto every machine, and the host's and guests' lobbies. All pure.

### Messages

`@logic-incubator/engine/net/NetMessages` - a kind byte, then JSON (a `level`'s body is its bytes).

```ts
NetVersion = 6;     // a guest on another is refused ("version"); raise it whenever a message changes - this file's or PlayMessages' - or how a level sent in one is read
NameLength = 12;

type LobbySeat = { peer: number; name: string; character: string | null };   // host's seat first; character: a game's id, null while choosing
type RefusedReason = "version" | "started" | "full" | "gone";   // started: also a rejoin token it doesn't know; gone: away too long
type StartLevel = { bundle: string | null; hash: string; sent: boolean };      // sent: the host sends the level whole after the start

type LobbyMessage =
    | { t: "hello"; version: number; name: string; rejoin?: string } // guest -> host, first - with rejoin, the token of a guest coming back
    | { t: "refused"; reason: RefusedReason }                        // host -> guest
    | { t: "lobby"; seats: LobbySeat[] }                             // host -> each guest let in, on every change
    | { t: "pick"; character: string | null }                        // guest -> host
    | { t: "start"; seed: number; level: StartLevel; seats: LobbySeat[]; token?: string }   // host -> each guest, with a token of its own
    | { t: "need-level" }                                            // guest -> host: my copy isn't yours
    | { t: "level"; packed: Uint8Array }                             // host -> guest: PackLevel's bytes
    | { t: "rejoined" }                                              // host -> guest coming back: you're in, as the hero you were
    | { t: "say"; text: string }                                     // guest -> host: a chat line as typed (kinds 9 and 10)
    | { t: "chat"; line: ChatLine };                                 // host -> each guest who hears it (see Chat, below)

EncodeMessage(message): Uint8Array
DecodeMessage(bytes): LobbyMessage | null      // null for an unknown kind, garbled JSON or missing fields
CleanName(name, fallback): string             // control characters out, spaces squeezed, cut to NameLength; fallback if empty
UniqueName(name, taken): string               // name made unlike every one of taken (any case): "Sam 2", "Sam 3"... within NameLength
```

### Chat

`@logic-incubator/engine/net/Chat` - the rules of the players' chat; the lobbies carry it (`Say`, `CHAT`, below).

```ts
ChatLength = 120;  ChatHistory = 50;           // the most characters a line keeps; the lines a lobby keeps
ChatBurst = 5;  ChatBurstMs = 5000;            // lines one player may say in that long - the host drops the rest

type ChatLine = { seat: number; from: string; text: string; whisper?: { seat: number; name: string } };
// seat: who said it, by their place in Seats (online also their hero's slot) · from: their name then · whisper: who it was for

CleanChat(typed): string                       // control characters out, spaces squeezed, trimmed, cut to ChatLength
ParseChat(typed, names, self): { text: string; to: number | null } | string | null
// to: the seat it's whispered to ("@name text", any case, the longest name that fits), null for everyone · null: nothing to say ·
// a string: why it can't be said - "No one here is called x.", "You can't whisper to yourself.", "Say something after @Sam."
ChatSpeaker(line, you): string                 // "Sam", "Sam TO Ann" - the reader's own seat as YOU
new ChatLimiter(burst = ChatBurst, ms = ChatBurstMs, now = Date.now): { Allow(who: number): boolean }
```

### Level transfer

`@logic-incubator/engine/net/LevelTransfer`

| Function | |
| --- | --- |
| `LevelHash(file: LevelFile): string` | FNV-1a over the level's JSON, and the JSON's length: `"9f3c01a2-339012"`. The same level parsed from the same file hashes the same on any machine. |
| `PackLevel(file): Promise<Uint8Array>` | A format byte, then the JSON gzipped (`CompressionStream`), or plain where a browser has no `CompressionStream`. Level 1's 339 KB packs to a few tens of KB. |
| `UnpackLevel(packed): Promise<LevelFile>` | Back again; rejects for bytes that aren't a packed level file. |

### HostLobby and GuestLobby

`@logic-incubator/engine/net/Lobby` - eventemitter3s, so a component can `Listen` to them.

```ts
LobbyEvents = { CHANGED: "changed", STARTING: "starting", STARTED: "started", CLOSED: "closed", DROPPED: "dropped", REJOINED: "rejoined", CHAT: "chat" }
// changed () - Seats changed · starting () - a guest's: the host has started, the level is being made ready
// started (start: LobbyStart) · closed (reason: string) - once; see LobbyClosedText
// dropped () - a guest's, during the run: its connection has gone and it's getting back in · rejoined () - it's back, in Session
// chat (line: ChatLine) - a line this player hears: to everyone, or whispered to or by them

ReconnectForMs = HoldAwayMs (60000)   // how long a guest keeps trying to get back in - as long as the host holds its hero
QuietForMs = 8000                     // nothing heard from the room for this long during the run, and a guest takes its connection for lost
interface RejoinHandler { CanRejoin(index: number): boolean; Rejoin(index: number, peer: number): void }   // a HostSession

type LobbyStart = { seed: number; bundle: string | null; level: LevelFile; seats: LobbySeat[]; you: number };   // you: this machine's index in seats
type HostLevel = { bundle: string | null; file: LevelFile; shipped: boolean };   // shipped: the game's own, which every copy has in bundle
LobbyClosedText(reason): string    // "The host has left." / "That game has already started." / "You were away too long." /
                                   // "Lost the connection, and couldn't get back in." (lost) / "Lost the direct link to the host." (link) /
                                   // "Lost the connection (...)." ...

// Both
lobby.Code: string;  lobby.Seats: ReadonlyArray<LobbySeat>;  lobby.Mine: LobbySeat | undefined
lobby.IsHost: boolean;  lobby.IsOpen: boolean;  lobby.Leave(): void
lobby.Session: RelaySession             // the room - what play goes on in once the run has begun (CreateNetPlay)
lobby.MySeat: number                    // this player's place in Seats; -1 for a guest not yet let in
lobby.Say(typed: string): string | null // a chat line ("@name text" whispers) - null once it's on its way, or why it can't be said
lobby.Chat: ReadonlyArray<ChatLine>     // the last ChatHistory lines heard, oldest first

new HostLobby(session: RelaySession, name: string)      // in the room session opened
host.Pick(character: string | null): void             // the host's own; not after the start
host.CanStart: boolean                                // everyone has picked, and it hasn't started
host.Started: boolean
host.Start(level: HostLevel, seed = NewSeed()): Promise<LobbyStart>   // rejects unless CanStart
host.SetRejoin(handler: RejoinHandler | null): void   // what lets a guest back into the run - CreateNetPlay sets the HostSession

new GuestLobby(session: RelaySession, options: GuestLobbyOptions)
type GuestLobbyOptions = {
    name: string;
    shippedLevel: (bundle: string | null) => Promise<LevelFile | undefined>;
    reconnect?: () => Promise<RelaySession>;          // a new place in the same room (RelaySession.Join with session.Code) - without
};                                                    // it, the lobby closes when its connection does
guest.Pick(character: string | null): void            // asks the host; Seats shows it once the host has it
guest.Joined: boolean                                 // the host has let this guest in (Mine is set)
guest.Started: boolean                                // the host has started; the level may still be on its way
guest.Reconnecting: boolean                           // between DROPPED and REJOINED (or CLOSED)
```

How it runs:

- A guest says `hello` as its lobby is made; the host seats it (in peer order, its name cleaned, `PLAYER n` if empty) and from then on sends
  it `lobby` with every seat whenever anything changes - to each guest let in, never as a broadcast, so a guest still saying hello hears
  nothing early. Refused: another `NetVersion`, a run already started, or four seats taken. A guest who leaves loses their seat.
- **Picking is being ready.** `CanStart` once every seat has a character; the host's `Start` sends `start` (seed, level, seats) to each guest
  and emits `STARTED` itself.
- **The level.** For a `shipped` level, a guest asks its `shippedLevel(bundle)` for its own copy and plays it if `LevelHash` matches;
  otherwise it sends `need-level` and the host sends that guest the level, packed. A level that isn't shipped - an editor level - is sent
  to every guest right after the start, unasked. Either way the guest emits `STARTED` with the level in hand.
- The host leaving closes the room (`CLOSED` with `host-left` at every guest); `Leave` closes with `left`; a lost connection closes with its
  reason - but see below. A lobby is done with after `CLOSED`. Once the run has begun the host keeps every seat, whoever leaves.
- **Getting back in.** The host's `start` gives each guest a random token. A guest given `reconnect` whose connection goes once its run has
  begun (`STARTED`) - closed, nothing heard for `QuietForMs` (`RelaySession.Drop("quiet")`), or its open direct link to the host ended
  under it (`UNLINKED` with `wasOpen`; `Drop("link")`), as what was on its way may be lost - emits `DROPPED` and tries again after
  0.5, 1, 2, then every 4 s: `reconnect()`, then `hello` with its token, waiting up to 5 s for the answer. The host's lobby looks the token
  up and asks its `RejoinHandler`: `rejoined` (it moves the seat to the new peer, calls `Rejoin(index, peer)` - the run sends its
  catch-up straight after - and emits `CHANGED`), or refused `gone` (`CanRejoin` false) or `started` (a token it never gave, or no
  handler). The guest emits `REJOINED` the moment the answer comes, so the run is listening on the new `Session` for the catch-up. It
  closes with `host-left` if the room has gone (`no-room`), with the refusal's reason, or with `lost` once `ReconnectForMs` is up.
  A guest leaving (`Leave`), the host leaving, or a lobby without `reconnect` or before the run has begun closes as it always did; a
  link ending before the run, or one that never opened, changes nothing - the relay carries on.
- **Chat**, before the run and during it. Every line goes through the host. A guest's `Say` reads the line first (`ParseChat`, against its
  `Seats`) and returns what's wrong at once - else it sends `say`, or returns that it isn't connected while it's getting back in. The host
  reads it again against its own seats, drops it past `ChatBurst` lines in `ChatBurstMs` (`ChatLimiter`) or from a peer it hasn't let in,
  and sends `chat` to everyone - or, for a whisper, only to the player it's for and the one who said it. The host's own lines go the same
  way, without the limit. Every lobby that hears a line keeps it (`Chat`) and emits `CHAT`, so the speaker sees theirs once the host has
  passed it on. The host gives a guest whose name is already taken another (`UniqueName`), so `@name` means one player.

## Online play

`@logic-incubator/engine/net/...` - playing the run the lobby started: the host's world is the run's, each guest draws it and moves its own hero
ahead of it. All pure. A game makes one with `CreateNetPlay` on `STARTED` and hands it to `DungeonMain` (`DungeonMainOptions.net`), which
drives it - see [DungeonMain](#dungeonmain).

### NetPlay

`@logic-incubator/engine/net/NetPlay`

```ts
CreateNetPlay(lobby: HostLobby | GuestLobby, start: LobbyStart, options?: PlaySessionOptions): NetPlay   // a HostSession or a GuestSession, in lobby.Session
// - and kept in the run when a guest's connection goes: the host's lobby asks the HostSession (SetRejoin); a guest's moves to its new Session on REJOINED
type PlaySessionOptions = { now?: () => number };   // this machine's clock in ms - performance.now by default

interface NetPlay {
    readonly IsHost: boolean;
    readonly You: number;                           // the hero played here (this machine's seat)
    readonly Connected: boolean;                    // in touch with the run - false on a guest from its connection going until it's back and caught up
    readonly Entities: EncounterView | null;        // what to draw of monsters, shots and spawners: null on the host (its own encounter), the Replica on a guest
    Begin(context: NetLevelContext): void;          // a level has started here (every LEVEL_CREATED)
    Step(local: ReadonlyArray<IPlayerInput | undefined>): void;   // one step; local[i]: hero i's input, read on this machine
    Frame(frames: number): void;                    // one display frame, before drawing
    DrawOffset(index: number): Vec2Like | null;     // how far from where they are hero `index` is drawn (a guest's own, while a correction is drawn away)
    Record(event: string, args: ReadonlyArray<unknown>): void;    // an event the world emitted - the host sends it on
    Restart(): void;                                // the host starts the level over, for everyone; a guest's does nothing
    Stats(): string[];                              // lines for a developer's eye (round trip, snapshot sizes, corrections...)
    End(): void;                                    // stops listening and sending - on leaving the run (a guest's tells the host first: its hero goes at once)
}

type NetLevelContext = {
    world: World;                                   // just Reset - stepped by the host, copied into by a guest
    level: NetLevel;                                // a WorldLevel with doors and SetDoorOpen (Level is one)
    emit: (event: string, ...args: unknown[]) => void;   // the dispatcher a guest emits the host's events on
    restart: () => void;                            // starts the level over here - a guest's, when the host's does
    sizeFor: (name: string) => { width: number; height: number } | undefined;
};
```

### HostSession and GuestSession

`@logic-incubator/engine/net/HostSession`, `GuestSession` - both `extends PlaySession` (`net/PlaySession`: listens to the session's messages and
departures, answers pings and pings its peers once a second, keeping each one's round trip; sends each message by a direct link's fast
lane when `MayBeLost(message)` - inputs, pings, pongs, and a snapshot with no events - and reliably otherwise; `BytesText(bytes)` and
`ByteRate` for `Stats`).

| | Host | Guest |
| --- | --- | --- |
| `Begin` | Waits for every guest still in the room to say it has the level ready (an empty input message), or `WaitForGuestsMs` (10 s); departed heroes are removed again, and away ones set away (those whose connection has gone aren't waited for). | A new `Replica` from the level's spawners; sends "ready"; plays any snapshots that came before it. |
| `Step` | Each guest's hero plays its waiting inputs (`RemoteInput.Take`), this machine's hero its own; `World.Step`; a snapshot every `SnapshotEvery` (3) steps and as the level ends. | Its own hero steps ahead (`Prediction.Step`); a shot it fires flies at once as a stand-in; sends the last `InputsSent` (6) inputs. |
| A snapshot | - | Its events, then the doors and the world - but a snapshot no newer than the newest it has (overtaken on a link's fast lane) is only its events. |
| `Frame` | Pings. | Pings; moves the `PlayClock` on; samples the `Replica`; puts the other heroes where they were at that moment; settles the correction; updates what's seen. |
| `Record` | Turns the engine's events into `NetEvent`s for the next snapshot (`QUEST_UPDATED` into a `quest` event, by its index in `World.quests`). | - |
| A `quest` event | - | `QuestLog.Follow(index, state, progress)` - its quests are the host's - and `QUEST_UPDATED`, unless it's catching up. |
| `Restart` | The next round: tells every guest, forgets their inputs. | - (a `restart` message calls `restart`) |
| A guest leaves (`leave`, from its `End`) | `World.RemoveHero` and a snapshot at once. | (the host leaving closes the lobby) |
| A guest's connection goes, or it sends nothing for `AwayAfterMs` (3 s) | `World.SetAway` and a snapshot at once; its inputs wait. Its next input puts the hero back. One whose connection went is taken out (`RemoveHero`) after `HoldAwayMs` (60 s). | Its hero stands still (`Step` does nothing while not `Connected`). |
| A guest comes back | `CanRejoin(index)` (not ended, not departed); `Rejoin(index, peer)`: listens for that hero's inputs from `peer`, numbered afresh, sends `catch-up` (with the level's end, if it's over), then a snapshot at once. | `Rejoin(session)`: listens there, lets go of the inputs the host never had, and plays nothing till the `catch-up`: what lasting happened that it hasn't done, done quietly (no events emitted), and the level's end emitted if it hadn't heard it - or, for a new round, its level started over and caught up as it begins. |

`HostSession.Round`, `Playing` (every guest in the room ready), `CanRejoin`, `Rejoin`; `GuestSession.Prediction`, `Playing`, `DrawnTick`,
`Rejoin`; `Prediction.Forget()` (drops the pending inputs, numbering on). The host's `Stats` says per guest how it's reached (`DIRECT`, `RELAY`
or `RELAY, LINKING`), its round trip and inputs waiting, `AWAY, NOTHING FOR n S`, `GONE, HELD n S MORE` or `LEFT`; a guest's says the same
of the host after its round trip.

### Messages

`@logic-incubator/engine/net/PlayMessages` - bytes, kinds 16-22 after the lobby's (`EncodePlay(message, writer?)`, `DecodePlay(bytes): PlayMessage | null`):

```ts
type InputMessage = { t: "input"; round: number; inputs: IPlayerInput[] };   // guest -> host: the newest few, numbered (seq); none: "ready"
type Snapshot = { t: "snapshot"; round; tick; heroes: HeroSnapshot[]; monsters: MonsterSnapshot[]; projectiles: ProjectileSnapshot[];
                  doors: boolean[]; flashing: number[]; events: NetEvent[] };   // host -> every guest
type RestartMessage = { t: "restart"; round: number };                      // host -> every guest
type PingMessage = { t: "ping" | "pong"; id: number };
type CatchUpMessage = { t: "catch-up"; round: number; events: NetEvent[] };   // host -> a guest back in: the round, every lasting event in it, then its end if it's over
type LeaveMessage = { t: "leave" };                                          // guest -> host: leaving for good
type NetEvent = pickup | keys | spawner | killed | damaged | died | all-died | completed | shot | quest   // the engine's events, and a new kind of shot's setup
                                         // quest: { e: "quest"; index; state: QuestState; progress } - quest index of the level's moved on (QUEST_UPDATED)
IsLastingEvent(event): boolean           // pickup, keys, spawner, shot, quest - what changes the level or a hero for good, and goes in a catch-up

QuantiseInput(input, seq): IPlayerInput   // what the host will have of it: each axis to 1/127 - a guest steps its own hero with this, so both agree
```

A `HeroSnapshot` carries `gone` and `away` (flags). An input is 4 bytes (each axis a signed byte, flags). A hero's position, speed and timers are 64-bit floats, so a guest's hero lands exactly where
the host's is; monsters and shots are quarter pixels (16 bits each). `round` (a byte) counts the host's restarts: anything from another round is
ignored.

### Guest pieces

| Module | |
| --- | --- |
| `RemoteInput` | The host's queue of one guest's inputs, by `seq`: `Receive(inputs)`, `Take(): IPlayerInput[]` (the next one, none while it hasn't come, two once more than `MaxWaiting` (4) are waiting; past 30 waiting it skips a lost one), `Acked` (the last played), `Waiting`, `Started`, `Reset()`. |
| `PlayClock` | Which of the host's steps a guest draws: `DrawDelayMs` (100) behind the newest, trusting the quickest arrivals and moving smoothly when that changes. `Observe(tick, nowMs)` for each snapshot, `Advance(nowMs, frames)` each frame, `Tick` (fractional), `Started`, `Reset()`. |
| `Replica` | The guest's copy of the host's monsters, shots and spawners - an `EncounterView`. `new Replica({ you, sizeFor })`; `Reset(spawners)`, `AddShot(index, setup)`, `Push(snapshot)` (keeps the last 20), `Sample(tick, frames)` (each monster and shot between the snapshots either side of `tick`, carried on up to 6 steps past the newest), `HeroAt(index, tick): HeroMoment \| null`, `Newest`. This machine's own shots are stand-ins from the moment they're fired (`Fire(from, direction, setup, seq)`, `StepStandIns(isBlocked)`), stopped by walls and by monsters as drawn, until the host's copy has gone or the host played that input without one. |
| `Prediction` | The guest's own hero, ahead of the host: `Step(hero, input, others, collider)` numbers and plays an input, kept until the host has played it; `Reconcile(hero, snapshot, others, collider)` starts from the host's word and plays the rest again, leaving the difference in `Offset`, which `Settle(frames)` draws away (or jumps, past two tiles); `Corrections` (differences over half a pixel), `LastError`, `Pending`, `Recent(n)`, `Reset()`, `Forget()` (drops the inputs the host never had - after the connection went - numbering on). |
| `HeroSync` | `HeroSnapshotOf(hero, ack)` and `ApplyHeroSnapshot(hero, snapshot)` (everything but where they stand, which the caller places). |

## Quests and dialogs

Pure modules under `story/` (no pixi), and the two brushes' values; the [user guide 9.10](user-guide.md#910-npcs-dialogs-and-quests) shows them at work, and [9.11](user-guide.md#911-quest-scripting-by-example) has a worked script for each kind of quest.

`@logic-incubator/engine/story/Quests`:

```ts
type QuestState = "none" | "active" | "complete" | "finished";   // not given, under way, its goal met, handed in
QuestStates: ReadonlyArray<QuestState>                            // in that order
type QuestDef = { id: string; name: string; text?: string; goal: QuestGoal; start?: boolean; ends?: boolean };
type QuestGoal = { kind: string; [field: string]: unknown };      // a registered kind's (QuestGoalKinds), and its own fields
type CollectGoal = { kind: "collect"; count?: number };           // count 0 or left out: every pickup marked for it
type KillGoal = { kind: "kill"; count?: number; monster?: MonsterType };   // monster: that type counts too, while under way
type ScriptGoal = { kind: "script" };                             // met only by a dialog's `complete`
type QuestHappening = { kind: string; quest?: string; [field: string]: unknown };   // CollectHappening { pickup }, KillHappening { monster }
interface QuestLevel { Marked(kind: string, quest: string): number }

type QuestGoalType = {
    label: string;                                                 // what the editor calls it
    Default(): QuestGoal;                                          // a new one, as the editor starts it
    IsValid(goal): boolean;
    Target(goal, quest, level: QuestLevel): number;                // how far it has to go: at least 1
    Advance(goal, quest, happening, active: boolean): number;      // how far a happening takes it; 0 for not at all
};
RegisterQuestGoal(kind, type): void       // adds (or replaces) a kind, beside collect, kill and script
QuestGoalKinds(): string[]                // in the order registered - what the editor offers
QuestGoalFor(kind): QuestGoalType | undefined
IsQuestId(id): boolean                    // one word: letters, digits, - and _
IsQuestDef(value): boolean                // an id, a name, a goal of a kind there is, well formed
ReadQuests(value): QuestDef[]             // a level file's: the well-formed ones, the first of each id; anything else is none
DefaultQuest(id): QuestDef

type QuestStatus = { def: QuestDef; state: QuestState; progress: number; target: number };
type QuestChange = (status, was: QuestState, index: number) => void;

new QuestLog(changed?: QuestChange)
log.Quests: ReadonlyArray<Readonly<QuestStatus>>   // in the level's order
log.Version: number                       // goes up with every change
log.Reset(defs, level): void              // starts over: start ones active, the rest none, nothing counted (no change told)
log.Get(id), log.Index(id), log.State(id) // State is "none" for an id the level hasn't got
log.Give(id): boolean                     // none -> active, or straight to complete if its target is already met
log.Complete(id): boolean                 // any but complete or finished -> complete
log.Finish(id): boolean                   // any but finished -> finished
log.Record(happening): void               // moves on each quest it counts for; one under way that reaches its target is complete
log.Follow(index, state, progress): QuestState | null   // as an online guest's: set to the host's, no change told; returns what it was
```

Something marked for a quest counts before the quest is given (`progress` grows while it's `none`), so giving it then completes it at once.

`@logic-incubator/engine/story/DialogScript` reads a script (the language is in the user guide):

```ts
interface DialogContext { quests: QuestLog; flags: Set<string>; Reward(value: PickupValue, sprite: string | null): void }
type DialogCheck = { quests?: ReadonlyArray<string> };   // the level's quest ids, to catch one misspelt; left out, any goes
type DialogParse = { data: unknown } | { error: string };
type DialogActionType = { Parse(words, check): DialogParse; Run(data, context): void };
type DialogConditionType = { Parse(words, check): DialogParse; Test(data, context): boolean };
type DialogStep = say | choices | goto (with a condition) | action | end;   // each with its line, from 1
type DialogScript = { steps: DialogStep[]; parts: { [name: string]: number } };
type DialogError = { line: number; message: string };

ParseDialog(text, check?): { script: DialogScript; errors: DialogError[] }   // a line with a mistake is left out; the rest still plays
DescribeDialogErrors(errors): string[]     // "Line 3: ..."
RegisterDialogAction(name, type), RegisterDialogCondition(name, type)        // a script's own words, by their first word
TestCondition(condition, context): boolean, RunAction(step, context): void
EndTarget = "end"
ShoutPart = "shout"                        // the part an NPC shouts from: a talk never runs into it, even from the top
```

`@logic-incubator/engine/story/DialogRunner` plays one: `new DialogRunner(script, context)`; `Start()`, `Next()` (on from a line with no
choices) and `Choose(index)` (of the choices offered) each run the script on to the next thing said and return it as a
`DialogLine = { speaker; text; choices: string[] }` (the choices offered under it, their conditions tested), or null once the talk is over
(`Ended`). A run of more than 1000 steps without a line ends it, so a loop can't hang the game.

`@logic-incubator/engine/story/Shouts` is what an NPC shouts as a hero comes near:

```ts
ShoutRange = 5                             // tiles, centre to centre, that a hero comes within to hear them
ShoutDelay = 0.6                           // seconds from a hero coming near to the first shout
ShoutGapMin = 5, ShoutGapMax = 9           // seconds of quiet between shouts
ShoutFadeIn = 0.15, ShoutFadeOut = 0.3     // seconds a bubble takes to come and go
HasShouts(script): boolean                 // it has a shout part
ShoutLines(script, context): string[]      // the text of every line said in the shout part, following its ifs and ->s (who says it dropped; actions and choices passed over)
ShoutSeconds(text): number                 // how long a shout stays up: 2 s and 0.05 s a character, at most 5
InEarshot(centre, cell, tileSize): boolean // a hero's centre (pixels) within ShoutRange tiles of the cell's

new Shouter(random = Math.random)          // when one NPC shouts, and what
shouter.Update(seconds, near, lines: () => ReadonlyArray<string>): string | null   // each frame: what it's shouting now; lines asked for only as a shout starts
shouter.Text: string | null, shouter.Fade: number   // 0 to 1, as the bubble comes and goes
shouter.Hush(): void                       // stops now and keeps quiet a gap
```

A shout picks one of the lines at random, not the one before when there are others, and stays up `ShoutSeconds`; then the NPC is quiet
for a gap, and shouts again only while a hero is still near. A hero coming near starts at least `ShoutDelay` of quiet.

`@logic-incubator/engine/story/Talk`: `type DialogValue = { script: string }` (a `DIALOG` brush's), `IsDialogValue(value)`,
`DefaultDialogValue()`; `BumpedNpc(position, direction, isNpc, tileSize): Vec2Like | null` - the NPC's cell a hero at `position` (their box's
top-left, in pixels) is walking into, pushing `direction` (past 0.3 on an axis), felt 2 pixels beyond their box.

`@logic-incubator/engine/level/entities/Bosses`: `type BossValue = { monster: MonsterType; hitPoints?: number; quest?: string }`,
`type Boss = Vec2Like & { value: BossValue }`, `IsBossValue(value)` (the only value with a lone `monster`), `DefaultBossValue()` (the roster's
first default monster, at three times its hit points).

---

# ui

`@logic-incubator/ui` - a skinnable Pixi UI kit: widgets, keyboard / gamepad / pointer focus navigation, and the asset bundle (art, bitmap fonts, a skin) they are drawn from. Depends on `lib` only
(`engine` and `editor` may use it; it never imports them). Sizes are in UI pixels, which the skin makes `scale` screen pixels each (1 in the game skin, whose art - the Tiny Dungeons UI pack - is enlarged 2x when it is imported). Methods
are PascalCase like the rest.

## UiLayer and ThemeFor

`@logic-incubator/ui/UiLayer`.

| Member | Meaning |
| --- | --- |
| `ThemeFor(game, bundle = "ui"): UiTheme` | The theme for the game's loaded UI bundle - its skin (checked against its art, problems logged) and the canvas as the host text fields sit over. Made once per game and kept. The bundle must be loaded. |
| `default class UiLayer extends GameComponent` | `new UiLayer(options?)`; `Attach` it to a scene (or component) and put widgets in its `root`, which is scaled to the skin's `scale`. |
| `UiLayerOptions` | `{ bundle?: string; wrap?: boolean; input?: boolean }`: the skin's bundle (`"ui"`); whether focus wraps round at the ends of the scope (on); whether the layer takes keys, pad and pointer focus (on - off makes a display-only layer like the HUD, whose widgets take no pointer either). |
| `layer.Theme: UiTheme` | Available once the layer is initialised (attaching it to an initialised component does that). |
| `layer.Ui: UiSystem` | The screen's focus and input; throws for a layer made with `input: false`. It listens only while the layer is shown. |

## UiSystem

`@logic-incubator/ui/input/UiSystem` - `new UiSystem(game, theme, layer: Container)`; a `UiLayer` makes one. Feeds the keyboard (via `game.keyboard` events), the first gamepad and the pointer into a
`FocusManager`, keeps a focus ring on whatever has focus while the keyboard or pad is in use, and registers widgets.

| Member | Meaning |
| --- | --- |
| `focus: FocusManager` | `Focused`, `FocusVisible`, `Focus(id \| null)`, `Move(direction)`, `PushScope/PopScope`, `ConfigureScope(options, id?)` (`{ wrap?, onCancel?, onAccept?, onTab?, initial? }` - `onCancel` of the root scope is what cancel does with nothing open: a game's pause; `onAccept` is what accept does while nothing in the scope is focused), `Subscribe(listener)`. |
| `Register(control, options?): () => void` | Makes a `UiControl` focusable: `{ id?, scope?, neighbours?, scroll? }`. Hovering focuses it (no ring), the arrows move to the nearest enabled one in that direction, accept presses it. `scroll` scrolls that `UiScrollView` to a control moved to. Returns what undoes it; destroying the control does too. |
| `PushScope(id, options?)` / `PopScope(id)` | A modal takes over focus and cancel until it is popped; focus goes back to what had it. Register a modal's controls first (with `scope: id`), then push, so the first can be focused at once when the keyboard or pad is in use. |
| `Track(widget: { Update(ms) }): () => void` | Calls `widget.Update(ms)` every frame while the system is active (dialogue typing, toasts, a text field's caret, a tile marker). |
| `RegisterScroll(view): () => void` | The mouse wheel scrolls `view` while the pointer is over it. |
| `BindTabs(tabs, scope?)` | The tab keys (Q and E, the pad's shoulder buttons) step through a `UiTabs`. |
| `SetActive(active)` / `Destroy()` | Whether it listens (a scene's UI shouldn't answer keys while another scene is up); tear-down. |

Keys: arrows and WASD move, Enter and Space accept, Escape and Backspace cancel, Q/E and Page Up/Down step tabs. Pad: d-pad and left stick move (past a dead zone of 0.5), A accepts, B and Start cancel, the
shoulder buttons step tabs. Held directions repeat (350 ms, then every 120 ms).

## Skin and UiTheme

`@logic-incubator/ui/skin/Skin` (types), `skin/ParseSkin`, `skin/ValidateSkin`, `skin/ResolveFrames` (pure), `@logic-incubator/ui/UiTheme`.

| Member | Meaning |
| --- | --- |
| `Skin` | `{ name, bundle, scale, metrics?, fonts, colours, buttons, panels, borderStyles, bars, checkboxes?, radios?, sliders?, scrollbars?, tabs?, fields?, slots?, tooltips?, dialogues?, toasts?, windows?, iconRows?, menus?, selectors?, cursors?, playerFrames?, abilities?, skillTrees?, tileMarkers? }` - each a record of named variants. `assets/ui/data/skin.json` is the game skin; `ParseSkin` turns its `"#rrggbb"` colours into numbers. |
| `NineSliceSkin` | `{ frame, insets, edges?, centre?, outset? }`: `edges` and `centre` are `"stretch"` or `"tile"`; `outset` draws the frame beyond the widget's box (a selected tab standing proud) without changing its size. |
| Optional parts | `BarSkin.fillMode: "tile"` repeats a patterned fill; `SliderSkin.vertical` and `ScrollbarSkin.horizontal` are art for the other axis (without them the widget is turned on its side); `ScrollbarSkin.trackThickness` (a rail thinner than the grip) and `thumbLength` (a fixed grip); `TabSkin.width` (tabs of one size) and `vertical` (a column of side tabs); `TooltipSkin.tailDown`/`tailUp` are optional; `DialogueSkin.portraitBeside`, `portraitPadding`, `portraitOverlap` and `nameFrame`, `nameHeight`, `namePadding`, `nameInset`, `nameOffset`, `nameRaise` (a name plate across the box's top); `WindowSkin.titleRaise`, and `close.icon` is optional (a button whose art is the glyph). |
| `Skin.metrics` | Spacings no frame or font sets, by name, in UI pixels: `iconGap`, `lineGap`, `slotGap`, `scrollGap`, `scrollMargin`, `scrollStep`, `caretWidth`, `caretMargin`, `tailMargin`, `tailOverlap`, `slide`, `bob`, `ringGap`, `ringThickness`, `statusGap`. A skin may leave any out. |
| `LoadSkin(assets, bundle = "ui"): Skin` | The data asset `<bundle>.skin`, parsed, with each nine-slice's insets taken from `<bundle>.frames` (the frame index the art tools write) unless the skin gives them. |
| `GameUiAssets(assets, bundle): UiAssets` | The skin's frames and fonts as the game's loaded bundle has them. |
| `ValidateLoadedSkin(skin, assets): string[]` / `ValidateSkin` | What is wrong with a skin: a missing frame or font, an inset that leaves nothing of its frame, a pointer's hot spot outside its picture, a tooltip with one tail. Empty when fine. |
| `new UiTheme(skin, assets, host?)` | `Scale`, `Texture(frame)`, `HasTexture(frame)`, `FontName(key)`, `FontSize(key)`, `Colour(name)`, `Metric(name, fallback)`; `host` is `{ view: HTMLCanvasElement }` (only `UiTextInput` needs it). |

## UiCursor

`@logic-incubator/ui/UiCursor` - the skin's mouse pointers (`Skin.cursors`: `{ frame, x, y }` with the hot spot) on the canvas, as CSS cursors enlarged to the UI's pixel size.

| Member | Meaning |
| --- | --- |
| `new UiCursor(theme, view, host)` | `host` is Pixi's interaction manager (`game.interactionManager`): its cursor modes show the skin's `default`, `pointer` (over anything with `buttonMode`) and `pressed` (while a button is held over it); any other pointer the skin has shows over a display object whose `cursor` is its name. Redrawn when the page resizes the canvas. |
| `Default: string` | The pointer where nothing asks for another: `"default"`, or another of the skin's (`"attack"` over the dungeon). |
| `Destroy()` | The browser's pointer back. |
| `CursorScale(uiScale, shownWidth, canvasWidth)`, `CursorCss(url, cursor, scale)` | Pure: the whole-number size a pointer is drawn at, and its CSS value. |

## Widgets

`@logic-incubator/ui/widgets/<Name>`. Every widget is built from a theme and a skin variant (`new UiSlider(theme, "default", 140, options)`) and sizes itself from the skin. A `UiControl` is a `Container` with
hover / pressed / disabled / focused states (`Enabled`, `Focused`, `State`, `Activate()`); its events are Pixi events: `activate` (a press completed by pointer or accept - not `click`, which Pixi emits itself),
`focuschange`, `destroyed`. Pixi 5.2.1 doesn't announce a destroyed object, so `UiControl` and `UiScrollView` emit `destroyed` themselves; destroying a panel, window, menu or grid destroys what is in it.

| Widget | Constructor and members | Events |
| --- | --- | --- |
| `UiButton extends UiControl` | `(theme, variant, text, { width?, height?, icon? })`; `ButtonWidth`, `ButtonHeight`, `SetLabel(text)`. Variants: primary, secondary, small, danger, confirm, icon (with an `icon`), and close, reset, validate (the pack's round buttons, drawn with their glyph). | `activate` |
| `UiMenu` | `(theme, variant, labels, width?)` - a column of buttons; `Buttons`, `MenuWidth`, `MenuHeight`. | `activate (index, button)` |
| `UiCheckbox`, `UiRadio` (+ `UiRadioGroup`) | `(theme, variant, label, checked = false)`; `Checked`. The game skin draws a checkbox as a switch. A group makes exactly one radio chosen: `new UiRadioGroup(radios, selected)`, `Selected`, `Select(i)`. | `change (checked)`; group: `change (radio, index)` |
| `UiSlider` | `(theme, variant, length, { min, max, step, value, vertical })`; `Value`, `SliderWidth`, `SliderHeight`. Takes the arrows along its axis when focused. | `change (value)` |
| `UiSelector extends UiControl` | `(theme, variant, width, choices, { selected?, wrap? })` - a choice with an arrow either side; `Selected`, `Value`, `SetChoices(choices, selected?)`, `SelectorHeight`. Pressing an arrow (or left / right when focused) steps; accept steps on; without `wrap` the arrow at an end is dimmed. | `change (index, choice)` |
| `UiTabs` | `(theme, variant, contents, options \| selected = 0)`: `contents` are labels or `{ icon }`; options `{ selected?, mirror? }` (`mirror` flips side tabs to hang off a panel's left edge). `Tabs`, `Selected`, `Select(i, notify?)`, `Step(-1 \| 1)`, `OnChange(listener)`, `StripWidth`, `StripHeight`. The skin's `side` tabs are a column. | via `OnChange` |
| `UiScrollbar`, `UiScrollView` | `UiScrollbar(theme, variant, length, { horizontal? })`: `SetMetrics(content, viewport)`, `Scroll`. `UiScrollView(theme, scrollbarVariant \| null, width, height)`: add to `content`, then `MeasureContent()`; `Scroll`, `ScrollTo`, `ScrollBy`, `EnsureVisible(item)`, `ContentWidth`, `Scrollable`. The view clips to its size. | bar: `scroll`; view: `scrolled` |
| `UiTextInput extends UiControl` | `(theme, variant, width, { placeholder?, maxLength?, allowed?: RegExp, label?, value? })`; `Value`, `Editing`, `Edit(index?)`, `EndEdit()`; `Track` it. A transparent native `<input>` over the field does the editing (IME, undo, clipboard are the browser's) and keeps typed keys from `game.keyboard`. Enter submits, Escape cancels. | `change (value)`, `submit`, `cancel`, `blur` |
| `UiItemSlot extends UiControl`, `UiInventoryGrid` | `UiItemSlot(theme, variant)`: `SetItem({ texture, count?, label? } \| null)`, `SetPlaceholder(frame \| null)` (what an empty slot shows: `slot_icon_helmet`), `Selected`, `SlotSize`; small art is enlarged by whole numbers to fill the slot. `UiInventoryGrid(theme, variant, columns, rows, gap?)`: `Slots`, `SetItems(items)`, `Select(i)`, `Selected`. | grid: `select (index)` |
| `UiIconRow` | `(theme, variant, count, { textures?, scale?, gap? })` - hearts, orbs; `SetValue(value, max)`, `RowWidth`, `RowHeight`. `textures` are the game's own pictures in place of the skin's. | |
| `UiProgressBar` | `(theme, kind, width, value = 0)`; `Value` (0 to 1), `BarWidth`, `BarHeight`. Kinds: hp, mp, xp, gold. | |
| `UiPanel`, `UiWindow`, `UiBorder` | `UiPanel(theme, variant, width, height)`: add to `content`, `InnerWidth`, `InnerHeight`, `PanelWidth`, `Resize`; variants plain, ornate, carved, carved_light, raised, raised_light. `UiWindow(theme, variant, width, height, title)`: a panel with a title plate and a close button (`CloseButton`), `content`, `InnerWidth`, `InnerHeight`; `UiWindow.HeightFor(theme, variant, inner)` is the height that leaves `inner` for the content. `UiBorder(theme, style, width)`: an ornamental line (separator, separator_light); `LineHeight`, `Resize`. | window: `close` |
| `UiTooltip` | `(theme, variant)`; put it in the topmost layer. `Attach(target, content \| () => content): () => void` shows it after the skin's `delay` of the pointer resting (at once on keyboard focus) and hides it on leave or press; `ShowFor(target, { title?, text? }, bounds?)`, `ShowAt(rect, content, bounds?)` (pointing at a rectangle in its parent's coordinates - something drawn that isn't a display object of its own; given the same content again it only moves, so it can follow every frame), `Hide()`, `Owner` (what `ShowFor` showed it for; null when hidden or shown `ShowAt`). The game skin's `speech` variant is a speech bubble (the light raised panel with a point). | |
| `UiDialogue extends UiControl` | `(theme, variant, width, height)`; `Say({ speaker?, text, portrait?, portraitScale? })` (`portraitScale`: how many times to enlarge the portrait, centred in its frame - default 1), `Done`, `Skip()`; `Track` it. A press while typing shows the rest, a press after that emits `advance`. The game skin stands the portrait's frame beside the box and puts the name on a plate across its top, both standing above the box. | `advance` |
| `UiToastHost` | `(theme, variant, max = 4)`; `Push({ title, text?, kind?, seconds? }): () => void` (dismisses it), `Count`, `HostWidth`; `Track` it. A press dismisses a toast; the rest wait their turn. | |
| `UiChatBox` (a `Container`) | `(theme, { width, rows, showSeconds = 8, keep = 50, maxLength = 120, placeholder?, field = "default", font = "body" })` - a chat: lines newest at the bottom, each `{ head?, text, headColour?, textColour? }` (`head: ` in its colour, then the text, wrapped). `Add(entry, show = true)` (`show` false: there to read when opened, not shown now), `Clear()`, `Open(text?)`, `Close()`, `IsOpen`, `Entries`, `BoxHeight`; `Update(ms)` it. Closed, a line shows for `showSeconds` then fades; open, the last `rows` rows over a shade and a `UiTextInput` under them, which takes the keys. Enter sends, Escape or clicking away closes. A character the font can't draw shows as `?`. | `send (text)`, `close` |
| `UiPlayerFrame` | `(theme, variant)` - a character's HUD frame: `SetPortrait(texture \| null)`, `Health`, `Energy` (0 to 1), `SetStatuses(frames)`, `FrameWidth`, `FrameHeight`. | |
| `UiAbilitySlot` | `(theme, variant, icon?, glyph?)` - an ability in its frame with a prompt above: `SetIcon(texture \| null)`, `SetGlyph(frame, fallback?)`, `GlyphPressed`, `Cooldown` (1 just used, 0 ready), `SlotWidth`, `SlotHeight`. | |
| `UiStatusRow` | `(theme, statuses?, gap?)` - status icons in a row: `SetStatuses(frames)` (the same list again does nothing), `RowWidth`. | |
| `UiInputGlyph` | `(theme, glyph, { fallback? })` - a button prompt: `SetGlyph(glyph, fallback?)`, `Pressed` (the `_pressed` look where there is one), `GlyphWidth`, `GlyphHeight`; a glyph the bundle lacks is written as text. | |
| `UiSkillTree`, `UiSkillNode extends UiControl` | `UiSkillTree(theme, variant, { skills: [{ id, x, y, icon, tier?, unlocked? }], rings?: [{ id, x, y, unlocked? }], links: [[id, id]] })` - skills and rings in grid cells, links straight between them, lit when both ends are unlocked. `Skills` (to register), `Selected`, `Select(id)`, `IsUnlocked(id)`, `SetUnlocked(id, unlocked)`, `TreeWidth`, `TreeHeight`. A node: `Id`, `Unlocked`, `Selected`; its locked look is its icon's name with `_locked`, its badge `tier_<tier>`. | tree: `select (id)` |
| `UiTileMarker` (a `Sprite`) | `(theme, variant)` - brackets pulsing round a tile: `SetTile(x, y)` (the tile's top-left in its parent's pixels), `Update(ms)`, `Restart()`. | |
| `NineSlice`, `UiText` | `NineSlice(texture, { insets, edges?, centre?, outset? }, width, height)`: whole-pixel nine-slice `Resize`, `SliceWidth`, `SliceHeight` (the box, not the outset). `CreateText(theme, text, { font?, colour?, align?, maxWidth? })`, `CreateMeasure(theme, font?)`: bitmap text drawn at the skin font's size. | |

## Pure rules

Plain-Node modules the widgets are built on, each with unit tests: `geometry/SliceRects`, `geometry/BorderRects`, `widgets/ButtonLook`, `BarMath`, `SliderMath`, `SelectorMath` (`StepChoice`), `ScrollMath`,
`TextInputModel`, `Typewriter` (`Typewriter`, `WrapText`), `TooltipPlacement`, `ToastQueue`, `ChatLog` (`ChatLog`, `WrapChat`), `IconStates`, `InputGlyphs` (`KeyGlyph`, `PadButtonGlyph`, `DpadGlyph`, `StickGlyph`, `MouseGlyph`,
`PressedGlyph`), `SkillTreeLayout` (`NodeRect`, `LinkRect`, `TreeSize`), and `input/` `UiAction`, `KeyMap`, `PadMap`, `InputRepeater`, `UiInputCore`, `FocusManager`.

The package's art tools (`packages/ui/tools`, run by plain node) are described in its README: importing the Tiny Dungeons pack (`import-pack.mjs`), the Aseprite template and slicer, and the font converter.

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
`DATA_BRUSH_INC`, `DATA_BRUSH_DEC`, `SET_DATA_BRUSH_VALUE`, `ZOOM_IN`, `ZOOM_OUT`, `MOUSE_BUTTON`, `CHANGE_SCENE`, `RESET`, `DUPLICATE_LAYER`,
`MOVE_PLAYER_LAYER_UP`, `MOVE_PLAYER_LAYER_DOWN` (see `PlayerLayerMoved`), `REFRESH`, ...),
`const enum EditorTool { BRUSH = "brush", ERASE = "erase", DATA_SELECT = "data-select", STAMP = "stamp", DROPPER = "dropper", FILL = "fill", MOVE = "move" }`,
`const enum MouseButtonState { LEFT_DOWN, RIGHT_DOWN, UP, MIDDLE_DOWN }`, `IMPLICIT_LAYER_ID = -99999` (the always-present `attributes` data layer),
`PLAYER_LAYER_ID = -99998` (the always-present player layer, `isPlayer` - a divider showing where the figures are drawn among the tile layers; never selected, painted, hidden, renamed, removed or duplicated - `SELECT_LAYER` with it changes nothing), `PlayerLayerMoved(layers, up)` (the player layer moved past the next tile layer up or down the list, stepping over "attributes"; the same array when there's none that way),
`MaxEditableLayers = 16`, `EditableLayerCount(layers)` (the tile layers), `DefaultTileLayerKinds` (`["floor", "walls"]`), `WithDefaultLayers(layers)` (adds "attributes", a floor and a walls layer, and the player layer - last, over every tile layer - if missing, and selects the floor if nothing is; the store applies it on every action and load), `NextTileLayerId(layers)`, `IsRemovableLayer(layers, layer)` (not "attributes" or the player layer, nor the last floor or walls layer), `ADD_LAYER` takes an optional `kind` (a new or duplicated layer goes last, or just before the player layer while that's last, so it's drawn under the figures), `ToolFitsLayer(tool, layer)` (data-select is only usable with a data layer selected - the store switches back to the brush when it isn't, and the toolbar hides its button), `PaintsWithBrush(tool)` (the brush, stamp and fill: the tools that show the brush on the cursor, and the ones `BRUSH_CHANGED` keeps - it switches any other tool to the brush), `type DataBrush = { name; colour; value }`, `type DataBrushIcons = { readonly [K in DataBrushName]?: string }`,
`DataBrushIcon(icons, name)`, `type LayerMemory = { tool; brush }`, `interface IEditorState` (its `layerMemory`, keyed by layer id, is each layer's tool and brush from when another layer was selected, restored when it is selected again, except when the dropper picked the brush; a layer with none gets the empty brush and keeps the current tool; a data layer always comes back on data-select, whatever its memory says, keeping just the brush - except when the dropper picked a brush on it).

`@logic-incubator/editor/stores/LevelDataStore` - `default class LevelDataStore` (the painted brushes): `type Layer = LevelLayer & { selected; visible }`,
`type LevelDataState = { levelData: LevelData; quests: QuestDef[] }`, `const enum LevelDataActions` (`COPY`, `RESET`, `SET_QUESTS` - `data.quests`, the quest list's -, paint/erase actions, ...).
`Load` gives a level saved without quests (or a generated map) none; `RESET` clears them.

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
| `ui/dialog/FormDialog` | `OpenFormDialog(options: FormDialogOptions): Promise<FormValues \| null>`, `IsFormDialogOpen()`, `InjectFormStyles()` (its look - `fd-overlay`, `fd-panel`, `fd-header`... - for another modal to share); field specs `NumberField`, `TextField`, `TextAreaField` (lines of text: a script - Enter in it is a new line, not Save), `ColourField`, `ToggleField`, `ChoiceField` (exactly one option; an option's `image` draws a picture on its chip, as a multi-choice's does), `MultiChoiceField` (`FieldSpec`), `ChoiceOption`; any field can have `visibleWhen(values)` to show only while it applies to the other values (a pickup's key id only for a key); `IsFieldVisible(field, values)`; options may set `saveLabel` and `cancelLabel` (`null` leaves Cancel out - a message with just an OK, which the sprite editor uses for alerts and confirms) |
| `DataBrushEditors` | `DataBrushEditorFor(name): DataBrushEditor \| undefined` - the dialog definitions for editing a value: `"light"` (brightness, tint, range and flicker), `"spawner"` (the `SPAWNER` brush's name - the same popup for the brush and for a spawner tile), `"pickup"` (the `PICKUP` brush's name - the same popup for the brush and for a tile that gives one; a weapon's shot can be set to give off light, and a light to carry has a light and how long it burns), `"door"` (a door tile's lock: a Locked checkbox that reveals its key id), the height, `"dialog"` (a script box, read as it's typed against the level's quests: the first mistake and how many more) and `"boss"` (its monster, hit points and quest). A pickup and a boss choose the quest they count for from None and the level's. `EditorImages` carries the lookups they need from the game's art and the level (`monster`, `hasSprite`, `quests?`) |
| `DataBrushDialog` | `OpenDataBrushDialog(name, value, context?, quests?)` - the popup for a value, with the level's quests to offer; `MonsterImage(type)` (a monster's chip picture, cached) |
| `QuestEditor` | The quest popup's pure parts: `QuestFields(images)`, `QuestToForm(quest)`, `QuestFromForm(form, was)` (a goal of a kind it doesn't know keeps its fields), `QuestProblem(form, others)`, `NewQuestId(quests)`, `DescribeQuest(quest)` |
| `QuestsDialog` | `OpenQuestsDialog(quests): Promise<QuestDef[] \| null>` - the quest list (Q): Edit, Remove, Add quest; resolves with the new list on Save, null if cancelled or unchanged; `IsQuestsDialogOpen()` |
| `DataLabels` | `PickupLabel(pickup)`, `MapLabel(value)` (the short tag drawn over a value on the attributes overlay: `G10`, `H2`, `K3`, `W`, `I`, `T` for a light to carry (a torch), `L3` for a locked door - an unlocked one has no tag -, `D` for a dialog, `B` for a boss, a spawner's number of monster types, and a `Q` after a pickup's or boss's that counts for a quest; only characters the bitmap font has), `DescribePickup(pickup)`, `DescribeBoss(boss)`, `DescribeDialog(script)` (its first line, not a part's name, how many lines, and `shouts` when it has a shout part), `DescribeLock(lock)` (pure) |
| `views/PaletteCategories` | `type TileSet = { id: AssetCategory; name; brushes: string[] }`; `GroupByCategory(names, categoryOf): TileSet[]` (one set per category, in `AssetCategories` order, empty ones included, each sorted by name); `EmptyTabHint(id, canCreate?): string` (pure); `ShowsCategory(kind, category)` (a floor/walls layer shows only its own tab, any other tile layer all but those two); `TakesCategory(kind, category)` (a floor/walls layer paints only its own category, a generic one anything); `EmptyTabHint(id, canCreate?)` mentions the tab's + when the sprite editor is available |
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
| `SpriteNames` | The naming rules, matching `ids.js`: `ValidateSpriteName`, `SuggestSpriteName`, `SuggestCopyName` (`name_copy`, `name_copy2`... unique in a bundle), `NormalizeSpriteName`, `FrameFileNames`, `ParseFrameFile`. |
| `SpriteApi` | The client of the [sprite API](#sprite-api): `new SpriteApi(fetch?)` with `Available()`, `List()`, `Describe`, `ReadSprite`, `Save`; `SharedSpriteApi`; `SpriteApiError`; `ToBase64`. |
| `SpriteStore` | Where the editor gets sprites and puts them, behind one interface (`Kind`, `List`, `Read`, `Save`): `DiskStore` (the sprite API - on localhost under `npm start`) and `DownloadStore` (anywhere else: reads the page's loaded art, and a save hands the browser a `Download`); `ChooseStore(api, hosted, deliver)` asks the service once. Download helpers: `PackDownload(bundle, name, sheet, pngs)` (a PNG for one frame, a zip for several), `ObsoleteFiles`, `MetaSnippet`, `DescribeDownload` (the status line and the steps left to do by hand), `PngSize`. |
| `HostedSprites` | `CreateHostedSprites(deps)` - download mode's reader: bundles, sheets and names from `Assets.Catalogue()`, and a sprite's frames from the atlas its textures were loaded from (fetched, decoded, cut out). |
| `AtlasFrames` | `ComposeAtlasFrame(atlas, texture)` - one frame at its full size, trim put back, from the decoded atlas; `AtlasUrl`, `SheetOfAtlasUrl`; `AtlasTextureLike` (the few `Texture` fields it uses). |
| `Zip` | `CreateZip(entries, now?)` - a zip of `{ name, data }` files, stored (PNGs are compressed already), UTF-8 names, checked against real unzippers; `ZipNameProblem`. |
| `ManifestWatch` | `ReadBundleHash(manifestUrl, bundle)` and `WaitForBundleChange(...)` - how the editor knows a save's rebuild has landed. |
| `Resume` | The note left in session storage when the window closes after a save: `WriteResumeNote`, `TakeResumeNote`, `PeekResumeNote`. |
| `Recovery` | The snapshot taken as the page unloads under an open window, so a reload doesn't lose the sprite: `SpriteOrigin`, `Recovery`, `WriteRecovery`, `TakeRecovery`, `PeekRecovery`, `ClearRecovery`, `SerializeRecovery` / `ParseRecovery` (validates everything; stale ones, older than ten minutes, are ignored). |
| `Viewport` | Zoom and pan maths: `ScreenToImage`, `ImageCell`, `ZoomAt`, `StepZoom`, `FitView`, `PanBy`. |
| `OpenSpriteEditor` | `OpenSpriteEditor(context, request, defaults): Promise<boolean>` - `request` is `{ kind: "edit", bundle, name, category? }`, `{ kind: "clone", bundle, name, category? }` (asks where the copy goes, saves it, opens it) or `{ kind: "new", category }`; resolves when the window closes. `host` is a `SpriteEditorHost`: the context's fields plus the dev server's `api` and the page's `hosted` reader - it picks the store. `RecoverSpriteEditor(host, recovery)` puts the window back after a reload. |
| `SpriteEditor` | `default class SpriteEditor` - the window itself (`SpriteEditor.Active`); `SpriteEditorContext` is what it needs of the page (`store`, `deliver(download)`, `metaOf(name)`, `manifestUrl`, `categories`, `persistLevel()`, `reload()`, storages). |
| `ui/*` | The window's parts: `CanvasView`, `Toolbox`, `PalettePanel`, `MixerPanel`, `Timeline`, `Menu`, `Dialogs` (the `FormDialog` descriptions and their checks), `FileIo`, `Icons`, `Styles`. |

Views open it with `EditorComponent`'s protected `OpenSpriteEditor(request)`, which builds the context from the editor's stores. `DungeonEditor` exports
`ResumeEditorScene(): string | undefined` - the editor scene's name on the load right after the sprite editor reloaded the page (or the page reloaded under an open
window), otherwise `undefined` - for a game's `GameEditor.startScene`. `SavedLevel` exports `MakeEditorSave(editorData, levelData)`.
