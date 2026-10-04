// tslint:disable
export const GameWidth = 1280;
export const GameHeight = 720;
/** Width reserved on the right of the canvas for the HUD (health, gold, weapon, inventory) - see `Hud`. */
export const HudWidth = 320;
/** The playable viewport's width - `Camera` uses this instead of `GameWidth` so gameplay never renders under the HUD. */
export const PlayWidth = GameWidth - HudWidth;
export const TileSize = 16;
export const AnimationSpeed = 0.2;
export const PlayerSpeed = 0.8;
/** The engine's own scenes. A game adds its own (title, menus...) alongside them, under names of its choosing. */
export const enum Scenes {
    GAME = "game",
    EDITOR = "editor"
}
