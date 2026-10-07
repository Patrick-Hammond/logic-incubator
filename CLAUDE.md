# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Shared source for small browser games, built on **pixi.js 5.2.1** (pinned; the legacy `Loader`/`interaction` APIs, not pixi 6+). It is a library, not an application: there is nothing to build or run here and nothing is published. Games check this repo out beside their own (`../in-dungeons-we-dwell` uses lib + engine + editor + ui, `../catgrab` uses lib only) and compile it from source through `@logic-incubator/*` path aliases. `README.md` is a short overview; `docs/user-guide.md` and `docs/api-reference.md` are the detailed reference.

## Commands

Run from the repo root. CI (`.github/workflows/ci.yml`) runs the first three; lint is `continue-on-error`.

```bash
npx tsc -p . --noEmit                                  # type-check every package (noUnusedLocals is on, so an unused local fails)
npm test                                               # vitest run, whole workspace
npm run lint                                           # eslint .
npx vitest run packages/lib/src/game/GameComponent.test.ts            # one file
npx vitest run packages/lib/src/game/GameComponent.test.ts -t "Track" # tests whose name matches
```

- `npm run lint` is **not clean at the moment** (about 16 errors and 8 warnings in older code, e.g. `tilemap/`); lint the folder you changed (`npx eslint packages/lib/src/debug`) and don't add to the pile.
- A fresh git worktree has no `node_modules`: run `npm ci` in it before tsc, tests or eslint.
- Tests are picked up from `packages/*/src/**/*.test.ts`, `packages/*/scripts/**/*.test.ts` and `packages/*/tools/**/*.test.mjs`.
- The asset build (`packages/lib/scripts/build-assets.js`, flags `--check --production --clean --report`) takes a **game's** `assets.config.json`, so it is run from a game, not here. `packages/ui/tools/*.mjs` are art tools run with plain node (see `packages/ui/README.md`).
- To see a change in a browser, start a game's dev server: `.claude/launch.json` has `in-dungeons-we-dwell-dev` (port 4202) and `catgrab-dev` (port 4203). Those games compile the **main checkout** of this repo, not a worktree, so a worktree's edits don't reach them until merged there. After a lib change, also run the games' tests and a dev build (`npm run build` in each).

## Packages and the import rule

Four npm workspaces under `packages/`, importing each other by name (`@logic-incubator/lib/game/GameComponent`), never by relative path:

```
editor -> engine -> ui -> lib        (the editor also uses ui directly)
```

