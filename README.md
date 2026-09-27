### LOGIC INCUBATOR

code microbes.. microdes

The shared code the games build on - there's nothing to run here:

- `src/_lib` - game framework, loading, input, tweening, tilemap, filters
- `src/dungeon` - the dungeon engine and level editor

Games check this repo out beside their own and compile it from source as
`@logic-incubator/...`: in-dungeons-we-dwell (the dungeon engine and editor)
and catgrab (`_lib` only).

`npm test` and `npm run lint` cover it here.
