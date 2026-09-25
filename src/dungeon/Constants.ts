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
export const AssetPath = "/dungeon/assets/";

export const GridBounds = new Rectangle(20, 20, EditorWidth - 300, EditorHeight - 40);

export const enum Scenes {
    GAME = "game",
    EDITOR = "editor",
    TITLE = "title",
    CHARACTER_SELECT = "character-select"
}
