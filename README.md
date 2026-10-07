### LOGIC INCUBATOR

code microbes.. microdes

**Documentation: [`docs/`](docs/README.md)** - a [user guide](docs/user-guide.md) (setup, a first game, scenes, assets,
input, the dungeon engine, the UI kit, the level editor, testing) and an [API reference](docs/api-reference.md).

The shared code the games build on - there's nothing to run here. An npm workspace of four
packages, whose dependencies only point down (editor -> engine -> ui -> lib; the editor may use `ui` too):

- `packages/lib` - `@logic-incubator/lib`: game framework, asset bundles and their build
  (`src/assets/`, `scripts/`), input, tweening, tilemap rendering, filters; plus the HTML page the
  games are served in (`html/`)
- `packages/engine` - `@logic-incubator/engine`: the top-down tile engine - level format and
  loading, lighting and depth, player, monsters and combat; plus the build plugin that keeps a
  game's `assets-meta.json` in step with its sprites (`scripts/`)
- `packages/ui` - `@logic-incubator/ui`: a skinnable Pixi UI kit - widgets, keyboard / gamepad /
  pointer focus, and its own art, bitmap fonts and skin (the `ui` asset bundle, in `assets/ui/`); the
  engine's HUD is built from it
- `packages/editor` - `@logic-incubator/editor`: the level editor, and its own icons and font
  (the `editor` asset bundle, in `assets/editor/`)

Packages import each other by name (`@logic-incubator/lib/...`), mapped to their `src` folders in
`tsconfig.json`; lint rules stop an import going the wrong way, or reaching into another package
by a relative path.

Games check this repo out beside their own and compile it from source the same way:
in-dungeons-we-dwell (engine and editor) and cat-grab (lib only).

## Assets

A game's art, sound and data live in **bundles**: each folder under its `assets/` is one, and
`game.assets` (an `Assets`, one per `Game`) loads them - `global` once at boot, a level's when the
level starts, released when the next replaces it. A bundle's files are classified by type; the
sprite frames in `sprites/<sheet>/` are packed into an atlas at build time (no packer to install).

- **Ids** are `<bundle>.<file name without extension>` - `global.title`, `level1.hit_sound` - so
  two bundles can each have a `hit_sound`. The build writes them to the game's committed
  `src/generated/assets.d.ts`, which fills in lib's `AssetRegistry`: `game.assets.PlaySound(id)`,
  `.Texture(id)`, `.Data(id)` ... are then checked by the compiler. Sprite names in level files stay
  bare and resolve through the loaded bundles, the level's first (`AssetFactory.Resolve`).
- **Build** - `packages/lib/scripts/build-assets.js` (`--check`, `--production`, `--report`), and
  `AssetsWebpackPlugin` to run it inside webpack, from a game's `assets.config.json`. It validates as
  it goes (clashing ids, gaps in an animation, unknown files), warns about heavy ones, packs atlases
  deterministically, writes `manifest.json` with a content hash per bundle (the `?v=` cache-busting
  query) and the declarations. A `bundle.json` in a bundle sets `dependsOn`, `ignore`, atlas options and
  each asset's **tier**: `boot` (loads with the bundle), `background` (right after) or `lazy` (when asked
  for or played). Build plugins can hook in - `engine/scripts/asset-meta-plugin.js` is one.
- **Loading** - `Assets.Acquire(bundle)` / `LoadBundle` / `UseLevelBundle(...)` are ref-counted, report
  byte-weighted progress (`bundle:progress`, see `LoadingScreen`), retry failed files, and fail with
  every file that didn't load. An unloaded bundle's textures, fonts and sounds are freed a frame later,
  once nothing on screen can still be drawing them. `Game.destroy()` abandons loads in flight and takes
  its sounds and fonts out of pixi's process-wide tables.
- **Sound** is opt-in: `Init(url, { sound: new PixiSoundAdapter() })` - only that file imports pixi-sound.

`npm install` once, then `npm test` and `npm run lint` cover it here.
