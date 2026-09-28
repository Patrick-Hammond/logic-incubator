// tslint:disable
export const GameWidth = 1280;
export const GameHeight = 720;
export const TileSize = 16;
export const AnimationSpeed = 0.2;
export const PlayerSpeed = 0.8;
// Where the game serves its assets, relative to the page: its packed frames.json and assets-meta.json, plus the
// editor's own icons and font (the editor package's assets folder, which a dev build copies in beside them).
export const AssetPath = "assets/";
// frames.json keys have no extension. Only a trailing "_f<N>" marks an animation frame - names that merely
// contain "_f" ("wall_fountain_top_1", "doors_frame_left", "heart_full", "wall_outer_front_left") are sprites.
// scripts/create-metadata.js duplicates this rule; AnimFrameRegex.test.ts keeps them in step.
export const AnimFrameRegex = /^.+(?=_f\d+$)/;

/** The engine's own scenes. A game adds its own (title, menus...) alongside them, under names of its choosing. */
export const enum Scenes {
    GAME = "game",
    EDITOR = "editor"
}