`eslint.config.js` enforces this with `no-restricted-imports` per package (and bans relative imports into another package), so **that file is the source of truth**. The README, `docs/README.md` and the user guide describe all four (the user guide's chapter 14 is the UI kit).

- `lib` - game framework: `Game`, `GameComponent`, `SceneManager`, the asset system (`src/assets`) and its Node build (`scripts/`), input (`io/`), tweening, vendored tilemap and particles, debug tools (`debug/`), small utilities. Also `html/`, the page the games are served in.
- `ui` - skinnable widget kit (buttons, panels, menus, sliders...) plus keyboard/gamepad/mouse focus navigation, with its own `ui` asset bundle (`assets/ui`). Pure rules (`ButtonLook`, `SliderMath`, `FocusManager`...) are kept apart from the pixi widgets.
- `engine` - top-down tile dungeon engine. It **owns the level format** (`level/LevelFormat.ts`); the editor only writes it. `DungeonMain` is the `GameComponent` that composes `Level` (pure data and rules) with the views in `view/`, driven by option callbacks from the game.
- `editor` - the level editor and a sprite editor, wired into development builds only. Its panels and dialogs are DOM, not pixi (`src/ui/dom`, `FormDialog`); `EditorComponent` gives its pieces shared static stores. Its icons and font are the `editor` asset bundle (`assets/editor`).

The `@logic-incubator/*` mapping lives in **three** places that must agree: `tsconfig.json` `paths`, `vitest.config.mts` `resolve.alias`, and each game's own tsconfig/webpack/vitest config. A new package or folder needs all of them plus the lint rules.

## Things that need several files to understand

**`GameComponent` lifecycle** (`lib/src/game/GameComponent.ts`; user guide section 4.2). A scene or any piece of one is driven explicitly by its owner, never by pixi's `added`/`removed` events. Initialise and Show run owner first, then children in attach order; Hide and Destroy run children first, in reverse. Three different lifetimes, easy to confuse: `Own(dispose)` only *registers* cleanup for when the component is destroyed (`Listen` is `Own` plus a subscription); `WhileShown(on, off)` / `Tick` / `ListenWhileShown` run on every Show and stop on every Hide; `Track(cancel)` holds something started during a visit (a tween, a wait) and cancels it at the next Hide. `Attach` is for child **components** only; there is no `Detach`, so don't attach short-lived things. Use `this.root.addChild` for display objects.

**`Game` and singletons.** One of each of `sceneManager`, `assets`, `keyboard`, `gamePad` per `Game`; `Game.inst` is the current one. `game.destroy()` tears down in dependency order (scenes, input, assets, sprite registry, pixi). Anything that outlives a `Game` (`AssetFactory`, `AssetMetadataStore`, `MonsterRoster`, the editor's stores) needs a `Destroy()` the teardown calls, so a new `Game` can start in the same page.

**Assets.** A game's `assets/` folders are *bundles*, loaded by `game.assets`. Ids are `<bundle>.<file name>` (`global.title`). The build writes the game's committed `src/generated/assets.d.ts`, which fills in lib's `AssetRegistry` so `game.assets.Texture(id)` etc. are compile-time checked. Level files and metadata use bare sprite names, resolved through `AssetFactory`. The build in `lib/scripts/assets/` is plain CommonJS Node, tested by building real folders in a temp directory (`build.test.ts`); build plugins such as `engine/scripts/asset-meta-plugin.js` hook into it.

**Vendored pixi code.** `lib/src/tilemap` (from `@pixi/tilemap` 3.2.1) and `lib/src/particles` (from `pixi-particles` 4.3.1) are owned forks with changes of their own (per-tile tint and flicker, bug fixes; `killRect`, a ticker argument). Each has a `README.md` listing what differs from upstream: update it when you change the fork. Edit them in place rather than patching `node_modules`.

**Pinned pixi tree.** Root `package.json` `overrides` pin every `@pixi/*` package to 5.2.1, because a second copy of `@pixi/core` breaks the renderer. If you add a pixi sub-package, add it to the overrides too. Shader files (`.frag`/`.vert`) and their ambient `.d.ts` come in through the games' tsconfig `include`.

**Debug tools** (`lib/src/game/DebugTools.ts`, `lib/src/debug/`). `this.debug.Drag(obj)` and `this.debug.Emitter(emitter)` on a `GameComponent` are DOM-based and dev-only (gated on `!assets.IsReady || assets.IsDev`); in a production build they do nothing but log a one-time warning, so calls left in are harmless but should be removed before shipping.

## Conventions

- 4-space indent, double quotes, semicolons, **PascalCase methods** (`LoadBundle`, `Tick`), camelCase fields. Comments explain why, not what.
- Target is **ES5** with lib `es2017`: use `Array.from`/`forEach` on `Map` and `Set`, not `for..of`. `async`/`await` and `for..of` over arrays are fine.
- Tests are vitest in a plain `node` environment: no browser, no pixi renderer. Keep logic in pure modules with no pixi import (several start with the header "Pure - no pixi - so it runs under the plain node test runner") and inject what they need; where a module does import pixi, mock it with `vi.mock("pixi.js", ...)`. Tests sit beside the file as `Thing.test.ts`. The suite has a 30 s timeout because the type-level tests build a whole TypeScript program.
- Public API changes go in both `docs/api-reference.md` and `docs/user-guide.md`.
- Generated files in a game (`src/generated/assets.d.ts`) are committed; build output (`.assets/`, `dist/`) is not.
- Developed on Windows with `core.autocrlf`: git's "LF will be replaced by CRLF" warnings are expected.
