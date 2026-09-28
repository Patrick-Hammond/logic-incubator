### LOGIC INCUBATOR

code microbes.. microdes

The shared code the games build on - there's nothing to run here. An npm workspace of three
packages, whose dependencies only point down (editor -> engine -> lib):

- `packages/lib` - `@logic-incubator/lib`: game framework, loading, input, tweening, tilemap
  rendering, filters; plus the HTML page the games are served in (`html/`)
- `packages/engine` - `@logic-incubator/engine`: the top-down tile engine - level format and
  loading, lighting and depth, player, monsters and combat; plus the sprite-sheet scripts
  (`scripts/`)
- `packages/editor` - `@logic-incubator/editor`: the level editor, and its own icons and font
  (`assets/`)

Packages import each other by name (`@logic-incubator/lib/...`), mapped to their `src` folders in
`tsconfig.json`; lint rules stop an import going the wrong way, or reaching into another package
by a relative path.

Games check this repo out beside their own and compile it from source the same way:
in-dungeons-we-dwell (engine and editor) and catgrab (lib only).

`npm install` once, then `npm test` and `npm run lint` cover it here.
