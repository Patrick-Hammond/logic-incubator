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
export const AssetPath = "http://localhost:4000/dist-include/dungeon/";

export const GridBounds = new PIXI.Rectangle(20, 20, EditorWidth - 300, EditorHeight - 40);

export const enum Scenes {
    GAME = "game",
    EDITOR = "editor"
}
