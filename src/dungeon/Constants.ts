// Deep import from @pixi/math (not "pixi.js") so this module - and everything
// that imports it, e.g. TileCollision - stays free of pixi.js's renderer code,
// which touches `window`/`<canvas>` at import time and cannot load under a
// plain Node test runner. Same Rectangle class; pixi.js just re-exports it.
import {Rectangle} from "@pixi/math";
// Type-only: EditorStore imports this module too, and a runtime import back into it is a cycle that
// leaves `DataBrushName` undefined here whenever EditorStore happens to be loaded first (e.g. by a
// test importing it directly). The value below is checked against the enum at compile time instead.
import type { DataBrushName } from "./editor/stores/EditorStore";

// tslint:disable
export const EditorWidth = 1280;
export const EditorHeight = 720;
export const GameWidth = 1280;
export const GameHeight = 720;
export const InitalScale = 1.5;
export const TileSize = 16;
export const AnimationSpeed = 0.2;
export const PlayerSpeed = 0.8;
export const DepthBrushName: `${DataBrushName.Z_INDEX}` = "z-index";
// Where the game serves its assets, relative to the page: its packed frames.json and assets-meta.json, plus the
// editor's own icons and font (editor/assets, which the game's build copies in beside them).
export const AssetPath = "assets/";
// frames.json keys have no extension. Only a trailing "_f<N>" marks an animation frame - names that merely
// contain "_f" ("wall_fountain_top_1", "doors_frame_left", "heart_full", "wall_outer_front_left") are sprites.
// src/_lib/scripts/create-metadata.js duplicates this rule; AnimFrameRegex.test.ts keeps them in step.
export const AnimFrameRegex = /^.+(?=_f\d+$)/;

/** The editor's right-hand column of panels (brushes, selected brush, layers). */
export const SidebarWidth = 260;
/** The editor's tool strip, right of the sidebar at the canvas's right edge. */
export const ToolbarWidth = 40;

/** 20px margin left/top/bottom; right of it a 10px gap, the sidebar, a 10px gap, the toolbar and a 10px margin. */
export const GridBounds = new Rectangle(20, 20, EditorWidth - 20 - (10 + SidebarWidth + 10 + ToolbarWidth + 10), EditorHeight - 40);

/** The engine's own scenes. A game adds its own (title, menus...) alongside them, under names of its choosing. */
export const enum Scenes {
    GAME = "game",
    EDITOR = "editor"
}
