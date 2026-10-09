/**
 * How the palette sorts a game's sprites into its tabs. Pure - no pixi, no DOM - so it runs under the
 * plain node test runner. The category of each sprite comes from the game's assets-meta.json (see
 * `AssetCategories`); the palette passes in how to look one up.
 */

import { AssetCategories, AssetCategory } from "@logic-incubator/engine/level/AssetMetadata";
import { TileLayerKind } from "@logic-incubator/engine/level/LevelFormat";

/** A palette tab of tile brushes: one category, its sprites in name order. */
export type TileSet = { id: AssetCategory; name: string; brushes: string[] };

/**
 * One tile set per category, in the palette's order - including empty ones, so a tab is always where
 * it was last time. Within a tab the names are sorted, which also puts an animation next to the
 * sprites it belongs with (`wall_fountain_mid_red_anim` among the other `wall_...` tiles).
 */
export function GroupByCategory(names: ReadonlyArray<string>, categoryOf: (name: string) => AssetCategory): TileSet[] {
    const sets: TileSet[] = AssetCategories.map(category => ({ id: category.id, name: category.name, brushes: [] }));
    names.forEach(name => {
        const set = sets.find(candidate => candidate.id === categoryOf(name));
        // categoryOf returns a valid category; a stray one is listed under the last-resort tab rather than dropped.
        (set || sets.find(candidate => candidate.id === "misc")).brushes.push(name);
    });
    sets.forEach(set => set.brushes.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    return sets;
}

/**
 * What an empty tab says - the User tab, which starts empty, says how to fill it. `canCreate`: the tab ends in a "+" that draws a new sprite
 * in the sprite editor.
 */
export function EmptyTabHint(id: AssetCategory, canCreate = false): string {
    if (id === "user") {
        return canCreate
            ? 'Nothing here yet. Click + to draw a tile, or give a sprite "category": "user" in assets-meta.json and it is listed here.'
            : 'Nothing here yet. Give a sprite "category": "user" in assets-meta.json and it is listed here.';
    }
    return canCreate ? "No sprites in this category. Click + to draw one." : "No sprites in this category.";
}

/**
 * Whether the palette shows `category`'s tab while a tile layer of `kind` is selected: a floor or walls
 * layer shows only its own tab (the kinds are named after their categories), any other tile layer every
 * tab but those two.
 */
export function ShowsCategory(kind: TileLayerKind | undefined, category: AssetCategory): boolean {
    return kind ? category === kind : category !== "floor" && category !== "walls";
}

/**
 * Whether a tile of `category` can be painted onto a tile layer of `kind`: a floor or walls layer takes
 * only its own category. A layer without a kind takes anything - its palette doesn't offer floor or wall
 * tiles, but a level from before layers had kinds has them on such layers, and the dropper picks them up.
 */
export function TakesCategory(kind: TileLayerKind | undefined, category: AssetCategory): boolean {
    return !kind || category === kind;
}
