/**
 * How the palette sorts a game's sprites into its tabs. Pure - no pixi, no DOM - so it runs under the
 * plain node test runner. The category of each sprite comes from the game's assets-meta.json (see
 * `AssetCategories`); the palette passes in how to look one up.
 */

import { AssetCategories, AssetCategory } from "@logic-incubator/engine/level/AssetMetadata";

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

/** What an empty tab says - the User tab, which starts empty, says how to fill it. */
export function EmptyTabHint(id: AssetCategory): string {
    return id === "user"
        ? 'Nothing here yet. Give a sprite "category": "user" in assets-meta.json and it is listed here.'
        : "No sprites in this category.";
}
