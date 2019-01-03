import {PointLike} from "../../../_lib/math/Geometry";
import Store, {IAction} from "../../../_lib/Store";
import {AddTypes, SubtractTypes} from "../../../_lib/utils/EnumerateTypes";
import {InitalScale} from "../Constants";
import {Brush, Layer} from "./LevelDataStore";

export const enum EditorActions {
    BRUSH_MOVED, ROTATE_BRUSH, FLIP_BRUSH_H, FLIP_BRUSH_V,
    BRUSH_CHANGED, BRUSH_HOVERED, BRUSH_VISIBLE, BRUSH_NUDGE,
    DATA_BRUSH_INC, DATA_BRUSH_DEC,
    ZOOM_IN, ZOOM_OUT,
    MOUSE_BUTTON,
    KEY_DOWN, KEY_UP,
    VIEW_DRAG, VIEW_MOVE,
    ADD_LAYER, REMOVE_LAYER, RENAME_LAYER, SELECT_LAYER,
    MOVE_LAYER_UP, MOVE_LAYER_DOWN, TOGGLE_LAYER_VISIBILITY,
    REFRESH, RESET
};

export const enum MouseButtonState {
    LEFT_DOWN, RIGHT_DOWN, UP, MIDDLE_DOWN
}

export type DataBrush = {name: string, colour: number, value: number};

interface IActionData {
    mouseButtonState?: MouseButtonState;
    keyCode?: number;
    name?: string;
    position?: PointLike;
    rotation?: number;
    nudge?: PointLike;
    move?: PointLike;
    scale?: PointLike;
    persistZoom?: boolean;
    layer?: Layer,
    visible?: boolean
}

export interface IState {
    currentBrush: Brush;
    brushVisible: boolean,
    hoveredBrushName: string;
    dataBrushes: DataBrush[],
    layers: Layer[];
    mouseButtonState: MouseButtonState;
    keyCode: number;
    viewOffset: PointLike;
    viewScale: number;
}

export default class EditorStore extends Store<IState, IActionData> {
    protected DefaultState(): IState {
        return {
            currentBrush: {
                name: "",
                position: {x: 0, y: 0},
                pixelOffset: {x: 0, y: 0},
                rotation: 0,
                scale: {x: 1, y: 1},
                layerId: 0,
                data: null
            },
            brushVisible: false,
            hoveredBrushName: "",
            dataBrushes: [
                {name: "data-1", colour: 0xfe3464, value: null},
                {name: "data-2", colour: 0xffd166, value: null},
                {name: "data-3", colour: 0x06d6a0, value: null},
                {name: "data-4", colour: 0x118ab2, value: null},
                {name: "data-5", colour: 0xff8100, value: null}
            ],
            keyCode: null,
            layers: [],
            mouseButtonState: MouseButtonState.UP,
            viewOffset: {x: 0, y: 0},
            viewScale: InitalScale
        };
    }

    protected Reduce(state: IState, action: IAction<IActionData>): IState {
        const newState = {
            currentBrush: this.UpdateBrush(state.currentBrush, action),
            brushVisible: this.UpdateBrushVisible(state.brushVisible, action),
            hoveredBrushName: this.UpdateHoveredBrushName(state.hoveredBrushName, action),
            dataBrushes: this.UpdateDataBrushes(state.dataBrushes, action),
            keyCode: this.UpdateKeyDown(state.keyCode, action),
            layers: this.UpdateLayers(state.layers, action),
            mouseButtonState: this.UpdateMouseButton(state.mouseButtonState, action),
            viewOffset: this.UpdateViewOffset(state.viewOffset, action),
            viewScale: this.UpdateViewScale(state.viewScale, action)
        };
        return newState as IState;
    }

    private UpdateBrush(currentBrush: Brush, action: IAction<IActionData>): Brush {
        switch(action.type) {
            case EditorActions.BRUSH_MOVED: {
                return {
                    ...currentBrush,
                    position: action.data.position
                };
            }
            case EditorActions.BRUSH_CHANGED: {
                const dataBrush = this.state.dataBrushes.find(db => db.name === action.data.name);
                return {
                    ...this.DefaultState().currentBrush,
                    name: action.data.name,
                    layerId: action.data.layer.id,
                    data: dataBrush ? dataBrush.value : null
                };
            }
            case EditorActions.ROTATE_BRUSH: {
                return {
                    ...currentBrush,
                    rotation: currentBrush.rotation + Math.PI / 2
                };
            }
            case EditorActions.FLIP_BRUSH_H: {
                return {
                    ...currentBrush,
                    scale: {x: currentBrush.scale.x * -1, y: currentBrush.scale.y}
                };
            }
            case EditorActions.FLIP_BRUSH_V: {
                return {
                    ...currentBrush,
                    scale: {x: currentBrush.scale.x, y: currentBrush.scale.y * -1}
                };
            }
            case EditorActions.BRUSH_NUDGE: {
                return {
                    ...currentBrush,
                    pixelOffset: {
                        x: currentBrush.pixelOffset.x + action.data.nudge.x,
                        y: currentBrush.pixelOffset.y + action.data.nudge.y
                    }
                };
            }
            case EditorActions.SELECT_LAYER:
                return {
                    ...this.DefaultState().currentBrush,
                    layerId: action.data.layer.id
                };
            case EditorActions.RESET:
                return this.DefaultState().currentBrush;
            default:
                return currentBrush || this.DefaultState().currentBrush;
        }
    }

