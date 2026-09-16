# patches

No patches are currently applied. `patch-package` stays wired up (`postinstall` in `package.json`) as generic infrastructure for the next time a third-party dependency needs a targeted fix - it's a no-op with zero `.patch` files present.

## pixi-tilemap

The `pixi-tilemap` bug fixes that used to live here as a `patch-package` diff against the compiled `dist/pixi-tilemap.js` were superseded when the library was vendored in as readable source instead of a patched npm dependency - see [`src/_lib/tilemap/README.md`](../src/_lib/tilemap/README.md) for why, and for where each of those fixes (plus more, found while vendoring and while building the tile-lighting feature) now lives directly in the source.
