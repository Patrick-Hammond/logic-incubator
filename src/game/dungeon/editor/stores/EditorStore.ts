import Store, { IAction } from "../../../../_lib/Store";
import Game from "../../../../_lib/Game";
import { TileSize } from "../Constants";
import { Point, Brush } from "../Types";

export const enum EditorActions {
    BRUSH_MOVED, BRUSH_MOUSE_DOWN, ROTATE_BRUSH,
    NEXT_PALETTE, PALETTE_ITEM_CHANGED,
    ZOOM_IN, ZOOM_OUT,
    REFRESH
};

export const enum MouseButtonState {
    LEFT_DOWN, RIGHT_DOWN, UP
}

type ActionData = { mouseButtonState?: MouseButtonState, name?: string, position?: Point, rotation?: number, layer?: number };

export interface IState {
    mouseButtonState: MouseButtonState;
    currentBrush: Brush;
    paletteIndex: number;
    scale: number;
    gridBounds: PIXI.Rectangle;
    scaledTileSize: number;
}

interface ILayoutState {
    scale: number;
    gridBounds: PIXI.Rectangle;
    scaledTileSize: number;
}

export default class EditorStore extends Store<IState, ActionData>
{
    protected DefaultState(): IState {
        return {
            mouseButtonState: MouseButtonState.UP,
            currentBrush: { name: "", position: { x: 0, y: 0 }, rotation: 0, layer: 0 },
            paletteIndex: 0,
            scale: 1,
            gridBounds: new PIXI.Rectangle(),
            scaledTileSize: 16
        };
    }

    protected Reduce(state: IState, action: IAction<ActionData>): IState {
        let newState = {
            mouseButtonState: this.UpdateMouseButton(state.mouseButtonState, action),
            paletteIndex: this.UpdatePaletteIndex(state.paletteIndex, action),
            currentBrush: this.UpdateBrush(state.currentBrush, action),
            ...this.UpdateLayout(state, action)
        };
        return newState as IState;
    }

    private UpdateMouseButton(mouseButtonDown: MouseButtonState, action: IAction<ActionData>): MouseButtonState {
        switch (action.type) {
            case EditorActions.BRUSH_MOUSE_DOWN:
                return action.data.mouseButtonState;
            default:
                return mouseButtonDown != null ? mouseButtonDown : this.DefaultState().mouseButtonState;
        }
    }

    private UpdatePaletteIndex(paletteIndex: number, action: IAction<ActionData>): number {
        switch (action.type) {
            case EditorActions.NEXT_PALETTE:
                return (paletteIndex + 1) % 3;
            default:
                return paletteIndex || this.DefaultState().paletteIndex;
        }
    }

    private UpdateBrush(currentBrush: Brush, action: IAction<ActionData>): Brush {
        switch (action.type) {
            case EditorActions.BRUSH_MOVED:
                {
                    return {
                        ...currentBrush,
                        position: action.data.position
                    };
                }
            case EditorActions.NEXT_PALETTE:
                {
                    return this.DefaultState().currentBrush;
                }
            case EditorActions.PALETTE_ITEM_CHANGED:
                {
                    return {
                        ...currentBrush,
                        name: action.data.name,
                        layer: action.data.layer
                    };
                }
            case EditorActions.ROTATE_BRUSH:
                {
                    return {
                        ...currentBrush,
                        rotation: currentBrush.rotation + Math.PI / 2
                    };
                }
            default:
                return currentBrush || this.DefaultState().currentBrush;
        }
    }

    private UpdateLayout(state: ILayoutState, action: IAction<{}>): ILayoutState {

        const calc = (scale: number): ILayoutState => {
            let scaledTileSize = TileSize * scale;
            let screen = Game.inst.screen;
            let w = (screen.width * 0.8) - scaledTileSize;
            let h = (screen.height * 0.9) - scaledTileSize;
            let gridBounds = new PIXI.Rectangle(scaledTileSize, scaledTileSize, w - w % scaledTileSize, h - h % scaledTileSize);
            return {
                scale: scale,
                gridBounds: gridBounds,
                scaledTileSize: scaledTileSize
            };
        }

        switch (action.type) {
            case EditorActions.ZOOM_IN:
                return calc(state.scale + 0.25);
            case EditorActions.ZOOM_OUT:
                return calc(state.scale - 0.25);
            default:
                return state.scale ? calc(state.scale) : calc(this.DefaultState().scale);
        }
    }
}