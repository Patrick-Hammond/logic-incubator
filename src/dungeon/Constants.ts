// Deep import from @pixi/math (not "pixi.js") so this module - and everything
// that imports it, e.g. TileCollision - stays free of pixi.js's renderer code,
// which touches `window`/`<canvas>` at import time and cannot load under a
// plain Node test runner. Same Rectangle class; pixi.js just re-exports it.
import {Rectangle} from "@pixi/math";

// tslint:disable
export const EditorWidth = 1280;
export const EditorHeight = 720;
export const GameWidth = 1280;
export const GameHeight = 720;
export const InitalScale = 1.5;
export const TileSize = 16;
export const AnimationSpeed = 0.2;
export const PlayerSpeed = 0.8;
export const DepthBrushName = "data-3";
export const AssetPath = "/assets/dungeon/";

export const GridBounds = new Rectangle(20, 20, EditorWidth - 300, EditorHeight - 40);

export const enum Scenes {
    GAME = "game",
    EDITOR = "editor"
}
