/**
 * Typed asset ids. The ids themselves are generated per game by `scripts/build-assets.js` into the
 * game's `assets.d.ts`, which augments the empty registries below - so lib stays game-agnostic and
 * `game.assets.PlaySound("level1.hit_sound")` is checked in the game that has such a sound. Until a
 * game generates its declarations (or in a game with no assets), every id type is just `string`.
 *
 * Ids are `<bundle>.<name>`: the bundle is the folder the asset lives under, the name is its file
 * name without extension. That qualification is what keeps `level1.hit_sound` and `level2.hit_sound`
 * apart.
 *
 * Keys of `AssetRegistry` are flat (`"global.title": "image"`) rather than one object per kind:
 * a property declared in two augmentations (the game's and the editor's) must have identical
 * types, while separate flat keys merge additively.
 */

/** Augmented by the game's generated declarations: asset id -> its kind. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AssetRegistry {}

/** Augmented by the game's generated declarations: every bundle name. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface BundleRegistry {}

/** Optional, written by hand in a game: data asset id -> the type `game.assets.Data(id)` returns. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface DataTypeRegistry {}

export type AssetKind = "sprite" | "animation" | "image" | "sound" | "data" | "binary" | "font";

type Ids = keyof AssetRegistry & string;
/** The ids of one kind - `string` while no declarations have been generated. */
type OfKind<K extends AssetKind> = [Ids] extends [never] ? string : { [I in Ids]: AssetRegistry[I] extends K ? I : never }[Ids];

export type AssetId = [Ids] extends [never] ? string : Ids;
export type SpriteId = OfKind<"sprite">;
export type AnimationId = OfKind<"animation">;
export type ImageId = OfKind<"image">;
export type SoundId = OfKind<"sound">;
export type DataId = OfKind<"data">;
export type BinaryId = OfKind<"binary">;
export type FontId = OfKind<"font">;
/** Anything `AssetFactory` can draw: a sprite or an animation. */
export type DrawableId = SpriteId | AnimationId;
export type BundleId = [keyof BundleRegistry & string] extends [never] ? string : keyof BundleRegistry & string;
/** The bundle part of a qualified id: `BundleOf<"level1.hit_sound">` is `"level1"`. */
export type BundleOf<I extends string> = I extends `${infer B}.${string}` ? B : never;
/** What `game.assets.Data(id)` returns: the game's declared type for it, else `unknown`. */
export type DataOf<I extends string> = I extends keyof DataTypeRegistry ? DataTypeRegistry[I] : unknown;