    private UpdateBrushVisible(visible: boolean, action: IAction<IActionData>): boolean {
        switch(action.type) {
            case EditorActions.BRUSH_VISIBLE:
                return action.data.visible;
            default:
                return visible != null ? visible : this.DefaultState().brushVisible;
        }
    }

    private UpdateDataBrushes(dataBrushes: DataBrush[], action: IAction<IActionData>): DataBrush[] {
        switch(action.type) {
            case EditorActions.DATA_BRUSH_INC:
            case EditorActions.DATA_BRUSH_DEC:
                const dataBrush = this.state.dataBrushes.find(db => db.name === this.state.currentBrush.name);
                const val = action.type === EditorActions.DATA_BRUSH_INC ? 1 : -1;
                if(dataBrush.value === null) {
                    dataBrush.value = 0;
                }
                dataBrush.value += val;
                if(dataBrush.value === -1) {
                    dataBrush.value = null;
                }
                return [
                    ...dataBrushes,
                    dataBrush
                ];
            default:
                return dataBrushes || this.DefaultState().dataBrushes;
        }
    }

    private UpdateHoveredBrushName(hoveredBrushName: string, action: IAction<IActionData>): string {
        switch(action.type) {
            case EditorActions.BRUSH_HOVERED:
                return action.data.name;
            default:
                return hoveredBrushName || this.DefaultState().hoveredBrushName;
        }
    }

    private UpdateKeyDown(keyCode: number, action: IAction<IActionData>): number {
        switch(action.type) {
            case EditorActions.KEY_DOWN:
                return action.data.keyCode;
            case EditorActions.KEY_UP:
                return null;
            default:
                return keyCode != null ? keyCode : this.DefaultState().keyCode;
        }
    }

    private UpdateLayers(layers: Layer[], action: IAction<IActionData>): Layer[] {
        switch(action.type) {
            case EditorActions.ADD_LAYER:
                return layers.concat(action.data.layer);
            case EditorActions.REMOVE_LAYER:
                return layers.filter(layer => layer.selected === false);
            case EditorActions.RENAME_LAYER: {
                const copy = layers.concat();
                copy.find(l => l.id === action.data.layer.id).name = action.data.name;
                return copy;
            }
            case EditorActions.SELECT_LAYER:
                return layers.map(layer => {
                    return {
                        ...layer,
                        selected: layer.id === action.data.layer.id
                    }
                });
            case EditorActions.TOGGLE_LAYER_VISIBILITY: {
                action.data.layer.visible = !action.data.layer.visible;
                return layers.concat();
            }
            case EditorActions.MOVE_LAYER_UP: {
                const copy = layers.concat();
                const selectedLayer = copy.find(layer => layer.selected);
                const index = copy.indexOf(selectedLayer);
                if(index > 0) {
                    const prevLayer = copy[index - 1];
                    copy[index - 1] = selectedLayer;
                    copy[index] = prevLayer;
                    return copy;
                }
                return layers;
            }
            case EditorActions.MOVE_LAYER_DOWN: {
                const copy = layers.concat();
                const selectedLayer = this.state.layers.find(layer => layer.selected);
                const index = copy.indexOf(selectedLayer);
                const len = layers.length;
                if(index < len - 1) {
                    const nextLayer = copy[index + 1];
                    copy[index + 1] = selectedLayer;
                    copy[index] = nextLayer;
                    return copy;
                }
                return layers;
            }
            case EditorActions.RESET:
                return this.DefaultState().layers;
            default:
                return layers || this.DefaultState().layers;
        }
    }

    private UpdateMouseButton(mouseButtonDown: MouseButtonState, action: IAction<IActionData>): MouseButtonState {
        switch(action.type) {
            case EditorActions.MOUSE_BUTTON:
                return action.data.mouseButtonState;
            default:
                return mouseButtonDown != null ? mouseButtonDown : this.DefaultState().mouseButtonState;
        }
    }

    private UpdateViewOffset(offset: PointLike, action: IAction<IActionData>): PointLike {
        switch(action.type) {
            case EditorActions.VIEW_DRAG:
                const delta = SubtractTypes(this.state.currentBrush.position, action.data.position);
                return SubtractTypes(offset, delta);
            case EditorActions.VIEW_MOVE:
                return AddTypes(offset, action.data.move);
            case EditorActions.RESET:
                return this.DefaultState().viewOffset;
            default:
                return offset ? offset : this.DefaultState().viewOffset;
        }
    }

    private UpdateViewScale(scale: number, action: IAction<IActionData>): number {
        switch(action.type) {
            case EditorActions.ZOOM_IN:
                return scale * 1.1;
            case EditorActions.ZOOM_OUT:
                return scale * 0.909;
            case EditorActions.RESET:
                if(!action.data.persistZoom) {
                    return this.DefaultState().viewScale;
                }
            default:
                return scale ? scale : this.DefaultState().viewScale;
        }
    }
}
