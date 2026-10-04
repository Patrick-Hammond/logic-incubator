# logic-incubator documentation

logic-incubator is the shared code that small browser games are built on: a game framework (`lib`), a top-down dungeon
engine (`engine`) and a level editor (`editor`). Games check this repository out beside their own and compile it from source.

| Document | Read it when |
| --- | --- |
| [User guide](user-guide.md) | You are building (or maintaining) a game on logic-incubator. It explains the concepts, walks through a first game, and covers scenes and components, the asset system, input, tweening, the dungeon engine, the level editor and testing - with working code. |
| [API reference](api-reference.md) | You need an exact signature, option, event or file format: every public class, function and type in the three packages, plus the asset build tool's command line, configuration files and plugin interface. |

## Where to start

- **New to the workspace**: [User guide, chapters 1-3](user-guide.md#1-what-logic-incubator-is) - what it is, setting up, a complete first game.
- **Loading art, sound and data**: [User guide, chapter 5](user-guide.md#5-assets) - bundles, typed ids, the build, loading and unloading.
- **Writing a scene**: [User guide, chapter 4](user-guide.md#4-games-scenes-and-components) - the component lifecycle.
- **Making a dungeon game**: [chapters 9 and 10](user-guide.md#9-the-dungeon-engine) - monsters, levels, `assets-meta.json`, the editor.
- **Something is broken**: [Troubleshooting](user-guide.md#13-troubleshooting) and the [asset diagnostics table](user-guide.md#513-diagnostics).

## The example games

Two games in sibling repositories show every pattern in working form:

- **cat-grab** - `lib` only: scenes, a loading screen, one asset bundle with a pre-packed sprite sheet and a bitmap font.
- **in-dungeons-we-dwell** - `lib` + `engine` + `editor`: per-level bundles, sound, typed data files, a title/character-select front end, and the
  level editor wired in for development builds only.

## Conventions used in these documents

- `@logic-incubator/lib/...`, `@logic-incubator/engine/...` and `@logic-incubator/editor/...` are import paths, mapped to each package's `src/` folder by the
  game's `tsconfig.json` and webpack config.
- Method names are PascalCase (`LoadBundle`, `Tick`), matching the code base.
- "Asset id" always means the qualified `<bundle>.<name>` form (`global.title`); "bare name" means the unqualified sprite name used in level files and metadata (`wall_top`).
- Commands are shown for the game repository unless stated otherwise; the asset build scripts live in `logic-incubator/packages/lib/scripts` and are invoked from the game by relative path.
