// `export {}` is what makes this file a module, so the block below augments lib's registry instead of replacing it (without it, `AssetIds` would be shadowed
// and every id type lost).
export {};

/** A skin as the JSON file has it: the shape of `Skin`, with colours as "#rrggbb" strings. */
type SkinFile = Record<string, unknown>;

// What `game.assets.Data("ui.skin")` returns: the kit's skin file (assets/ui/data/skin.json) as parsed JSON, which `LoadSkin` turns into a `Skin`
// (colours are written "#rrggbb" there).
declare module "@logic-incubator/lib/assets/AssetIds" {
    interface DataTypeRegistry {
        "ui.skin": SkinFile;
        "ui.frames": Record<string, unknown>;
    }
}
