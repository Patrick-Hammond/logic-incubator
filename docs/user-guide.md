# logic-incubator user guide

How to build a game on logic-incubator: the project layout, the game and scene model, the asset system,
input, tweening, the dungeon engine and the level editor, with worked examples. For exact signatures see the
[API reference](api-reference.md).

## Contents

1. [What logic-incubator is](#1-what-logic-incubator-is)
2. [Setting up](#2-setting-up)
3. [Your first game](#3-your-first-game)
4. [Games, scenes and components](#4-games-scenes-and-components)
5. [Assets](#5-assets)
6. [Input](#6-input)
7. [Animation and timing](#7-animation-and-timing)
8. [Utilities](#8-utilities)
9. [The dungeon engine](#9-the-dungeon-engine)
10. [The level editor](#10-the-level-editor)
11. [Testing](#11-testing)
12. [Conventions and working on the workspace](#12-conventions-and-working-on-the-workspace)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. What logic-incubator is

logic-incubator is the shared code that small browser games are built on. It is **not an application**: there is
nothing to run in this repository. It is an npm workspace of three packages whose dependencies only point down:

```
editor  ->  engine  ->  lib
```

| Package | Import prefix | What it is |
| --- | --- | --- |
| `packages/lib` | `@logic-incubator/lib/...` | The game framework: `Game`, scenes and components, the asset bundle system and its build, input, tweening, a tilemap renderer, small utilities. Knows nothing about any particular game. |
| `packages/engine` | `@logic-incubator/engine/...` | A top-down tile dungeon engine: the level format, level loading, lighting, doors, regions, the player, monsters and combat, the HUD. |
| `packages/editor` | `@logic-incubator/editor/...` | A browser level editor for the engine's level format, with its own icons and font. |

A game that only needs the framework (a puzzle game, say) uses `lib`. A dungeon crawler uses all three.

### How games consume it

Games **check this repository out beside their own** and compile it from source: there is no published package and
no build step here. A game's `tsconfig.json` maps `@logic-incubator/*` to the source folders, and its webpack
config compiles them with the game. The layout on disk is:

```
projects/
  logic-incubator/      <- this repo (npm install done)
  my-game/              <- your game (npm install done)
  in-dungeons-we-dwell/ <- an example: uses lib + engine + editor
  cat-grab/             <- an example: uses lib only
```

Two example games show every pattern in this guide in working form:

- **cat-grab** - lib only: a scene-based game with one asset bundle and a pre-packed sprite sheet.
- **in-dungeons-we-dwell** - the dungeon engine and editor: bundles per level, sound, a typed data file, a
  front-end of title/character-select scenes, and the editor wired in for development builds.

### Technology

- **pixi.js 5.2.1**, pinned. Everything in the workspace is written against that version (`Loader`, not the later
  `Assets` API). Two copies of pixi in one bundle break the renderer, so games pin the whole `@pixi/*` tree.
- **TypeScript 5.9**, target ES5 (`Map` and `Set` are used; `for..of` over them is not).
- **Node 20.9+** for the build tooling.
- **vitest** for tests, **eslint** (flat config) for lint.

---

## 2. Setting up

```bash
# in logic-incubator
npm install
npm test            # 570+ tests; node environment, no browser
npm run lint        # eslint; also enforces the import direction (editor -> engine -> lib)
npx tsc -p . --noEmit
```

The same three commands exist in each game. Because the games compile logic-incubator from source, run
`npm install` in **both** repositories: the asset build tool (`pngjs`, `maxrects-packer`) is resolved from
logic-incubator's `node_modules`, and the game bundle's runtime dependencies from the game's.

### Where things live

```
logic-incubator/
  docs/                      this documentation
  packages/
    lib/
      src/
        game/                Game, GameComponent, SceneManager, Timing, display helpers
        assets/              Assets (bundle loader), typed ids, loading screen, pixi adapters
        loading/             AssetFactory: sprites and animations by name
        io/                  Keyboard, GamePad, VirtualJoystick, Storage, Url
        tween/               Tween, Easing
        tilemap/             vendored @pixi/tilemap with per-tile tint and flicker
        math/ patterns/ algorithms/ datastructures/ utils/ filters/
      scripts/               build-assets.js and its modules: the asset build (plain Node)
      html/                  index.template + index.styles.css the games are served in
    engine/
      src/                   DungeonMain, level/, view/, input/, Events, Constants
      scripts/               asset-meta-plugin.js (a build plugin)
    editor/
      src/                   DungeonEditor, stores, views, map generators
      assets/editor/         the editor's icons and bitmap font, as an asset bundle
```

---

## 3. Your first game

This walks through a minimal lib-only game: a loading screen, a menu scene that plays a sound and a game scene.
Everything is a small variation of what cat-grab does.

### 3.1 Layout

```
my-game/
  package.json
  tsconfig.json
  webpack.config.js
  assets.config.json
  assets/
    global/
      sprites/ui/button_up.png  button_down.png  logo.png     one atlas, named "ui"
      sounds/click.ogg
      fonts/score.fnt  score.png
  src/
    main.ts
    Game.ts
    scenes/MenuScene.ts
    generated/assets.d.ts                       written by the asset build; commit it
```

### 3.2 package.json

```jsonc
{
  "name": "my-game",
  "private": true,
  "type": "commonjs",
  "engines": { "node": ">=20.9" },
  "scripts": {
    "start": "webpack serve --mode development",
    "build": "webpack --mode development",
    "deploy": "webpack --mode production",
    "assets": "node ../logic-incubator/packages/lib/scripts/build-assets.js --report",
    "assets:check": "node ../logic-incubator/packages/lib/scripts/build-assets.js --check",
    "test": "vitest run",
    "lint": "eslint ."
  },
  "dependencies": {
    "eventemitter3": "^4.0.0",
    "nipplejs": "^0.8.5",
    "pixi.js": "5.2.1",
    "pixi-sound": "^3.0.4",
    "screenfull": "^5.2.0",
    "stats.js": "^0.17.0"
  },
  "devDependencies": {
    "copy-webpack-plugin": "^14.0.0",
    "html-webpack-plugin": "^5.6.8",
    "ts-loader": "^9.6.2",
    "tsconfig-paths-webpack-plugin": "^4.2.0",
    "typescript": "~5.9.3",
    "vitest": "^5.0.0",
    "webpack": "^5.110.3",
    "webpack-cli": "^7.2.3",
    "webpack-dev-server": "^6.0.0"
  }
  // Also copy the "overrides" block from cat-grab's package.json: it pins every @pixi/* package to 5.2.1.
}
```

The game lists lib's runtime dependencies (`eventemitter3`, `nipplejs`, `screenfull`, `stats.js`) itself because
lib's source is compiled *into the game's bundle* and resolves its imports from the game's `node_modules`.
`pixi-sound` is only needed if the game plays sound (see [5.9](#59-sound)). A dungeon game additionally needs
`@pixi/math`, `rot-js` and the versions listed in in-dungeons-we-dwell's `package.json`.

### 3.3 tsconfig.json

```jsonc
{
  "compilerOptions": {
    "moduleResolution": "node",
    "skipLibCheck": true,
    "target": "es5",
    "lib": ["es2017", "dom"],
    "noUnusedLocals": true,
    "baseUrl": ".",
    "paths": {
      "@logic-incubator/lib/*": ["../logic-incubator/packages/lib/src/*"]
      // a dungeon game also maps engine/* and editor/* the same way
    }
  },
  "include": [
    "src",
    // lib's ambient declarations (shader imports) - its .ts files come in through imports
    "../logic-incubator/packages/lib/src/**/*.d.ts"
  ]
}
```

`src/generated/assets.d.ts` is inside `src`, so it is picked up automatically.

### 3.4 webpack.config.js

```js
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');
const AssetsWebpackPlugin = require('../logic-incubator/packages/lib/scripts/assets/webpack-plugin');

const LOGIC_INCUBATOR = path.resolve(__dirname, '../logic-incubator/packages');
const NODE_MODULES = path.resolve(__dirname, 'node_modules');

module.exports = (env, argv) => ({
  context: __dirname,
  entry: './src/main.ts',
  mode: argv.mode === 'production' ? 'production' : 'development',
  target: ['web', 'es5'],
  devServer: { static: false, hot: true, port: 4200, open: true },
  plugins: [
    new HtmlWebpackPlugin({ title: 'My Game', template: path.join(LOGIC_INCUBATOR, 'lib/html/index.template') }),
    // Builds the asset bundles before each compile - and again when art changes under the dev server.
    new AssetsWebpackPlugin({ configPath: path.resolve(__dirname, 'assets.config.json') }),
    new CopyWebpackPlugin({
      patterns: [
        { from: path.resolve(__dirname, '.assets/public'), to: 'assets' },
        { from: path.join(LOGIC_INCUBATOR, 'lib/html/index.styles.css'), to: 'index.styles.css' }
      ]
    })
  ],
  module: {
    rules: [
      { test: /\.tsx?$/, use: 'ts-loader', exclude: /node_modules/ },
      // logic-incubator's source must resolve its packages from THIS project's node_modules:
      // a second copy of pixi.js in the bundle breaks the renderer.
      { include: LOGIC_INCUBATOR, resolve: { modules: [NODE_MODULES] } },
      { test: /\.(vert|frag)$/, type: 'asset/source' }
    ]
  },
  resolve: {
    plugins: [new TsconfigPathsPlugin({ configFile: path.resolve(__dirname, 'tsconfig.json') })],
    extensions: ['.tsx', '.ts', '.js']
  },
  output: { filename: '[name].bundle.js', path: path.resolve(__dirname, 'dist'), publicPath: 'auto', clean: true },
  performance: { hints: false }
});
```

### 3.5 Assets

`assets.config.json` says where the bundles are and where to write the output:

```json
{
  "roots": [{ "dir": "assets" }],
  "out": ".assets",
  "dts": "src/generated/assets.d.ts"
}
```

Add `.assets` to `.gitignore` (it is build output) and a `.gitattributes` line
`src/generated/*.d.ts text eol=lf` so the committed declarations keep their line endings on Windows.

Put some art, a sound and a font under `assets/global/` as in the layout above, then:

```bash
npm run assets
```

```
global (boot, 0.31 MB) 1 font, 1 sound, 3 sprite
    global.click    0.02 MB  boot
    ...
assets: 9 file(s) written, 0 removed.
```

This packed `sprites/ui/*.png` into one atlas, copied the sound and font, wrote `.assets/public/manifest.json`
and wrote **`src/generated/assets.d.ts`**: the typed id list (`"global.logo": "sprite"`, `"global.click": "sound"`, ...).
Webpack runs the same build for you on every compile, so you rarely run it by hand.

### 3.6 Code

`src/main.ts`:

```ts
import { StartGame } from "./Game";

StartGame();
```

`src/Game.ts`:

```ts
import Game from "@logic-incubator/lib/game/Game";
import { AssetLoadError, AssetsDestroyedError } from "@logic-incubator/lib/assets/AssetErrors";
import LoadingScreen from "@logic-incubator/lib/assets/LoadingScreen";
import PixiSoundAdapter from "@logic-incubator/lib/assets/PixiSoundAdapter";
import { MenuScene } from "./scenes/MenuScene";

export const enum Scenes { LOADING = "loading", MENU = "menu" }

const Width = 960;
const Height = 540;

/** Starts the game; returns what takes it down again (handy for tests and hot restarts). */
export function StartGame(): () => void {
    const game = new Game({ width: Width, height: Height, backgroundColor: 0x101820, fullscreen: true });

    Boot(game).catch(error => {
        // Taking the game down mid-load is not a failure.
        if (!(error instanceof AssetsDestroyedError)) {
            console.error(error);
        }
    });

    return () => game.destroy();
}

async function Boot(game: Game): Promise<void> {
    // Show progress while the global bundle loads. A failed load waits on the screen's Retry.
    let retry: (() => void) | undefined;
    game.sceneManager.AddScene(Scenes.LOADING, new LoadingScreen({ width: Width, height: Height, onRetry: () => retry && retry() }));
    game.sceneManager.ShowScene(Scenes.LOADING);

    await game.assets.Init("assets/manifest.json", { sound: new PixiSoundAdapter() });
    for (;;) {
        try {
            await game.assets.LoadBundle("global");
            break;
        } catch (error) {
            if (!(error instanceof AssetLoadError) || game.Destroyed) {
                throw error;
            }
            await new Promise<void>(resolve => (retry = resolve));
        }
    }
    if (game.Destroyed) {
        return; // torn down while loading: add nothing to a game that's gone
    }

    // Scenes build their display in OnInitialise, which runs when they are added - the assets they use must be loaded first.
    game.sceneManager.AddScene(Scenes.MENU, new MenuScene());
    game.sceneManager.ShowScene(Scenes.MENU);
    game.sceneManager.RemoveScene(Scenes.LOADING);
}
```

`src/scenes/MenuScene.ts`:

```ts
import { Sprite } from "pixi.js";
import GameComponent from "@logic-incubator/lib/game/GameComponent";
import { Tween } from "@logic-incubator/lib/tween/Tweener";
import { Easing } from "@logic-incubator/lib/tween/Easing";

export class MenuScene extends GameComponent {
    private logo: Sprite;

    protected OnInitialise(): void {
        // Typed ids: a typo here is a compile error. "global.logo" is a sprite from sprites/ui/logo.png.
        this.logo = this.game.assets.Sprite("global.logo");
        this.logo.anchor.set(0.5);
        this.logo.position.set(this.game.screen.width / 2, 200);
        this.logo.interactive = true;
        this.logo.buttonMode = true;
        this.root.addChild(this.logo);
        this.Tick(this.OnUpdate);
    }

    protected OnShow(): void {
        // Every visit starts from the same state: OnShow resets, OnHide stops.
        this.logo.alpha = 0;
        Tween(this.logo, { alpha: 1 }, 800, Easing.Sine.Out);
        this.logo.once("pointerdown", this.OnClicked, this);
    }

    protected OnHide(): void {
        this.logo.off("pointerdown", this.OnClicked, this);
    }

    private OnClicked(): void {
        this.game.assets.PlaySound("global.click");
    }

    private OnUpdate(dt: number): void {
        this.logo.rotation = Math.sin(this.game.ticker.lastTime / 600) * 0.05;
    }
}
```

### 3.7 Run

```bash
npm start       # dev server on :4200; edit art under assets/ and the manifest and d.ts regenerate
npm run deploy  # production build to dist/
```

---

## 4. Games, scenes and components

### 4.1 `Game`

`Game` extends pixi's `Application` and owns everything a game needs, **one of each per game**:

| Member | What it is |
| --- | --- |
| `game.stage`, `game.ticker`, `game.renderer`, `game.screen`, `game.view` | From pixi's `Application`. |
| `game.sceneManager` | The scenes; one is on the stage at a time. |
| `game.assets` | This game's asset bundles ([chapter 5](#5-assets)). |
| `game.keyboard`, `game.gamePad` | Input ([chapter 6](#6-input)). |
| `game.dispatcher` | An `eventemitter3` for the game's own events. |
| `game.resizeStrategy` | How the canvas fits the window. |
| `Game.inst` | The current game (set by the constructor, cleared by `destroy`). |

```ts
const game = new Game(
    {
        width: 1280, height: 720,
        backgroundColor: 0x000000,
        fit: "border",       // "border" (default: scale to fit, letterbox) | "centered" | "none"
        fullscreen: true,    // request fullscreen (the whole page, so DOM overlays stay visible) on the first pointer click
        pixelArt: true,      // NEAREST scaling for textures
    },
    true                      // second argument: show the stats.js panel
);
```

All other `IGameOptions` fields are passed to pixi's `Application` (`resolution`, `antialias`, `transparent`, ...).

**Destroying a game.** `game.destroy()` takes everything down in dependency order: scenes first (they release
what they hold on the stage, ticker and input), then input, the asset bundles (loads in flight are abandoned, sounds
and bitmap fonts - which live in process-wide tables - are removed), the sprite registry, pixi's texture cache, and
finally pixi's own application. `Game.inst` is cleared so a new `Game` can be created in the same page. It is safe
to call twice, and `game.Destroyed` tells asynchronous code (a boot that is still loading) that the game went away.

### 4.2 `GameComponent`: the lifecycle

A scene - and any piece of a scene - is a `GameComponent`. Its life is driven **explicitly** by its owner
(`SceneManager` for a scene, the component that `Attach`ed it for a child), never by pixi's `added`/`removed`
events.

| Phase | Hook | When | Do here |
| --- | --- | --- | --- |
| construct | `constructor` | `new` | Initialise fields only: no display objects, no subscriptions. |
| initialise | `OnInitialise()` | Once: when the scene is added to the `SceneManager` (a child: when attached to an initialised owner). | Build the display, `Attach` children, register subscriptions. |
| show | `OnShow()` | Each time it goes on the stage. | Reset what a visit changed; start things. |
| hide | `OnHide()` | Each time it leaves the stage. | Stop things. |
| destroy | `OnDestroy()` | Once: when the scene is removed. | Release what isn't covered below. |

Initialise and Show run **owner first**, then children in attach order. Hide and Destroy run children first, in
reverse, then the owner. After `OnDestroy`, everything registered through `Own`, `Listen` and `Attach` is released and
`root` is destroyed.

Helpers (all `protected`):

| Helper | Does |
| --- | --- |
| `this.Attach(child, into = this.root)` | Makes `child` part of this component: its root goes in `into`, and it is initialised/shown/hidden/destroyed with this one. Returns the child. |
| `this.Own(dispose)` | Runs `dispose` when this component is destroyed (last registered first). |
| `this.Listen(emitter, event, fn)` | Subscribes `fn` (called with `this` bound) until destroyed. Works with `game.dispatcher`, `game.keyboard`, `game.assets`, a pixi display object. |
| `this.ListenWhileShown(emitter, event, fn)` | Subscribes only while shown - no "am I visible" guard needed. |
| `this.Tick(fn)` | Calls `fn(dt)` every frame, only while shown. |
| `this.WhileShown(on, off)` | `on()` now if shown and on every Show; `off()` on every Hide. |

```ts
export class GameScene extends GameComponent {
    private player: Player;

    protected OnInitialise(): void {
        // Children draw in attach order: the world first, then the HUD over it.
        const world = this.Attach(new World());
        this.player = this.Attach(new Player(world));
        this.Attach(new Hud());

        this.Listen(this.game.dispatcher, "enemyKilled", this.OnEnemyKilled);   // until destroyed
        this.ListenWhileShown(this.game.keyboard, "keydown", this.OnKey);       // only while visible
        this.Tick(this.Update);                                                 // only while visible
        this.Own(() => Analytics.Flush());                                      // custom cleanup
    }

    protected OnShow(): void {
        this.player.Reset();   // a visit starts from the same state
    }

    private Update(dt: number): void { /* ... */ }
    private OnKey(e: KeyboardEvent): void { /* ... */ }
    private OnEnemyKilled(type: string): void { /* ... */ }
}
```

Components get `this.game` (the `Game`) and `this.assetFactory` for free.

### 4.3 `SceneManager`

```ts
const scenes = game.sceneManager;

scenes.AddScene("menu", new MenuScene());   // registers it under an id and initialises it (OnInitialise runs now)
scenes.ShowScene("menu");                   // puts it on the stage; hides the previous one
scenes.ShowScene("menu");                   // showing the scene that is already showing does nothing
scenes.HasScene("menu");                    // true
scenes.CurrentScene;                        // "menu"
scenes.GetScene("menu");                    // the GameComponent (throws if there isn't one)
scenes.RemoveScene("menu");                 // hides it if showing, destroys it, forgets it
```

Because `AddScene` initialises immediately, **load the assets a scene uses before adding it**. A scene built
while a bundle is still loading would find its sprites missing (see [5.6](#56-loading-in-code)).

A typical flow is: a loading scene (added first) -> load -> add the real scenes -> show the first -> remove the
loading scene. Moving between scenes is just `ShowScene`, called from a click handler or a tween's completion:

```ts
Tween(this.title, { alpha: 0 }, 3000, Easing.Linear, () => this.game.sceneManager.ShowScene(Scenes.CHARACTER_SELECT));
```

### 4.4 Events

`game.dispatcher` is a plain `eventemitter3`. Use string constants (the engine's are in
`@logic-incubator/engine/Events`):

```ts
export const SCORE_CHANGED = "scoreChanged";

this.game.dispatcher.emit(SCORE_CHANGED, 120);              // anywhere
this.Listen(this.game.dispatcher, SCORE_CHANGED, this.OnScore);   // in a component
```

`game.destroy()` removes every listener on the dispatcher.

### 4.5 Re-starting a game in the same page

Because every part of a game is released by `destroy()`, a second `Game` works in the same page - which is what
makes hot restarts and integration tests possible. Return a teardown from your start function (as `Dungoen()` and
`CatGrab()` do) and guard each `await` in boot code with `game.Destroyed`.

---

## 5. Assets

The asset system has three parts:

1. **Source folders** called *bundles* (`assets/global/`, `assets/level1/`): your art, sound and data, organised by you.
2. A **build** (`build-assets.js`) that validates them, packs sprite frames into atlases, and writes a `manifest.json`
   plus a typed list of ids (`assets.d.ts`).
3. A **runtime** (`game.assets`) that loads bundles from the manifest, counts who holds them, and unloads them again.

### 5.1 Concepts

- A **bundle** is a folder under an assets root. Its name is the *namespace* of everything in it. `global` loads at
  boot and stays; a level's bundle (`level1`) loads when the level starts and is released when the next replaces it.
- An **asset** is one thing you ask for by id: a sprite, an animation, an image, a sound, a data file (JSON), a binary
  (a GIF, say) or a bitmap font.
- An **id** is `<bundle>.<name>`: `global.title`, `level1.hit_sound`. Two bundles can each have a `hit_sound`
  because the ids differ.
- A **tier** says *when* an asset loads: `boot` (with its bundle; what `Acquire` waits for), `background` (right after,
  without making anyone wait) or `lazy` (only when asked for or played).

### 5.2 Source layout and how files are classified

```
assets/
  global/                          one folder per bundle
    bundle.json                    optional settings
    sprites/
      dungeon/                     each sprites/<sheet>/ folder is ONE atlas
        wall_mid.png
        torch_f0.png torch_f1.png  frames "name_f<N>" form an animation called "torch"
      packed.json + packed.png     OR an already-packed sheet (pixi/TexturePacker hash JSON + image)
    images/title.png
    sounds/theme.ogg theme.m4a     encodings of one sound fold into one id
    data/level.json
    binary/fire.gif
    fonts/score.fnt score.png
```

Sub-folders inside a bundle are for **your tidiness**: they do not change an id. The kind of a file comes from its
extension, except under `sprites/`:

| Where / extension | Kind | Notes |
| --- | --- | --- |
| `sprites/<sheet>/**.png` | frames of an atlas | Frame name = file name; frames named `<name>_f<N>` form the animation `<name>` (N = 0, 1, 2 ... without gaps). Other frames are sprites. A lone `foo_f0` is a one-frame sprite named `foo`. |
| `sprites/<sheet>.json` + `.png` | pre-packed atlas | Frames are re-keyed into the bundle's namespace; any extension on a frame name is dropped. |
| `.png` `.jpg` `.jpeg` `.webp` (elsewhere) | image | Loaded as one texture. |
| `.ogg` `.m4a` `.mp3` `.wav` | sound | Same base name, different extension = one sound, in preference order `soundFormats`. |
| `.json` | data | Parsed JSON. Must be valid. |
| `.gif` `.bin` | binary | Raw `ArrayBuffer` (for example `AnimatedGIF.fromBuffer`). |
| `.fnt` | bitmap font | The XML format; its page image(s) belong to the font. |
| `.sbx .psd .ase .aseprite .kra .xcf .md .txt`, `Thumbs.db`, `.DS_Store`, `.gitkeep` | ignored silently | Source files and tool droppings. |
| anything else | not copied, **warning** | The build tells you which file it didn't know. |

**Id rules.** A name is the file name without its extension, lowercased, with `-` and spaces turned into `_`.
Only `a-z 0-9 _` may remain. Bundle names are `^[a-z][a-z0-9_]*$`. So `Small-Font.fnt` is `editor.small_font`, and
`sprites/dungeon/Wall Mid.png` is the frame `wall_mid`.

**Clashes are errors, not overwrites.** Within a bundle, the same id from two kinds (an image `enter.png` and a sound
`enter.ogg`), the same base name in two folders, or the same frame in two sheets stops the build and names both files.

### 5.3 Typed ids

The build writes `src/generated/assets.d.ts`. Commit it: its diff in a pull request is exactly "these ids were
added/removed", and a fresh clone type-checks before any build has run.

```ts
// <auto-generated> ... Do not edit.
export {};
declare module "@logic-incubator/lib/assets/AssetIds" {
    interface BundleRegistry { "editor": true; "global": true; "level1": true; }
    interface AssetRegistry {
        "global.angel_idle_anim": "animation";
        "global.blocky": "sound";
        "global.title": "image";
        "level1.level": "data";
        // ...
    }
}
```

lib's own accessors are typed from these registries (`SpriteId`, `SoundId`, `DataId`, ...):

```ts
game.assets.PlaySound("global.blocky");     // ok
game.assets.PlaySound("global.blockyy");    // compile error: not a SoundId
game.assets.PlaySound("global.title");      // compile error: that's an image
game.assets.Sprite("level1.dwell");         // compile error: that's a sound
```

Until a game generates its declarations, every id type is plain `string`, so lib code works untyped.

**Typing data files.** `Data(id)` returns `unknown` unless you declare its shape, by hand, in a `.d.ts` of your own:

```ts
// src/assetData.d.ts
import type { LevelFile } from "@logic-incubator/engine/level/LevelFormat";

declare module "@logic-incubator/lib/assets/AssetIds" {
    interface DataTypeRegistry {
        "level1.level": LevelFile;
    }
}
```

The `import` at the top is what makes the file a module so it *augments* lib's registry instead of replacing it.
(The same applies to the generated file's `export {}`.)

**A guard against silent failure.** `skipLibCheck` is usually on, which would hide a declaration file that quietly
did nothing - every id would silently become `string`. Add a file that fails the build if that happens:

```ts
// src/assetTypes.check.ts
import type { AssetId } from "@logic-incubator/lib/assets/AssetIds";
export const AssetIdsAreTyped: string extends AssetId ? never : true = true;
```

Useful helper types: `SpriteId`, `AnimationId`, `ImageId`, `SoundId`, `DataId`, `BinaryId`, `FontId`, `DrawableId`
(sprite or animation), `AssetId`, `BundleId`, `BundleOf<"level1.hit">` (= `"level1"`) and `DataOf<id>`.

### 5.4 `bundle.json`

Optional, in the bundle's root. Every key is optional; unknown keys are an error with a "did you mean".

```jsonc
{
  "dependsOn": ["global"],            // bundles this one loads with (and holds while it's loaded)
  "ignore": ["**/zombie_anim_f*", "source/**"],   // gitignore-style globs; no "/" = match the file name at any depth
  "overrides": ["torch"],             // sprite names that intentionally shadow one in a bundle this depends on
  "animPattern": "^(.+)_f(\\d+)$",    // how frames group into animations: a regex with TWO groups (name, index)
  "atlas": {
    "maxSize": 4096,                  // largest atlas page; more frames than fit => several pages
    "padding": 0,                     // gap between frames
    "extrude": 1,                     // replicate each frame's edge pixels outward (stops seams when filtered)
    "trim": true,                     // crop transparent borders (pixi restores the offset from trim data)
    "alphaThreshold": 0,              // alpha above this counts as opaque when trimming
    "pot": false,                     // round page sizes up to a power of two
    "scaleMode": "nearest",           // "nearest" | "linear": the atlas texture's filtering
    "sheets": { "ui": { "extrude": 0 } }   // per-sheet overrides of any of the above
  },
  "assets": {
    "blocky": { "tier": "background" },   // by local name (no bundle prefix): boot (default) | background | lazy
    "dwell":  { "tier": "lazy" }
  }
}
```

Notes:

- **Tiers apply to images, sounds, data, binaries and fonts.** Sprites and animations load with their bundle (they live
  in its atlases) and have no tier.
- `preload` ("boot" | "manual") is accepted and written into the manifest as information for tooling; the runtime does not
  act on it - your boot code decides what to `LoadBundle`.
- **`ignore` is how you drop a broken asset explicitly.** The old behaviour of silently skipping an incomplete
  animation (say `zombie_f1..f3` with no `f0`) is now a build error; list the strays under `ignore` if you really mean
  to leave them out.
- **`overrides`** silences the build's "shadows" warning (see [5.8](#58-sprites-by-bare-name-scope-and-assetfactory)).

### 5.5 `assets.config.json` and running the build

```jsonc
{
  "roots": [
    { "dir": "assets" },                                                        // paths are relative to this file
    { "dir": "../logic-incubator/packages/editor/assets", "devOnly": true }     // left out of production builds
  ],
  "out": ".assets",                              // build output; public/ is what gets served, .cache/ is private
  "dts": "src/generated/assets.d.ts",            // omit to skip the declarations
  "dtsModule": "@logic-incubator/lib/assets/AssetIds",   // the module the declarations augment (default shown)
  "plugins": ["../logic-incubator/packages/engine/scripts/asset-meta-plugin.js"],
  "limits": { "imageBytes": 1500000, "soundBytes": 2000000, "dataBytes": 1000000, "bundleBytes": 25000000 },
  "soundFormats": ["ogg", "m4a", "mp3", "wav"]   // accepted sound extensions, most preferred first
}
```

Every immediate sub-folder of a root is a bundle. Two roots defining the same bundle name is an error.

**Commands** (run from the game, via the scripts in your `package.json`):

```bash
node ../logic-incubator/packages/lib/scripts/build-assets.js [options]

  --config <file>   the config (default ./assets.config.json)
  --production      leave devOnly roots out of the output and manifest
  --check           write nothing; fail if the committed declarations (or a plugin's synced file) are out of date
  --clean           delete the output folder first
  --report          print a size table per bundle
```

The exit code is 0 on success and 1 if there were errors. Warnings (an unknown file, an oversized asset, a shadowed
sprite) are printed but do not fail the build.

**What it writes** to `<out>/public/`:

```
manifest.json                          every bundle: its assets, tiers, urls, sizes and content hash
global/atlases/dungeon_0.json + .png   one JSON + PNG per atlas page (qualified frame keys: "global.torch_f0")
global/images/title.png                files copied under <bundle>/<kind>/<id>.<ext>
global/sounds/theme.ogg  theme.m4a
global/fonts/score.fnt  score_0.png    the font's page images are renamed and the .fnt rewritten to match
```

and, if `dts` is set, the declarations file. Every write is "if changed": a second build touches nothing, so a file
watcher is not re-triggered by the build's own output, and files it no longer produces are deleted.

**Determinism.** Frames are sorted by code unit (never locale), packed in a fixed order, and JSON is written with
sorted keys, so the same input gives the same atlas on any machine. The cache key for an atlas is the hash of its
*inputs*, not of the encoded PNG (zlib output differs between Node builds).

**Inside webpack.** `AssetsWebpackPlugin({ configPath })` calls the same build before each compile and when a source
file changes under `webpack serve`, registers each root as a watched context, and fails the compile on errors. It
builds in production mode when webpack's mode is `production`. Run **only one** build against an output folder at a
time: a dev server and a production build running concurrently will race on `.assets/`.

**In CI**, add `npm run assets:check` so a pull request that changes art without regenerating `assets.d.ts` fails.

**Programmatic use** (tests, custom tools):

```js
const { BuildAssets } = require("../logic-incubator/packages/lib/scripts/assets/build");
const result = BuildAssets({ configPath: "assets.config.json", production: false, check: false });
// result.ok, result.diagnostics, result.manifest, result.dts, result.written, result.removed, result.bundles
```

### 5.6 Loading in code

Three calls cover nearly everything.

```ts
await game.assets.Init("assets/manifest.json", { sound: new PixiSoundAdapter() });  // read the manifest

await game.assets.LoadBundle("global", progress => { /* { bundle, loaded, total } bytes */ });   // keep forever

const handle = await game.assets.Acquire("level1");   // hold it; unload when released
handle.Release();                                     // idempotent
```

- **`Init(manifestUrl, options)`** fetches the manifest (never from cache) and validates it. Asset urls are relative to
  the manifest's folder. Options: `sound` (an `ISoundAdapter`, only needed if the game has sounds) and `retries`
  (how many times a failed file is tried again; default 2).
- **`LoadBundle(name, onProgress?)`** = `Acquire` + pin: the bundle stays for the life of the game. Use it for `global`.
- **`Acquire(name, onProgress?)`** loads the bundle *and the bundles it `dependsOn`* if they are not already, and returns a
  `BundleHandle`. Each bundle is **ref-counted**: it unloads when every handle on it - and every bundle depending on it -
  has been released. Two simultaneous `Acquire`s of one bundle share one load.
- **`UseLevelBundle(...names)`** is `Acquire` for "the bundle(s) the current level plays in". It loads the new ones,
  switches the [scope](#58-sprites-by-bare-name-scope-and-assetfactory), and *then* releases the previous level's - in
  that order, so assets two levels share never unload, and restarting the same level costs nothing. With no arguments it
  just lets go of the current level's bundles.

`onProgress` and the `bundle:progress` event report **bytes** loaded and total for that bundle's boot-tier load. A
loading screen that adds up `loaded` and `total` across bundles gets a smooth bar; `LoadingScreen` does exactly that.

#### Loading screen

```ts
game.sceneManager.AddScene("loading", new LoadingScreen({ width: 1280, height: 720, onRetry: () => retry() }));
game.sceneManager.ShowScene("loading");
```

It shows a progress bar, and on a failure the message ("Couldn't load "global" (2 files)") and - if you gave `onRetry` -
a click-to-retry. To make your own, listen to the same events from any component:

```ts
this.Listen(this.game.assets, "bundle:progress", (p: BundleProgress) => this.bar.scale.x = p.loaded / p.total);
this.Listen(this.game.assets, "bundle:error", (name: string, error: Error) => this.ShowError(error.message));
```

#### Tiers

```jsonc
// assets/global/bundle.json
{ "assets": { "theme": { "tier": "background" }, "intro_cutscene": { "tier": "lazy" } } }
```

- `boot` assets are loaded before `Acquire` resolves. Use them for what the first scene needs.
- `background` assets start loading as soon as the boot ones finish; `Acquire` does **not** wait for them. A 8 MB music
  track is a good candidate: the title screen appears at once and the music joins when it is ready.
- `lazy` assets load the first time they are asked for with `Load(id)` or `PlaySound(id)`.

```ts
await game.assets.Load("global.intro_cutscene");   // resolves at once if loaded; shares an in-flight load
game.assets.PlaySound("global.theme", { loop: true });   // loads first if it must, then plays
game.assets.IsLoaded("global.theme");              // false until it has
```

Asking for a not-yet-loaded asset with an accessor (`Data`, `Binary`, `Texture`, ...) throws a message that names the
tier and tells you to `await Load(id)`.

#### Failures

A load that fails (a missing file, a bad decode) is retried, and then rejects with an **`AssetLoadError`** that lists
*every* file that failed, so one bad asset does not hide the others:

```ts
try {
    await game.assets.Acquire("level2");
} catch (error) {
    if (error instanceof AssetLoadError) {
        console.error(error.bundle, error.failures);   // [{ id, url, message }, ...]
    }
}
```

The bundle is forgotten when its load fails, so asking again starts afresh. A `bundle:error` event also fires.

### 5.7 Using assets

```ts
const a = game.assets;

a.Texture("global.title");          // image or sprite -> Texture
a.Sprite("global.title");           // image or sprite -> new Sprite
a.Animation("global.torch");        // animation -> AnimatedSprite
a.Data("level1.level");             // data -> parsed JSON, typed by DataTypeRegistry if you declared it
a.Binary("global.fire");            // binary -> ArrayBuffer
a.FontName("global.score");         // font -> the name BitmapText knows it by (its face, not its id)
a.Url("editor.brush");              // file url with ?v=<hash>, e.g. for an <img src>
a.Has("global.title");              // does the manifest have it (loaded or not)?
a.IsLoaded("global.theme");
a.PlaySound("global.theme", { loop: true, volume: 0.6 });
a.StopSound("global.theme");
```

Examples:

```ts
// A bitmap-font score label.
const label = new BitmapText("0", { font: { name: this.game.assets.FontName("global.score"), size: 32 } });

// A GIF as an animated sprite (with @pixi/gif).
const fire = AnimatedGIF.fromBuffer(this.game.assets.Binary("global.fire"), { autoPlay: true });

// A level, typed as LevelFile because of the DataTypeRegistry declaration above.
const level = this.game.assets.Data("level1.level");

// A DOM image.
img.src = this.game.assets.Url("editor.brush");
```

Asking for an unknown id throws and suggests the nearest real one:

```
Error: No asset "global.titel" - did you mean "global.title"?
```

### 5.8 Sprites by bare name, scope and `AssetFactory`

Existing data - level files, `assets-meta.json`, a monster roster - names sprites **bare** (`wall_top`,
`goblin_idle_anim`), because that is what an artist or level editor sees. `AssetFactory` makes sprites from those
names and resolves them through the loaded bundles:

```ts
const factory = this.assetFactory;      // or AssetFactory.inst

factory.Has("wall_top");                // is it a loaded sprite/animation (in scope)?
factory.Create("wall_top");             // Sprite, or AnimatedSprite for an animation; null if unknown
factory.CreateSprite("wall_top");
factory.CreateAnimatedSprite("torch_anim");
factory.CreateTexture("wall_top");
factory.CreateTextures("torch_anim");   // every frame's texture
factory.CreateFrameTexture("knight_idle_anim_f2");   // one specific frame by its frame key
factory.IsAnimation("torch_anim");
factory.SpriteNames; factory.AnimationNames;         // bare names visible in scope (for palettes)
```

A bare name resolves to **the nearest loaded bundle that has it**: the level's bundle first, then `global`. This is
the *scope*, set by `UseLevelBundle` (or `game.assets.SetScope(["level1"])`, with `global` always last):

```
global  : wall_top, torch_anim, floor_1
level2  : torch_anim, lava          (level2 depends on global)

scope ["level2", "global"]:  "torch_anim" -> level2.torch_anim,  "wall_top" -> global.wall_top,  "lava" -> level2.lava
scope ["global"]          :  "torch_anim" -> global.torch_anim,  "lava" -> not found
```

So a level can restyle a tile without its level data changing. A qualified id (`"level2.lava"`) always means itself.

The build **warns** when a sprite shadows one in a bundle it depends on (or `global`): that is usually an accident.
If the override is intended, list the name under `overrides` in that bundle's `bundle.json`.

Textures you create at run time (the editor's data-brush swatches, say) can be registered with
`AssetFactory.inst.Add(name, [frameKey], [texture])`; they belong to no bundle and are visible whatever the scope.

### 5.9 Sound

Sound is **opt-in**. Importing `pixi-sound` touches `document` and builds an audio context, so only one file in lib
imports it - `PixiSoundAdapter` - and a game with no sound never pays for it:

```ts
import PixiSoundAdapter from "@logic-incubator/lib/assets/PixiSoundAdapter";
await game.assets.Init("assets/manifest.json", { sound: new PixiSoundAdapter() });
```

Sounds are ordinary assets with tiers (`boot`, `background`, `lazy`). Ship two encodings if you need Safari/older
browsers (`theme.ogg` + `theme.m4a`): the runtime picks the first the browser can play.

```ts
game.assets.PlaySound("global.enter");                           // fire and forget
game.assets.PlaySound("global.theme", { loop: true });           // loads first if it's lazy/background and not ready yet
game.assets.StopSound("global.theme");                           // also cancels a play still waiting for the load
```

`StopSound` before a sound has loaded cancels the pending play: a title screen that is hidden before its music arrived
will not start the music behind the next scene.

`pixi-sound` keeps one process-wide library, so aliases outlive a `Game`. The adapter removes the sounds a game
registered when it is destroyed - and, if a sound is still being decoded at that moment, waits for the decode to finish
before destroying it (pixi-sound throws from inside the browser's audio callback otherwise).

### 5.10 Day-to-day workflow

- **Add a sprite**: drop the PNG into `assets/<bundle>/sprites/<sheet>/`. Under `npm start` the build re-runs, the
  atlas and `assets.d.ts` regenerate and TypeScript picks up the new id without a restart.
- **Rename or delete an asset**: every code reference to the old id becomes a compile error. Fix them, commit the
  regenerated `assets.d.ts` with the change.
- **Edit data**: in a dev build, `Data` files can be re-fetched without a reload: `await game.assets.Reload("level1.level")`
  (data and binary only). It bypasses the cache, replaces the value and emits `asset:reloaded`.
- **Cache busting**: every request carries `?v=<bundle hash>`, a hash of the bundle's content. Change a file and only that
  bundle's url changes, so a deployed update is fetched and everything else stays cached. Atlas images get the same
  version (a plain `?v=` on the atlas JSON would be dropped when pixi resolves the image relative to it; the loader sets
  pixi's `defaultQueryString` instead).
- **Production**: `webpack --mode production` builds with `--production`, leaving `devOnly` roots (the editor's bundle)
  out and writing `"dev": false` in the manifest. Check `dist/assets` is what you expect.
- **Size**: `npm run assets` (it passes `--report`) lists each bundle's biggest files. The build warns past the
  `limits` in `assets.config.json` and says what to do - mark it `background` or `lazy`.

### 5.11 Lifecycle: ownership, unloading and teardown

- **`game.assets` belongs to the game.** There is one per `Game`; it is destroyed with the game.
- **Unloading is deferred by one rendered frame.** When the last holder releases a bundle, its textures are destroyed
  *after the frame that is currently being drawn has been rendered*, not immediately: sprites that were showing them are
  replaced within the same frame, and the renderer throws if it meets a destroyed texture. If someone acquires the bundle
  again in that window the unload is cancelled. A bundle's dependencies unload a frame after it does.
- **Swap order matters**: acquire the new level, build it, *then* release the old (`UseLevelBundle` does the first and
  last; the engine builds the level in between).
- **Async code outlives scenes.** Anything that `await`s a load can resume after the game was destroyed.
  `game.assets` rejects every pending load with `AssetsDestroyedError` (never leaves it hanging) and every later call
  throws it. Treat it as "the game went away" and stop quietly. Check `game.Destroyed` (or catch the error) after each
  `await` in boot code.
- **Components can release for you**: acquire a bundle in `OnInitialise` and `this.Own(() => handle.Release())`.

### 5.12 Build plugins

A plugin is a Node module with `afterScan(context)`, listed under `plugins` in `assets.config.json`. It runs after the
bundles are scanned and **before** they are validated and packed, and may write source files (the build re-scans after
the plugins run). `engine/scripts/asset-meta-plugin.js` is an example: it keeps each bundle's `assets-meta.json` keys in
step with its sprites.

```js
// scripts/my-plugin.js
const fs = require("fs");
const path = require("path");

exports.afterScan = function (context) {
    context.bundles.forEach(bundle => {
        // bundle.name, bundle.dir, bundle.devOnly, bundle.assets: [{ id, local, kind, tier, files, frames, bytes }]
        const sprites = bundle.assets.filter(a => a.kind === "sprite" || a.kind === "animation");
        if (sprites.length > 500) {
            context.Report("warning", `${sprites.length} sprites - consider splitting this bundle`, bundle.name);
        }
        // context.check is true under --check: report instead of writing
    });
};
```

`context.Report(level, message, bundle?, file?)` adds a diagnostic; an `"error"` fails the build.

A plugin may also export **`onSpriteSaved(context)`**, which the dev server's sprite service ([10.6](#106-the-sprite-editor)) calls right after the
sprite editor saves a sprite, so a plugin can keep its own files in step at once instead of at the next build. `context` has
`bundle` (the bundle model as it was before the save), `name`, `isNew`, `category` (the palette tab a new tile was made under),
`copyMetaFrom` (the sprite a "save as" copies from), `config` and `Report(level, message)`. `asset-meta-plugin.js` uses it to add a new
sprite's `assets-meta.json` entry with its category.

### 5.13 Diagnostics

| Message (abridged) | Cause and fix |
| --- | --- |
| `"X" is defined twice: A (image) and B (sound)` | Two files give the same id. Rename one - ids ignore the extension. |
| `animation "zombie" has frames [1, 2, 3, 10]` | Frames must run `0..N` without gaps. Fix the names, or list the strays under `ignore`. |
| `image "g.foo_f0" has the same name as a frame` | An image and a sprite frame would share a texture id. Rename. |
| `"x.xyz" isn't copied: the pipeline doesn't know what a ".xyz" file is` | Warning: put it in `ignore`, or it isn't an asset. |
| `bundle.json: unknown key "dependsOnn" - did you mean "dependsOn"?` | Typo in a settings file. |
| `depends on "globl", which isn't a bundle - did you mean "global"?` | Typo in `dependsOn`. |
| `bundles depend on each other in a cycle: a -> b -> a` | Break the cycle. |
| `font face "x" is also used by ...` | Bitmap font names are one global table in pixi; rename a face. |
| `"g.torch" shadows "global.torch"` | Warning: add `torch` to `overrides` if intended. |
| `"data/level.json" isn't valid JSON` | Fix the JSON; it would otherwise fail at the player's first load. |
| `frame "x" is 5000x40 - larger than the 4096px atlas page` | Raise `atlas.maxSize` or split the frame. |
| `... is 13.8 MB and loads with the bundle` | Warning: set tier `background` or `lazy`. |
| `the generated asset ids are out of date - run npm run assets` | `--check` failed: regenerate and commit `assets.d.ts`. |
| runtime: `Assets haven't been initialised` | `await game.assets.Init(...)` first. |
| runtime: `Couldn't load the asset manifest ... Has the asset build run?` | The manifest url 404s; the build didn't run or `CopyWebpackPlugin` isn't copying `.assets/public`. |
| runtime: `"x" is in bundle "b", which isn't loaded` | `Acquire` / `LoadBundle` / `UseLevelBundle` it first. |
| runtime: `"x" hasn't loaded yet (its tier is "lazy")` | `await game.assets.Load("x")` first. |
| runtime: `no sound adapter was given` | Pass `{ sound: new PixiSoundAdapter() }` to `Init`. |

---

## 6. Input

All input is created by `Game` and torn down with it.

### 6.1 Keyboard (`game.keyboard`)

`Keyboard` is an `eventemitter3`: it emits `"keydown"` and `"keyup"` with the DOM `KeyboardEvent`, and tracks which
keys are down for polling. Key codes come from the `Key` enum (legacy `keyCode` values).

```ts
import { Key } from "@logic-incubator/lib/io/Keyboard";

// Polling, each frame:
this.Tick(() => {
    const k = this.game.keyboard;
    if (k.KeyPressed(Key.LeftArrow) || k.KeyPressed(Key.A)) x -= speed;
    if (k.KeyPressed(Key.Space)) fire();
    if (k.AnyKeyPressed()) { /* ... */ }
});

// Events:
this.ListenWhileShown(this.game.keyboard, "keydown", (e: KeyboardEvent) => {
    if (e.keyCode === Key.Escape) pause();
});

// Rate-limited polling: true once per `ms` while the key is held.
if (this.game.keyboard.KeyPressedMinTime(250, Key.Space)) shoot();
```

### 6.2 Gamepad (`game.gamePad`)

```ts
const pad = this.game.gamePad;
if (pad.IsConnected()) {
    const move = pad.GetStick(0, 0, 0.1);              // Vec2 | null: controller 0, left stick, dead zone 0.1
    const dir = pad.GetStickDirection(0, 1, 0.5);      // "up" | "down" | "left" | "right" | "none" | null
    const fire = pad.GetButton(0, 0);                   // { touched, pressed, value } | null
    const dpad = pad.GetDPad(0);                        // direction (reads axis 9; reports of d-pads vary by controller)
}
pad.on(GamePadEvents.CONNECTED, (index: number) => { /* ... */ });
```

`GetStick` returns `null` when there is no controller *or the controller has too few axes for that stick*; a stick at
rest still returns a vector (zeroed by the dead zone), so test the vector, not just non-null. The engine's
`IsStickPushed(stick)` does that. The returned `Vec2`/button objects are **shared and reused** - copy values you keep.

### 6.3 Touch: `VirtualJoystick`

```ts
const joystick = new VirtualJoystick();
joystick.Create({ zone: document.body, mode: "static", position: { left: "15%", bottom: "20%" } });  // nipplejs options
const direction = joystick.GetDirection(0);    // "up" | "down" | "left" | "right" | "none" (force < 0.6 = none)
joystick.Destroy();
```

### 6.4 Storage helpers

Small wrappers over `localStorage` and the File API (`@logic-incubator/lib/io/Storage`):

```ts
SaveToLocalStorage("hiscore", JSON.stringify(score));
const stored = LoadFromLocalStorage("hiscore");             // string | null

SaveTextFile("level.json", text);                            // triggers a download
const files = await ShowOpenFileDialog();                    // FileList
const content = await LoadTextFile(files[0]);
```

---

## 7. Animation and timing

### 7.1 Tweens

`Tween` animates numeric properties of any object over milliseconds, driven by pixi's shared ticker, and returns a
`Cancel`:

```ts
import { Tween, TweenWithOptions } from "@logic-incubator/lib/tween/Tweener";
import { Easing } from "@logic-incubator/lib/tween/Easing";

Tween(sprite, { alpha: 0 }, 500);                                         // linear fade out
Tween(sprite.position, { x: 400, y: 120 }, 800, Easing.Cubic.Out);        // move
Tween(sprite.scale, { x: 2, y: 2 }, 1000, Easing.Back.Out, () => next()); // with a completion callback

const cancel = TweenWithOptions(light, { alpha: 1 }, 1500, {
    easing: Easing.Sine.InOut,
    pingPong: true,      // 0 -> 1 -> 0, each leg taking 1500 ms
    repeat: Infinity,    // extra plays; Infinity loops until cancelled
    onRound: () => (tint = next(tint)),     // after every play (a round trip counts as one)
});
// later:
cancel();   // stops wherever it is, leaving the last applied values
```

Every `Cancel` should be called when its owner is hidden or destroyed - otherwise the tween keeps writing to its target:

```ts
protected OnShow(): void { this.cancels.push(Tween(this.logo, { alpha: 1 }, 800)); }
protected OnHide(): void { this.cancels.forEach(c => c()); this.cancels = []; }
```

Easings (`Easing.<Family>.<In|Out|InOut>`): `Linear`, `Quad`, `Cubic`, `Quart`, `Quint`, `Sine`, `Expo`, `Circ`,
`Back`, `Bounce`, `Elastic`. `Back` and `Elastic` overshoot mid-curve but start at exactly 0 and end at exactly 1. Any
`(t: number) => number` works too.

### 7.2 Timers

```ts
import { Wait, GetInterval, Cancel } from "@logic-incubator/lib/game/Timing";

const stop = Wait(2000, () => spawnBoss());              // once, after 2 s
const poll = GetInterval(500, () => refresh(), this);    // every 500 ms; `this` is the callback's context
stop(); poll();                                          // cancel
```

These run on `Ticker.shared` in wall-clock milliseconds.

### 7.3 Sprite animation helpers

`AnimationSequence` holds named animated-sprite clips and plays them one at a time:

```ts
const anim = new AnimationSequence(["cat_walkr", "cat_walkl", "cat_fall"]);   // bare AssetFactory names
this.root.addChild(anim.root);

anim.PlayLooped("cat_walkr");
anim.Play("cat_fall", () => this.OnLanded());                     // once, then call back
anim.PlaySequence(["cat_fall", "cat_walkr"], () => this.Done());  // one after another
anim.Current;                                                     // the playing AnimatedSprite
anim.Stop();
```

Display helpers (`@logic-incubator/lib/game/display/Utils`): `CenterOn(object, target)`, `CenterScreen(object)`,
`RemoveFromParent(displayObject)`, `CallbackDone(callback?, context?)`.

---

## 8. Utilities

### Math

```ts
import { Vec2, Rectangle } from "@logic-incubator/lib/math/Geometry";
import { Lerp, Sign, UpperLimit, LowerLimit, Truncate } from "@logic-incubator/lib/math/Utils";

const v = new Vec2(3, 4);
v.length;                // 5
v.normalized;            // { x: 0.6, y: 0.8 }
v.Set(1, 2).Offset(1);   // chainable

const r = new Rectangle(0, 0, 100, 50);
r.Contains(10, 10);  r.center;  r.right;  r.Offset(5, 5);

Lerp(0, 10, 0.25);       // 2.5
LowerLimit(0.003, 0.01); // 0  - a dead zone
```

### `Store`: a small redux-style state container

Used by the editor; handy for any UI state. Extend it, write a pure `Reduce`, dispatch actions:

```ts
interface State { score: number; lives: number }
type Data = { points?: number };

class GameStore extends Store<State, Data> {
    protected DefaultState(): State { return { score: 0, lives: 3 }; }
    protected Reduce(state: State, action?: IAction<Data>): State {
        switch (action.type) {
            case "score": return { ...state, score: state.score + action.data.points };
            case "die":   return { ...state, lives: state.lives - 1 };
            default:      return this.DefaultState();
        }
    }
}

const store = new GameStore(10);                       // keep 10 undo states
const unsubscribe = store.Subscribe((prev, state) => hud.Render(state), this);
store.Dispatch({ type: "score", data: { points: 50 }, canUndo: true });
store.Undo();
```

`Dispatch` notifies subscribers only if the reducer returned a different object. `Subscribe` returns the function that
stops it (use `this.Own(...)` in a component).

### Other helpers

| Module | What |
| --- | --- |
| `patterns/ObjectPool` | `new ObjectPool(n, () => new Thing(), t => t.reset())`; `Get()`, `Put(item)`, `RestoreAll()`. |
| `algorithms/PathSearch` | Breadth-first search on a grid graph: `FindShortestPath(graph, start, end)`, `FindClosestNode`. Implement `ISearchGraph` and extend `SearchNode`. |
| `datastructures/Queue` | A bounded queue: `Queue.Create<T>(capacity)`, `Queue(item)` (drops the oldest past capacity), `Dequeue()`, `Read()`. |
| `patterns/EnumerateTypes` | `AddTypes(a, b)`, `SubtractTypes`, `MultiplyTypes` over objects of numbers. |
| `patterns/FunctionUtils` | `Memoize(fn)` (single-argument), `NullFunction`. |
| `filters/OverlayBlendFilter` | A true "overlay" blend for the WebGL renderer: `top.filters = [new OverlayBlendFilter(backdropSprite)]`. |
| `utils/Debug` | Dev conveniences: `MakeDraggable(displayObject)`, `MoveWithArrowKeys(displayObject)` - log positions to the console. |
| `utils/Types` | `Direction`, `RGB`, `Dictionary<T>`. |

### The tilemap

`lib/src/tilemap` is a vendored copy of `@pixi/tilemap` 3.2.1 (see its README for what changed), with per-tile `tint` and
GPU-driven `flicker` added. It draws thousands of tiles as a few draw calls:

```ts
import { CompositeTilemap } from "@logic-incubator/lib/tilemap";

const map = new CompositeTilemap();
this.root.addChild(map);

// each frame (tiles are re-added every frame in this codebase)
map.clear();
map.tile(this.assetFactory.CreateTexture("floor_1"), x * 16, y * 16, { tint: 0xffaa55 });
map.tile(torchTexture, tx * 16, ty * 16, { flicker: 0.3, flickerSeed: tx * 31 + ty });
```

`TileOptions`: `tint`, `flicker`, `flickerSeed`, `alpha`, `rotate`, `animX`/`animY`/`animCountX`/`animCountY`/
`animDivisor`, `u`/`v`/`tileWidth`/`tileHeight`. A container's `alpha` reaches the shader too.

---

## 9. The dungeon engine

`@logic-incubator/engine` is a top-down, tile-based, Robotron-meets-Gauntlet engine. The game supplies **data** - its
art, a monster roster, the player's setup, levels - and the engine runs it.

### 9.1 How the pieces fit

```
DungeonMain (a scene)
 ├─ Camera            follows the player; handles height zoom
 ├─ TileMapView       draws the level's tile layers, lit and banded by height
 ├─ Hud               hearts, gold, equipped weapon, inventory
 ├─ Player            input, movement, shooting, taking hits
 ├─ Encounter         spawners, monsters, projectiles (pure logic, no pixi)
 ├─ EntityRenderer    draws the player, monsters and shots
 └─ Level             the loaded level: tiles, collision, doors, lights, regions, spawners, pickups
```

`DungeonMain.OnShow` loads the level (asking `LevelAssets` to get its bundle ready first) and starts playing;
`PLAYER_DIED` restarts it after 1.5 s. You rarely touch the parts directly - you configure `DungeonMain`.

### 9.2 Booting a dungeon game

This is `in-dungeons-we-dwell`'s `Dungeon.ts`, trimmed to the essentials:

```ts
import Game from "@logic-incubator/lib/game/Game";
import { GameHeight, GameWidth, Scenes } from "@logic-incubator/engine/Constants";
import { DungeonMain } from "@logic-incubator/engine/DungeonMain";
import MonsterRoster from "@logic-incubator/engine/level/entities/MonsterRoster";
import AssetMetadataStore from "@logic-incubator/engine/level/AssetMetadata";

export function Dungeon(): () => void {
    const game = new Game({ width: GameWidth, height: GameHeight, backgroundColor: 0, fullscreen: true });

    (async () => {
        await game.assets.Init("assets/manifest.json", { sound: new PixiSoundAdapter() });
        await game.assets.LoadBundle("global");

        // The roster first: the editor and level loading check spawner data against it.
        MonsterRoster.inst.Load(Monsters);

        game.sceneManager.AddScene(Scenes.GAME, new DungeonMain({
            player: PlayerSetup,
            level: () => game.assets.Data("level1.level"),   // the level to play; asked for on every start and restart
            levelBundle: () => "level1",                      // the bundle it needs; loaded before the level is built
        }));
        game.sceneManager.ShowScene(Scenes.GAME);
    })();

    return () => {
        game.destroy();
        MonsterRoster.Destroy();
        AssetMetadataStore.Destroy();    // the engine's two singletons outlive a Game, so reset them too
    };
}
```

`DungeonMainOptions`:

| Option | Meaning |
| --- | --- |
| `player` | `PlayerSetup`: the player's look, hit points, hearts and weapons ([9.3](#93-the-player)). |
| `level` | `() => LevelFile \| undefined`. Called on every start/restart. In a dev build return the editor's latest save first (`editor.savedLevel() \|\| shipped`). |
| `levelBundle?` | `() => string \| undefined`. The asset bundle the level plays in. Loaded (with its dependencies) *before* the level is built; the previous one is released after. |
| `playerSprite?` | `() => string \| undefined`. Called on every start/restart; the animation it returns is what the player is drawn with, in place of `player.sprite`. Return `undefined` for the default. This is how a character select screen's pick reaches the game: keep the chosen character in your boot code (listen for the event your screen emits) and return their run animation. |

The engine uses a fixed coordinate system from `@logic-incubator/engine/Constants`: a 1280x720 canvas, 16 px tiles, a
320 px HUD column on the right (`PlayWidth` = 960 px of play area). Use these constants for your `Game` size.

### 9.3 The player

```ts
import type { PlayerSetup } from "@logic-incubator/engine/DungeonMain";

export const PlayerSetup: PlayerSetup = {
    sprite: "wizzard_m_run_anim",                       // an animation, by bare name
    hitPoints: 6,                                       // in half-hearts: three hearts
    hearts: { full: "ui_heart_full", half: "ui_heart_half", empty: "ui_heart_empty" },   // sprite names for the HUD
    weapons: [                                          // the first is equipped at the start
        {
            icon: "weapon_bow",                         // shown in the HUD's weapon slot
            shot: {
                sprite: "weapon_arrow",
                spriteAngle: -Math.PI / 2,              // which way the art points (0 = right); the sprite is turned to face its flight
                speed: 6,                               // pixels per frame
                damage: 1,                              // half-hearts for a monster, hit points for a spawner
                cooldown: 0.2,                          // seconds between shots
                range: 12,                              // tiles flown before fizzling
            },
        },
    ],
};
```

Controls (`PlayerControl`): move with arrow keys or WASD or the left stick; fire with Space or by pushing the right
stick, always left or right in the direction last faced (Tutankham-style); the right stick also sets facing.

### 9.4 Monsters

The engine knows no monsters: the game loads a **roster** before the editor or a level is created.

```ts
import { Chase, Wander, KeepDistance } from "@logic-incubator/engine/level/entities/Behaviours";
import type { IMonsterRoster, MonsterDef } from "@logic-incubator/engine/level/entities/MonsterRoster";

const Types = ["goblin", "ogre", "shaman"] as const;
type MonsterType = (typeof Types)[number];

const Defs: { readonly [K in MonsterType]: MonsterDef } = {
    goblin: { idle: "goblin_idle_anim", run: "goblin_run_anim", hitPoints: 1, speed: 0.6, contactDamage: 1, contactCooldown: 1,
              behaviour: () => new Chase() },
    ogre:   { idle: "ogre_idle_anim", run: "ogre_run_anim", hitPoints: 16, speed: 0.3, contactDamage: 2, contactCooldown: 1.2,
              behaviour: () => new Wander({ aggroRange: 4 }) },
    shaman: { idle: "shaman_idle_anim", run: "shaman_run_anim", hitPoints: 3, speed: 0.4, contactDamage: 1, contactCooldown: 1,
              behaviour: () => new KeepDistance({ range: 5 }),
              ranged: { sprite: "flask_green", speed: 2, damage: 1, cooldown: 2.5, range: 8 } },
};

export const Monsters: IMonsterRoster<MonsterType> = {
    types: Types,                 // the order the editor's spawner dialog lists them
    defaultPool: ["goblin"],      // a new spawner's pool (default: the first type)
    defs: Defs,
    spawnerSprite: "mob_spawner", // drawn over a spawner's cells; its size sets the (solid) footprint
};

MonsterRoster.inst.Load(Monsters);
```

`MonsterDef` fields: `idle`/`run` (animation names), `hitPoints`, `speed` (a multiple of the player's), `contactDamage`
(half-hearts per touch; 0 = harmless), `contactCooldown` (seconds), optional `ranged` (a `Weapon` the monster shoots at a
player within `range` tiles and in view), and `behaviour` - a factory called once per monster spawned, so a behaviour can
keep its own state.

**Behaviours** decide where a monster steers each frame. Built in: `Chase` (the shortest walk to the player),
`Wander({ aggroRange, turnEvery, pace })` (amble until the player is near, then chase for good) and
`KeepDistance({ range, slack })` (hold a distance; pairs with `ranged`). Write your own by implementing
`IMonsterBehaviour`:

```ts
import type { IMonsterBehaviour, MonsterContext } from "@logic-incubator/engine/level/entities/Behaviours";
import { FollowFlow } from "@logic-incubator/engine/level/entities/Behaviours";

/** Charges when it sees the player nearby, otherwise stands still. */
export class Guard implements IMonsterBehaviour {
    constructor(private sightTiles = 6) {}

    Steer(c: MonsterContext): { x: number; y: number } {
        const distance = c.flow.DistanceAt(c.tile.x, c.tile.y);     // walking distance to the player, in tiles
        if (distance < 0 || distance > this.sightTiles) {
            return { x: 0, y: 0 };                                   // UNREACHABLE (-1) or far: stay put
        }
        return FollowFlow(c);                                        // down the flow field to the player
    }
}
```

`MonsterContext` gives `position`, `tile`, `player`, `flow` (`DistanceAt`, `NextCell`, `AwayCell`), `tileSize`, `dt` and an
injectable `random`. Return a vector of length 0 (still) to 1 (full speed). Behaviours are pure (no pixi) and unit-testable.

### 9.5 The level file

A level is JSON that the editor writes and the engine reads (`LevelFile`):

```jsonc
{
  "editorData": { "layers": [ { "id": 1, "name": "Layer 1", "isData": false }, { "id": -99999, "name": "attributes", "isData": true } ] },
  "levelData":  { "levelData": [
      { "name": "floor_1", "position": { "x": 3, "y": 2 }, "pixelOffset": { "x": 0, "y": 0 }, "rotation": 0, "scale": { "x": 1, "y": 1 }, "layerId": 1, "data": null },
      { "name": "player-start", "position": { "x": 1, "y": 1 }, "pixelOffset": { "x": 0, "y": 0 }, "rotation": 0, "scale": { "x": 1, "y": 1 }, "layerId": -99999, "data": null }
  ] }
}
```

A **brush** is one placed thing: a tile (`name` is a bare sprite or animation name, `data` null) or a data brush (on a
data layer). Layers draw in list order, later on top. The engine reads only what `LevelFormat.ts` types; the editor saves
more of its own state alongside.

There are exactly four **data brushes**, painted on the one `attributes` data layer:

| Name | `data` | Effect |
| --- | --- | --- |
| `player-start` | - | Where the player starts (required: a level without one throws "Player start position is not defined"). |
| `collision` | - | Marks a cell solid, in addition to whatever tiles there declare. |
| `z-index` | number | The cell's **height** ([9.7](#97-heights)). |
| `pickup` | a `PickupValue` | Turns whatever tile is on top at that cell into a pickup (it disappears when collected), for an item that isn't one by default. Edited with its popup - choose gold, health, a key, a weapon or an item. |

Lights, spawners and doors are **not** brushes: they are ordinary tiles that carry their behaviour in
`assets-meta.json` (a pickup can be either: a tile that is one by default, or a `pickup` brush over any other).

### 9.6 `assets-meta.json`: tile behaviour by sprite name

So that painting a torch is enough to light a room, per-sprite behaviour lives in a data file in the bundle, keyed by bare
sprite name. The asset build's `asset-meta-plugin` keeps its keys in step with your sprites (a new sprite appears as `{}`;
a deleted one is removed - with a warning if it had anything in it); you only fill in values.

```jsonc
{
  "wall_mid":        { "category": "dungeon", "collidable": true },
  "torch_1_anim":    { "category": "dungeon", "light": { "brightness": 5, "tint": 15856113, "range": 15 } },
  "doors_leaf_closed": { "door": { "id": 1, "open": false } },
  "doors_leaf_open":   { "door": { "id": 1, "open": true } },
  "mob_spawner":     { "spawner": { "monsters": ["goblin"], "interval": 3, "maxAlive": 4, "total": 0, "activationRange": 10, "hitPoints": 10 } },
  "sack_gold":       { "pickup": { "kind": "gold", "amount": 10 } },
  "potion_blue":     { "pickup": { "kind": "item", "sprite": "potion_blue" } },
  "weapon_axe":      { "pickup": { "kind": "weapon", "weapon": { "icon": "weapon_axe",
                         "shot": { "sprite": "weapon_throwing_axe", "speed": 5, "damage": 2, "cooldown": 0.4, "range": 8 } } } }
}
```

| Key | Meaning |
| --- | --- |
| `category` | Which palette tab the **level editor** lists the sprite under: `dungeon`, `entities`, `weapons`, `items`, `misc` or `user` ([10.3](#103-layers-data-brushes-and-palette-categories)). Has no effect in play. A sprite with none is listed under Misc; an unknown value is a build error (and a console warning at run time). |
| `collidable` | Blocks movement. |
| `light` | A point light: `brightness` (peak, 0..1+; it is clamped to 1), `tint` (hex colour as a number), `range` (radius in tiles). Baked once at level load with linear falloff; overlapping lights keep whichever is brighter at each cell. Cells no light reaches have a dim ambient level. A hand-edited light missing a field is dropped with a console warning naming the sprite rather than baking black. |
| `door` | `id` pairs a door's two sprites (closed and open); `open` says which half this is. The door swaps when the player's tile enters any of its footprint cells and swaps back when they leave, so it reads as "walked open" - unless that placement is locked, when the player needs its key ([9.6.1](#961-keys-and-locked-doors)). |
| `spawner` | Produces `monsters` (a pool, picked at random) every `interval` s, at most `maxAlive` at once, `total` in all (0 = unlimited), only within `activationRange` tiles of the player (0 = always). `hitPoints` is the damage to destroy it (0 = indestructible). Its sprite's footprint is solid until destroyed. |
| `pickup` | What walking over it gives: `gold` or `health` (an `amount`; health is in half-hearts and never goes past the maximum), a `key` (an `id`), a `weapon`, or an inventory `item` (its `sprite`, or - left out - the tile's own). The tile then disappears. A malformed one is dropped with a console warning naming the sprite. |

A **specific placement** can override its light, spawner, pickup or door lock (the editor's data-select tool edits them per placement);
`assets-meta` is the default for the sprite. Metadata is per bundle: a level's bundle can have its own
`assets-meta.json`, looked up before `global`'s, so a level can restyle a tile's behaviour as well as its art.

Doors and fog: the level is divided into walkable **regions**; only regions reachable from the player through *open*
doors are drawn, so closing a door conceals what is behind it again.

#### 9.6.1 Keys and locked doors

Every door has a **lock id**, and by default it is `-1`: **unlocked**. The player opens an unlocked door by walking onto it,
with or without keys - so a level with no keys behaves exactly as it always did. To lock a door, use the data-select tool's
*Door lock* popup: tick **Locked** and give it a **Key id** (0 or more; kept in the tile's `data` as `{ "lock": n }`). The
player then opens that door only if they carry a **key with the same id** (a `key` pickup, `{ "kind": "key", "id": n }`);
without it the door is a wall to them. There is no master key. They see the keys they carry (each one's sprite and its id) in
the HUD's *Keys* panel. Keys aren't used up, and a second key with an id already held adds nothing. Dying and restarting the
level drops them. A door's `door.id` in `assets-meta.json` is only what pairs its closed and open sprites - it is not its lock.

Monsters can never open or enter a closed door (see `Encounter` in the API reference), whatever keys the player has.

### 9.7 Heights

The `z-index` data brush paints an integer height per cell. Height is **visual only** - movement and collision stay on one
flat grid (a step of more than one height is blocked) - but it drives a distinctive look: tiles are drawn in bands by
height, the band the player stands on is always 1:1, bands above are larger and bands below recede and fade, and the
camera zooms a little as the player climbs. Tunables are in `engine/level/Depth.ts`.

### 9.8 Events and hooks

All on `game.dispatcher`; the constants are in `@logic-incubator/engine/Events`:

| Constant | Arguments | When |
| --- | --- | --- |
| `LEVEL_LOADED` | - | `Level.LoadLevel` finished. |
| `LEVEL_CREATED` | - | The level's display has been built; gameplay (re)starts. |
| `CAMERA_MOVED` | - | Emitted every frame by the camera follow. |
| `PLAYER_DAMAGED` | `(damage, hitPointsLeft)` | A hit landed on the player. |
| `PLAYER_DIED` | - | Hit points reached 0; the level restarts shortly after. |
| `MONSTER_KILLED` | `(type, x, y)` | A monster died (pixel position). |
| `SPAWNER_DESTROYED` | `(spawner)` | A spawner was shot to pieces. |

```ts
this.Listen(this.game.dispatcher, MONSTER_KILLED, (type: string, x: number, y: number) => this.SpawnLoot(x, y));
```

### 9.9 One bundle per level

```
assets/
  global/      the sprite sheet, HUD art, tile metadata, title screens, shared sounds
  level1/      level.json, level music, level-specific art   (bundle.json: dependsOn ["global"])
  level2/      ...
```

```ts
new DungeonMain({
    player: PlayerSetup,
    level: () => game.assets.Data(`${CurrentLevel}.level` as DataId),
    levelBundle: () => CurrentLevel,                // "level1", then "level2" ...
});
```

When the game switches `CurrentLevel` and restarts the scene, the engine loads the new bundle (showing nothing new until
it is ready), builds the level, then releases the old one. Sprites a level redefines shadow `global`'s; see
[5.8](#58-sprites-by-bare-name-scope-and-assetfactory).

---

## 10. The level editor

`@logic-incubator/editor` is a DOM + pixi editor for the engine's level format. It is a development tool: games include it
in development builds only.

### 10.1 Wiring it in

The editor's icons and bitmap font are the **`editor` asset bundle** (`packages/editor/assets/editor/`). List that folder
as a **dev-only root** and load the bundle before creating the editor (scenes initialise when added, and the editor reads
its icons then):

```jsonc
// assets.config.json
{ "roots": [
    { "dir": "assets" },
    { "dir": "../logic-incubator/packages/editor/assets", "devOnly": true }
] }
```

```ts
// src/editor/Editor.ts - only the dev build's entry point imports this
import { DungeonEditor, ResumeEditorScene } from "@logic-incubator/editor/DungeonEditor";
import { EditorBundle } from "@logic-incubator/editor/EditorAssets";
import { LoadSavedLevel } from "@logic-incubator/editor/SavedLevel";

// GameEditor is the game's own little interface (see in-dungeons-we-dwell's Dungeon.ts): what its boot code needs of the editor.
export const Editor: GameEditor = {
    bundles: [EditorBundle],                              // loaded before create()
    create: () => new DungeonEditor(EditorSetup),
    savedLevel: LoadSavedLevel,                           // the editor's latest save, if any
    startScene: ResumeEditorScene,                        // optional: come back up in the editor after the sprite editor's reload (10.6)
};
```

```ts
// src/main.editor.ts (dev entry)          // src/main.ts (production entry)
Dungeon(Editor);                            Dungeon();
```

In `Dungeon()`: `for (const bundle of editor?.bundles ?? []) await game.assets.LoadBundle(bundle)`, then
`AddScene(Scenes.EDITOR, editor.create())`, and make the game play the editor's save in preference to the shipped level:
`level: () => (editor && editor.savedLevel()) || game.assets.Data("level1.level")`. Point webpack's `entry` at
`main.editor.ts` for `development` and `main.ts` for `production`; the `devOnly` root then keeps the editor's files out of
the production build too.

`IDungeonEditorOptions`:

```ts
export const EditorSetup: IDungeonEditorOptions = {
    titleScene: "title",                       // T jumps to this scene, to preview the game's own front end
    dataBrushIcons: {                          // sprite shown over each data brush's colour in the palette
        [DataBrushName.PLAYER_START]: "knight_m_idle_anim",
        [DataBrushName.COLLISION]: "wall_mid",
        [DataBrushName.Z_INDEX]: "floor_stairs",
        [DataBrushName.PICKUP]: "sack_gold",
    },
    mapStyle: new MyStyle(),                   // the game's tiles for generated maps (keys 1-8); without it those keys do nothing
};
```

### 10.2 Using it

The editor opens as a full-window overlay: a **map canvas** on the left; on the right the **brush palette**, the
**selected brush** (with an **Edit** button - `E` - that opens a tile in the [sprite editor](#106-the-sprite-editor)), and the **layer list**; and a
vertical **toolbar** of tools at the far right. Each palette tab ends in a **+** that starts a new tile in that category.

**Tools** (also keys):

| Key | Tool | What it does |
| --- | --- | --- |
| `B` | Brush | Left paints; right erases; Ctrl+drag paints a filled rectangle. |
| `X` | Erase | Erases from the selected layer; Ctrl+drag a rectangle. |
| `A` | Attributes (data select) | Click a placed light, spawner, pickup, door or height - any cell of its sprite, not just the top-left - to edit its value in a dialog. Only offered while a data layer (the attributes layer) is selected; its button is hidden, and the key does nothing, with a tile layer selected. |
| `U` | Stamp | Drag a rectangle of the brush; hold Ctrl for just the border; right-drag erases a rectangle. Esc cancels. |
| `I` | Dropper | Click a tile to paint with it (on the attributes layer, a data brush with its value). |
| `G` | Fill | Flood-fills matching cells on the selected layer, up to the edge of the view. |
| `M` | Move | Drag to pan. Middle-drag or Space+drag pans with any tool. |

**Keyboard**

| Key | Action |
| --- | --- |
| `Enter` | Toggle **play**: saves the level (to localStorage) and runs it in the game; Enter again returns to the editor. |
| `S` | Download the level as `dungeonLevel.txt` (JSON). |
| `L` | Load a level file. |
| `Ctrl+Z` | Undo. |
| `Ctrl+Q` | Clear the map (asks first). |
| `H` / `V` / `R` | Flip the brush horizontally / vertically / rotate it. |
| Arrow keys | Nudge the brush's pixel offset. |
| `+` / `-` (numpad) | Raise / lower the data brush's value (a height, for `z-index`). |
| `Shift+D` | Duplicate the selected layer. |
| `T` | Preview the game's title screen (if `titleScene` is set). |
| `1`-`7` | Generate a map (digger, rogue, uniform, divided maze, eller maze, icey maze, cellular) in your tiles. |
| `8` | Generate a height test map. |

### 10.3 Layers, data brushes and palette categories

- **The palette is split into tabs by category**: **Dungeon** (floors, walls, doors, traps, columns, torches and other fixtures),
  **Entities** (monsters and characters, and the spawner marker), **Weapons**, **Items** (pickups, gold, chests, potions),
  **Misc** (everything else - hearts, loose props) and **User** (content your users add). A data layer shows the **Data** tab instead.
  Each sprite's tab is its `category` in `assets-meta.json` ([9.6](#96-assets-metajson-tile-behaviour-by-sprite-name)); a sprite
  without one is under Misc, so a new sprite is findable at once and you sort it later. Inside a tab the sprites are in name order,
  which keeps an animation (`wall_fountain_mid_red_anim`) next to the tiles it goes with. Empty tabs stay (the User tab starts
  empty and says how to fill it), so a tab is always where you last found it. Picking a brush that is on another tab - from the
  dropper, or when the editor comes back after a sprite was saved - switches to its tab.
- The categories are read when the editor is created, so the game's metadata must already be loaded then - add the game scene
  (which binds the metadata, [9.1](#91-how-the-pieces-fit)) before the editor scene, and load `global` first.
- Tile layers draw in list order; add, rename, hide (the eye), reorder and duplicate them in the layer panel.
- The one **attributes** layer is always present. Player start, collision and z-index are painted on it, and it also
  draws a read-only overlay of what the game *derives* from tiles' metadata (collision, door footprints, lights,
  spawners) so a cell's whole picture - hand-placed and intrinsic - is in one place.
- Painting a torch or a spawner **tile** is enough; its light or spawner values come from `assets-meta.json`. Use the
  Attributes tool to override them for one placement.

### 10.4 Generated maps and `IStyler`

Keys 1-7 lay out a rooms-and-corridors map (using `rot-js`) in your plain floor and wall tiles, then restyle each room with
your own art. Extend `BaseStyle` and fill in the corners, walls, floor and doors for your tileset:

```ts
import { BaseStyle } from "@logic-incubator/editor/maps/BaseStyle";
import type { Brush } from "@logic-incubator/engine/level/LevelFormat";

export class MyStyle extends BaseStyle {
    readonly floor = "floor_1";
    readonly wall = "wall_mid";

    TopLeft(): Brush[]     { return this.Fill(["wall_top_left"], this.rect.x, this.rect.y); }
    TopRight(): Brush[]    { return this.Fill(["wall_top_right"], this.rect.x + this.rect.width, this.rect.y); }
    // ...BottomLeft, BottomRight, TopWall, BottomWall, LeftWall, RightWall, Floor, Doors
}
```

`this.rect` is the room being styled and `this.doors` its door cells; `Fill(names, x, y)` returns brushes placing those tiles
at a cell. See `in-dungeons-we-dwell/src/editor/Style0x7.ts` for a complete one.

### 10.5 Saving, exporting and shipping a level

1. Edit, then press **Enter** to play it. The editor keeps your map in localStorage (`dungeonLevel`) - it survives page
   reloads - and a dev build's game plays that save instead of the shipped level.
2. When it is right, press **S** to download `dungeonLevel.txt`.
3. Save that JSON over `assets/level1/data/level.json`, run `npm run assets` (the manifest hash changes), commit.
4. The production build plays the shipped file; it never contains the editor.

### 10.6 The sprite editor

Select a tile and press **Edit** (or `E`) on the selected-brush card, or click the **+** at the end of a palette tab, to draw in the
**sprite editor**: a full-window pixel editor for the sprite's source PNGs. **+** starts a *new* tile under that tab - it asks for a
name, a bundle, a size and a frame count, and the tile is listed under that tab once saved. Both buttons are there in any build that
includes the editor; what **Save** does depends on where the page is running - it writes the files itself under the dev server on
`localhost`, and anywhere else it downloads them ([how saving works](#how-saving-works)).

**Layout.** Menus along the top (File, Edit, Sprite, View, Palette, Help) with **Save** (**Download**, away from the dev server) and **Close**; the **tools** and their options
on the left; the canvas in the middle (wheel or `+` / `-` zooms, Space-drag or middle-drag pans, `0` fits it to the window); the
**palette**, colour editor and **channel mixer** on the right; the **frames** with playback along the bottom. **Help > Keyboard
shortcuts** lists every key.

**Tools.** The left button paints the foreground colour and the right button the background colour.

| Key | Tool | Notes |
| --- | --- | --- |
| `B` | Pencil | Brush size and shape in the options (`[` / `]` change the size); Shift-click draws a line from the last point. |
| `E` | Eraser | Paints the palette's transparent entry (one is added if the sprite has none). |
| `L` `R` `O` | Line, rectangle, ellipse | Shift snaps to 45 degrees / a square / a circle. "Filled shapes" is in the options. |
| `G` | Fill | Touching pixels only, or - unticked - every pixel of that colour. |
| `I` | Colour picker | Alt-click picks with any tool. |
| `M` | Select | Drag a marquee; drag inside it to move the pixels (Ctrl-drag copies them); arrows nudge (Shift: 8); `Ctrl+C` / `X` / `V`, `Delete`, flip and rotate in the Edit menu. Pasted and moved pixels float until you click elsewhere, change tool, or change frame; Esc or `Ctrl+Z` drops them. Transparent pixels in a selection let what is underneath show through. **Crop to selection** (the Edit and Sprite menus, or the button in the options) cuts every frame down to the selected area, which becomes the new canvas. |

The **Mirror** options draw on both sides of the vertical and/or horizontal middle at once, shapes included.

**Colour: one 256-colour palette, with alpha.** A sprite is *indexed*: each pixel is an index into the sprite's palette of up to 256
colours, every one with its own alpha (0 is transparent). A new sprite starts with the classic 256-colour layout (transparent, the 15
system colours, a 6x6x6 cube, 24 greys). By convention slot 0 is transparent - it is what the eraser paints.

- **Picking.** Click a swatch for the foreground, right-click for the background; Ctrl-click adds to a selection and Shift-click
  extends it (the mixer can target the selection); drag one swatch onto another to **swap** them - the picture follows. `+` adds a
  slot, `-` removes the selected ones (pixels that used them take the nearest colour left).
- **Editing a colour.** Red, green, blue and alpha sliders, a hex box (`#rrggbb` or `#rrggbbaa`) and the browser's colour picker.
  Dragging a slider is a single undo step.
- **Extract palette** (Palette menu). *From the sprite* rebuilds the palette from the colours the sprite really uses - unused entries
  go, and if you set a lower limit than the number of colours, similar ones are merged (median cut) - and the picture stays as it
  was. *From an image file* (anything the browser can open) extracts up to *N* colours from that picture, then you choose: re-match
  the sprite to it, fill the palette slots with it, or just keep it in your palettes.
- **Save and load custom palettes.** *Save palette* keeps the sprite's palette (alpha included) under a name in this browser's local
  storage, ready for any sprite; *Load palette* offers six built-ins (Default 256, PICO-8, Game Boy, EGA, Greys, Web safe) and yours;
  *My palettes* renames and deletes. Loading either **fills the palette slots** - pixels keep their indices, so the sprite
  recolours - or **re-matches the sprite**, moving pixels to the nearest of the new colours so it looks the same. *Import / Export
  palette file* reads and writes `.pal` (JASC), `.gpl` (GIMP) and `.json` (the one that keeps alpha).
- **Sort** (brightness, hue, most used) and **Remove unused colours** rearrange the palette without changing the picture.
- **Channel mixer** (right-hand panel), as in Photoshop: for the output channel you pick (red, green, blue - or gray, with
  Monochrome on) set how much of each source channel goes into it (-200% to +200%) plus a constant (-100% to +100%); alpha has its
  own scale and offset. Presets give greyscale, sepia, invert, channel swaps and rotations, darken, lighten, warm and cool. Changes
  **preview** live on the canvas, the palette and the frames; apply them to all colours or only the selected ones. **Apply** is one
  undo step. Fully transparent entries are never touched.

**Frames and playback.** An animation is several frames of the same size. In the strip, click a thumbnail to edit that frame and
drag one onto another to reorder; the buttons add a blank frame, duplicate, delete, move and reverse. **Onion skin** shows the
neighbouring frames faintly, tinted, under the one you edit. Playback has play / pause (`Enter`), stop, a speed in frames per
second (12 by default, the speed tiles animate at in the game) and loop / ping-pong / once, and plays in a preview beside the strip
while you carry on editing; `,` and `.` step through the frames.

**Save, Save as, Revert, Close.** `Ctrl+S` saves; `Ctrl+Shift+S` saves a copy under a new name (optionally copying the original's
tile properties) and carries on editing the copy; *Revert to saved* reloads the files; `Esc` or *Close* asks first if there are
unsaved changes. Away from the dev server these become *Download*, *Download as...* and *Revert to the page's art*.

#### How saving works

The editor picks one of two ways when it opens, by asking the dev server's sprite service whether it answers: on `localhost` under
`npm start` it does, and saving **writes the files**; anywhere else - another machine, the network address, a hosted build - it doesn't, and
saving **downloads them** ([below](#away-from-the-dev-server-downloads)).

On the dev server, saving writes **source PNGs** into the game's asset folders and lets the watching build pack them like any other art change:

- An existing sprite is saved where it is. A new one goes in `assets/<bundle>/sprites/<sheet>/` - the bundle you chose, and the
  sheet (a folder; `user` by default).
- One frame is `name.png`; several are `name_f0.png`, `name_f1.png`... When a sprite changes from one to the other (or loses frames),
  the files that no longer belong are removed.
- They are **indexed PNGs** (palette and alpha entries kept), so reopening a saved sprite gives back exactly the same palette and
  indices. A sprite that is not indexed, or whose frames have different palettes, gets a palette extracted when it is opened (merged
  to fit 256 colours if need be, and the editor says so).
- A new tile gets its `assets-meta.json` entry straight away, with the palette tab it was made under as its `category`; *Save as*
  with "Copy tile properties" copies the original's entry (collision, light, pickup...).
- The dev build packs the change in about ten seconds and the status bar says when it has. The running page cannot see new art until
  it is reloaded, so **closing the sprite editor after a save reloads the page**: the level you were editing is kept first (the way
  Enter keeps it for play), the game starts back in the level editor, and the saved sprite is the picked brush, shown on its own tab.
  The sprite editor's undo history does not survive that reload.
- **If the page reloads while the sprite editor is open** - F5, or the dev server doing it: a rebuild that type-checks the whole game (a
  new sprite changes `src/generated/assets.d.ts`) can block it long enough to drop the page's connection, and the page then reloads - the
  editor keeps your work. As the page unloads it snapshots the sprite (pictures, palette, where it's to be saved, any unsaved edits) and
  the level to session storage, and the next load puts the window back, with a note, on the level editor. Undo history is the one thing
  that doesn't come back. With unsaved edits the browser may also ask "Leave site?" first.

#### Away from the dev server: downloads

Open the game from another machine, from the network address, or from any build that has the editor but isn't served by `npm start`,
and the sprite editor still works - it just can't reach the disk. Nothing is written anywhere; the browser is handed files instead.

- **Opening** reads the sprite back from the art the page has already loaded: the editor fetches the atlas image the sprite's textures
  came from (the browser has it cached), decodes it exactly, and cuts each frame out with its trimmed border put back, so every pixel
  is the source PNG's. What an atlas doesn't keep is the source file's palette, so the editor extracts a new one and says so. The
  bundles, sheets and names it checks a new sprite against come from the asset manifest.
- **Download** (the Save button, `Ctrl+S`) gives one frame as `name.png`, and several as `name.zip`, laid out from the assets folder
  down (`global/sprites/user/name_f0.png`...) so extracting it there puts every frame in place. The zip is written by the editor
  itself - PNGs are compressed already, so it stores them as they are and there's no library to add. The sprite then counts as saved,
  and closing never reloads the page, since nothing changed on the server.
- The editor can't change your files, so it **tells you what's left to do** in a dialog after the download: the files the new ones make
  obsolete, to delete (a sprite going from one frame to several or back, or losing frames), and, for a new tile, the line to add to the
  bundle's `data/assets-meta.json` - with the original's properties if it came from *Save as* with "Copy tile properties".
- It can't tell a sprite that lives in a sub-folder of its sheet, or in a pre-packed sheet, from a plain one: the files are laid out
  for `sprites/<sheet>/` - put them where the sprite's own are.
- The File menu has **Download a copy (PNG or zip)** on the dev server too, for a copy to keep or send without saving.

**Limits.** 1x1 to 512x512 pixels, up to 100 frames, every frame the same size. On the dev server a sprite in a pre-packed sheet (`<sheet>.json` +
`<sheet>.png`) has no source frames to write over, and the editor's own bundle is dev-only, so neither can be edited there. A sprite's name is lowercase
letters, digits and `_` (at most 48), cannot end in `_f` and a number (that marks an animation frame), and must not already be used -
by *anything* - in its bundle.

**The dev-server service.** `AssetsWebpackPlugin` mounts the sprite service at `/__sprite-api` on the webpack dev server, in
development mode only (`new AssetsWebpackPlugin({ configPath, spriteApi: false })` leaves it out); there is nothing of it in a
production build. Because it writes files on your disk it answers only requests from this machine, addressed to `localhost`, from the
page's own origin, carrying an `X-Sprite-Editor` header; from anywhere else the editor falls back to downloads (above), so it's
`http://localhost:...` you open to have saves written for you. It never takes a path: the editor names a bundle and a sprite, and a
save is planned in full first (the bundle is re-classified as it would be afterwards, and a save that would add an error - a name
clash, a gap in an animation - writes nothing). See the [API reference](api-reference.md#sprite-api).

**Wiring it into a game.** The sprite editor comes with `DungeonEditor`; the only thing a game adds is the way back after the
reload. Give the game's `GameEditor` a `startScene` and use it when choosing the first scene:

```ts
// src/editor/Editor.ts
import { DungeonEditor, ResumeEditorScene } from "@logic-incubator/editor/DungeonEditor";
export const Editor: GameEditor = { bundles: [EditorBundle], create: () => new DungeonEditor(EditorSetup), savedLevel: LoadSavedLevel, startScene: ResumeEditorScene };

// src/Dungeon.ts - at the end of Boot, instead of always showing the enter screen
game.sceneManager.ShowScene((editor && editor.startScene && editor.startScene()) || FrontEndScenes.ENTER);
```

`ResumeEditorScene()` is the editor's scene only on a load straight after the sprite editor closed with a save, or after the page reloaded
under an open one, and `undefined` otherwise, so the game's normal front end is untouched.

---

## 11. Testing

Tests are `vitest` in a plain `node` environment: **no browser, no pixi renderer**. That shapes how code is written here.

### 11.1 What to test and how

- **Keep logic in pure modules** with no pixi import (header comment: "Pure - no pixi - so it runs under the plain node
  test runner"). The engine's level, lighting, doors, regions, behaviours, spawners, projectiles and encounter logic are all
  testable this way; inject what they need (`emit`, `sizeFor`, `random`) rather than reaching for globals.
- **When a module imports pixi**, mock it: `vi.mock("pixi.js", () => ({ Container: class {...} }))`. See
  `lib/src/game/GameComponent.test.ts` (a hand-cranked ticker) and `lib/src/loading/AssetFactory.test.ts`.
- **Test lifecycle code with fakes of the owner**, as `Game.test.ts` does for teardown order.
- **Co-locate** tests: `Thing.ts` and `Thing.test.ts` side by side. A game's `vitest.config.mts` maps the same
  `@logic-incubator/*` aliases as its `tsconfig.json`.

### 11.2 Testing asset-dependent code

Games' tests need to know their art (does `knight_idle_anim_f2` exist?). Do not depend on build output; read the **source**
assets through the same scan the build uses. in-dungeons-we-dwell's `src/testing/AssetCatalog.ts` does this:

```ts
const { ScanRoot } = nodeRequire(path.join(pipeline, "scan.js"));
const { ClassifyBundle } = nodeRequire(path.join(pipeline, "classify.js"));
// ... Meta(), SpriteNames(), FramesOf(name), HasFrame(frame), FrameBounds(frame)
```

```ts
it("runs every character from an animation in the sprite sheet, with frames to play", () => {
    Characters.forEach(c => expect(FramesOf(c.run)?.length, c.name).toBeGreaterThan(1));
});
```

To test code that uses `game.assets`, depend on a small interface (as `LevelAssets` does with `LevelAssetsHost`) or construct a
real `Assets` with a fake loader:

```ts
const assets = new Assets({ loader: fakeLoader, schedule: fn => { queue.push(fn); return () => {}; } });
assets.InitWithManifest(manifest, "assets/", { sound: fakeSound });
await assets.LoadBundle("global");
```

`Assets.test.ts` shows fakes for the loader and sound adapter, and a hand-run frame scheduler for deferred unloads.

### 11.3 Testing the asset build

The build is plain Node, so its tests build real folders in a temp directory and call `BuildAssets` (`lib/scripts/assets/build.test.ts`):
second-run-writes-nothing, repack-on-change, `--check`, production, plugins. Use it as a model for your own plugins.

---

## 12. Conventions and working on the workspace

- **Style**: 4-space indent, double quotes, semicolons, **PascalCase methods** (`LoadBundle`, `Tick`), camelCase fields,
  singletons as `private static _inst` + `static get inst()` with a static `Destroy()`. Comments explain *why*.
- **Import direction**: `editor -> engine -> lib`. Lint rejects an import going the wrong way and any relative import
  into another package: import by name (`@logic-incubator/lib/...`).
- **Singletons must be resettable**: anything that outlives a `Game` (`AssetFactory`, `AssetMetadataStore`,
  `MonsterRoster`, the editor's stores) has a `Destroy()` the game's teardown calls.
- **ES5 target**: use `Array.from` / `forEach` on `Map` and `Set`; no `for..of` over them. `async`/`await` and arrays in
  `for..of` are fine.
- **A change to lib is a change to every game**: run the games' tests and a dev build too (`npm run build` in each).
- **Sprites and ids**: new code should use typed ids (`game.assets...`); the bare-name `AssetFactory` API is for data that
  already names sprites that way (levels, metadata, rosters).
- **Generated files are committed** (`src/generated/assets.d.ts`); build output (`.assets/`, `dist/`) is not.

---

## 13. Troubleshooting

**The game is black and the console shows nothing.** Open the Network panel: is `assets/manifest.json` 404? The asset build
didn't run, or `CopyWebpackPlugin` isn't copying `.assets/public` to `assets`.

**`TS2307: Cannot find module '@logic-incubator/lib/assets/AssetIds'`** - your `tsconfig.json` `paths` doesn't map
`@logic-incubator/lib/*`, or `src/generated/assets.d.ts` is outside the `include`.

**Every id is `string` and typos compile.** The generated file didn't merge. Check it starts with `export {};` and that the
module name matches `dtsModule`; add `assetTypes.check.ts` ([5.3](#53-typed-ids)) so this fails loudly.

**`Property 'assets' does not exist on type 'Game'`** - the game is compiling an older logic-incubator; update the checkout
beside it.

**A sprite in my level is missing and the console says `"x" is not in the sprite sheet`.** The name isn't registered in the
current scope: the bundle holding it isn't loaded, or the level's bundle isn't in scope. Check `game.assets.Scope`,
`game.assets.Stats()` and that `levelBundle` returns the right name.

**A sound plays twice or "Sound with alias ... already exists".** Something is calling pixi-sound's `sound.add` directly
with a manifest id. Load sounds only through `game.assets`, and let it remove them.

**Renderer errors about null textures or frames after a level change.** Something may still hold a texture from
the unloaded bundle (a sprite you created and kept). Sprites made from a bundle's textures must be destroyed or replaced
before that bundle is released; build the new level first, then release the old (`UseLevelBundle` order).

**The build says an id is defined twice but I only see one file.** Look for the same base name in another folder or with a
different case/extension (`Enter.png`, `enter.ogg`): ids ignore both.

**Production build contains the editor.** The editor's root must be `devOnly: true` and the build must run with
`--production` (webpack mode `production` does this for the plugin).

**The webpack dev server rebuilds in a loop.** Two builds are writing the same `.assets/` folder, or something else writes
inside a watched assets root. Run one build at a time.

**Save says "Download" and nothing is written to my assets.** The editor couldn't reach the dev server's sprite service, so it works in download
mode ([10.6](#away-from-the-dev-server-downloads)). The service exists only under `npm start` (webpack mode `development`, with
`AssetsWebpackPlugin`'s `spriteApi` not switched off) and answers only to `localhost` - open the game at `http://localhost:<port>/`, not the
machine's network address. `GET /__sprite-api/list` (with an `X-Sprite-Editor: 1` header) should answer.

**There is no Edit button.** It is absent for a data brush and for a texture made at run time, which are not from a bundle.

**Opening a sprite says it "isn't loaded in this page" or can't tell which atlas it came from.** In download mode a sprite is read back from the atlas the
page loaded, so its bundle must be loaded (a level's own sprites only while that level's bundle is). A sprite whose atlas stores it rotated can't be read back.

**Saving a sprite says "That would leave the bundle with errors".** The service re-classifies the bundle as it would be after the save and refuses one
that would add an error - usually a name another asset already has (ids ignore the extension and the folder), or a name ending in `_f<number>`.
The message names the problem; nothing was written.

**The art I saved isn't in the level editor.** The page only loads new art on a reload: close the sprite editor (it reloads for you after a save). If
the status bar never said the build had packed it, look at the dev server's console for an asset-build error.

**A bundle never unloads.** Something still holds a handle (`Acquire` without `Release`), another bundle depends on it, or
it was loaded with `LoadBundle` (pinned). `game.assets.Stats()` shows each bundle's `refs` and `pinned`.
