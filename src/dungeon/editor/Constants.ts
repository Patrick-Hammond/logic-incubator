// tslint:disable
export const EditorWidth = 1280;
export const EditorHeight = 720;
export const InitalScale = 1.5;
export const TileSize = 16;
export const AnimationSpeed = 0.2;
export const AssetPath = "http://localhost:4000/dist-include/";

export const GridBounds = new PIXI.Rectangle(20, 20, EditorWidth - 300, EditorHeight - 40);

export const enum KeyCodes {
    CTRL = 17, SPACE = 32, R = 82, Z = 90, PLUS = 107, MINUS = 109, S = 83, L = 76, Q = 81, H = 72, V = 86,
    LEFT = 37, UP = 38, RIGHT = 39, DOWN = 40,
    ONE = 49, TWO = 50, THREE = 51, FOUR = 52, FIVE = 53, SIX = 54, SEVEN = 55, EIGHT = 56, NINE = 57
}
