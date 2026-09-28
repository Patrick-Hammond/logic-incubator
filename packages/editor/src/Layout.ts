// Deep import from @pixi/math (not "pixi.js") so this module - and everything
// that imports it, e.g. EditorStore - stays free of pixi.js's renderer code,
// which touches `window`/`<canvas>` at import time and cannot load under a
// plain Node test runner. Same Rectangle class; pixi.js just re-exports it.
import {Rectangle} from "@pixi/math";

// tslint:disable
export const EditorWidth = 1280;
export const EditorHeight = 720;
/** The map grid's zoom when the editor starts (and after a reset). */
export const InitalScale = 1.5;

/** The editor's right-hand column of panels (brushes, selected brush, layers). */
export const SidebarWidth = 260;
/** The editor's tool strip, right of the sidebar at the canvas's right edge. */
export const ToolbarWidth = 40;

/** 20px margin left/top/bottom; right of it a 10px gap, the sidebar, a 10px gap, the toolbar and a 10px margin. */
export const GridBounds = new Rectangle(20, 20, EditorWidth - 20 - (10 + SidebarWidth + 10 + ToolbarWidth + 10), EditorHeight - 40);
