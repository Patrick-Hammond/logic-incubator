import Store, {IAction} from "../../../../_lib/Store";
import {InitalScale} from "../Constants";
import {Point, Brush} from "../Types";
import {SubtractPoints, AddPoints} from "../../../../_lib/utils/GeometryUtils";

export const enum EditorActions {
    BRUSH_MOVED, BRUSH_MOUSE_DOWN, ROTATE_BRUSH,
    BRUSH_CHANGED, BRUSH_HOVERED,
    NUDGE,
    ZOOM_IN, ZOOM_OUT,
    SPACE_KEY_DOWN, SPACE_KEY_UP, SPACE_DRAG,
    REFRESH, RESET
};

export const enum MouseButtonState {
    LEFT_DOWN, RIGHT_DOWN, UP
}

type ActionData = {
    mouseButtonState?: MouseButtonState,
    name?: string,
    position?: Point,
    rotation?: number,
    nudge?: Point,
    move?: Point,
    persistZoom?: boolean
};

export interface IState {
    mouseButtonState: MouseButtonState;
    viewOffset: Point;
    spaceKeyDown: boolean,
    currentBrush: Brush;
    hoveredBrushName: string,
    scale: number;
}

export default class EditorStore extends Store<IState, ActionData>
{
    protected DefaultState(): IState {
        return {
            mouseButtonState: MouseButtonState.UP,
            viewOffset: {x: 0, y: 0},
            spaceKeyDown: false,
            currentBrush: {name: "", position: {x: 0, y: 0}, pixelOffset: {x: 0, y: 0}, rotation: 0},
            hoveredBrushName: "",
            scale: InitalScale
        };
    }

    protected Reduce(state: IState, action: IAction<ActionData>): IState {
        let newState = {
            viewOffset: this.UpdateViewOffset(state.viewOffset, action),
            mouseButtonState: this.UpdateMouseButton(state.mouseButtonState, action),
            spaceKeyDown: this.UpdateSpaceKeyDown(state.spaceKeyDown, action),
            currentBrush: this.UpdateBrush(state.currentBrush, action),
            hoveredBrushName: this.UpdateHoveredBrushName(state.hoveredBrushName, action),
            scale: this.UpdateScale(state.scale, action)
        };
        return newState as IState;
    }

    private UpdateMouseButton(mouseButtonDown: MouseButtonState, action: IAction<ActionData>): MouseButtonState {
        switch(action.type) {
            case EditorActions.BRUSH_MOUSE_DOWN:
                return action.data.mouseButtonState;
            default:
                return mouseButtonDown != null ? mouseButtonDown : this.DefaultState().mouseButtonState;
        }
    }

    private UpdateSpaceKeyDown(spaceKeyDown: boolean, action: IAction<ActionData>): boolean {
        switch(action.type) {
            case EditorActions.SPACE_KEY_DOWN:
                return true;
            case EditorActions.SPACE_KEY_UP:
                return false;
            default:
                return spaceKeyDown != null ? spaceKeyDown : this.DefaultState().spaceKeyDown;
        }
    }

    private UpdateBrush(currentBrush: Brush, action: IAction<ActionData>): Brush {
        switch(action.type) {
            case EditorActions.BRUSH_MOVED:
                {
                    return {
                        ...currentBrush,
                        position: action.data.position
                    };
                }
            case EditorActions.BRUSH_CHANGED:
                {
                    return {
                        ...currentBrush,
                        rotation: 0,
                        pixelOffset: {x: 0, y: 0},
                        name: action.data.name
                    };
                }
            case EditorActions.ROTATE_BRUSH:
                {
                    return {
                        ...currentBrush,
                        rotation: currentBrush.rotation + Math.PI / 2
                    };
                }
            case EditorActions.NUDGE:
                {
                    return {
                        ...currentBrush,
                        pixelOffset: {x: currentBrush.pixelOffset.x + action.data.nudge.x, y: currentBrush.pixelOffset.y + action.data.nudge.y}
                    };
                }
            case EditorActions.RESET:
                return this.DefaultState().currentBrush;
            default:
                return currentBrush || this.DefaultState().currentBrush;
        }
    }

    private UpdateHoveredBrushName(hoveredBrushName: string, action: IAction<ActionData>): string {
        switch(action.type) {
            case EditorActions.BRUSH_HOVERED:
                return action.data.name;
            default:
                return hoveredBrushName || this.DefaultState().hoveredBrushName;
        }
    }

    private UpdateScale(scale: number, action: IAction<ActionData>): number {
        switch(action.type) {
            case EditorActions.ZOOM_IN:
                return scale + 0.25;
            case EditorActions.ZOOM_OUT:
                return scale - 0.25;
            case EditorActions.RESET:
                if(!action.data.persistZoom) {
                    return this.DefaultState().scale;
                }
            default:
                return scale ? scale : this.DefaultState().scale;
        }
    }

    private UpdateViewOffset(offset: Point, action: IAction<ActionData>): Point {
        switch(action.type) {
            case EditorActions.SPACE_DRAG:
                return SubtractPoints(offset, SubtractPoints(this.state.currentBrush.position, action.data.move));
            case EditorActions.RESET:
                return this.DefaultState().viewOffset;
            default:
                return offset ? offset : this.DefaultState().viewOffset;
        }
    }
}