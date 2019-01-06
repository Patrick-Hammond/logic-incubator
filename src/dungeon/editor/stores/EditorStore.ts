import {PointLike} from "../../../_lib/math/Geometry";
import {AddTypes, SubtractTypes} from "../../../_lib/patterns/EnumerateTypes";
import Store, {IAction} from "../../../_lib/patterns/redux/Store";
import {InitalScale} from "../../Constants";
import {Brush, Layer} from "./LevelDataStore";

export const enum EditorActions {
    BRUSH_MOVED, ROTATE_BRUSH, FLIP_BRUSH_H, FLIP_BRUSH_V,
    BRUSH_CHANGED, BRUSH_HOVERED, BRUSH_VISIBLE, BRUSH_NUDGE,
    DATA_BRUSH_INC, DATA_BRUSH_DEC,
    ZOOM_IN, ZOOM_OUT,
    MOUSE_BUTTON,
    KEY_DOWN, KEY_UP,
    VIEW_DRAG, VIEW_MOVE,
    ADD_LAYER, REMOVE_LAYER, RENAME_LAYER, SELECT_LAYER, DUPLICATE_LAYER,
    ADD_DATA_LAYER, MOVE_LAYER_UP, MOVE_LAYER_DOWN, TOGGLE_LAYER_VISIBILITY,
    CHANGE_SCENE,
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
    mouseDownPosition: PointLike,
    keyCode: number;
    viewOffset: PointLike;
    viewScale: number;
    currentScene: string;
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
                {name: "data-1", colour: 0xfe3464, value: 0},
                {name: "data-2", colour: 0xffd166, value: 0},
                {name: "data-3", colour: 0x06d6a0, value: 0},
                {name: "data-4", colour: 0x118ab2, value: 0},
                {name: "data-5", colour: 0xff8100, value: 0}
            ],
            keyCode: null,
            layers: [],
            mouseButtonState: MouseButtonState.UP,
            mouseDownPosition: null,
            viewOffset: {x: 0, y: 0},
            viewScale: InitalScale,
            currentScene: null
        };
    }

    protected Reduce(state: IState, action: IAction<IActionData>): IState {
        const newState = {
            dataBrushes: this.UpdateDataBrushes(state.dataBrushes, action),
            currentBrush: this.UpdateBrush(state.currentBrush, action),
            brushVisible: this.UpdateBrushVisible(state.brushVisible, action),
            hoveredBrushName: this.UpdateHoveredBrushName(state.hoveredBrushName, action),
            keyCode: this.UpdateKeyDown(state.keyCode, action),
            layers: this.UpdateLayers(state.layers, action),
            mouseButtonState: this.UpdateMouseButton(state.mouseButtonState, action),
            mouseDownPosition: this.UpdateMouseDownPosition(state.mouseDownPosition, action),
            viewOffset: this.UpdateViewOffset(state.viewOffset, action),
            viewScale: this.UpdateViewScale(state.viewScale, action),
            currentScene: this.UpdateCurrentScene(state.currentScene, action)
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
            case EditorActions.DATA_BRUSH_INC:
            case EditorActions.DATA_BRUSH_DEC: {
                const dataBrush = this.SelectedDataBrush;
                return {
                    ...currentBrush,
                    data: dataBrush ? this.CalcDataBrushValue(dataBrush.value, action.type) : null
                };
            }
            case EditorActions.BRUSH_CHANGED: {
                const dataBrush = this.state.dataBrushes.find(db => db.name === action.data.name);
                return {
                    ...this.DefaultState().currentBrush,
                    name: action.data.name,
                    layerId: this.SelectedLayer.id,
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
                const dataBrush = this.SelectedDataBrush;
                if(dataBrush) {
                    const val = this.CalcDataBrushValue(dataBrush.value, action.type);
                    return dataBrushes.map(db => {
                        if(db === dataBrush) {
                            return {...db, value: val};
                        }
                        return db;
                    });
                }
                return dataBrushes;
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

    private UpdateMouseDownPosition(mouseDownPosition: PointLike, action: IAction<IActionData>): PointLike {
        switch(action.type) {
            case EditorActions.MOUSE_BUTTON:
                if(action.data.mouseButtonState === MouseButtonState.LEFT_DOWN) {
                    return this.state.currentBrush.position;
                }
            default:
                return mouseDownPosition || this.DefaultState().mouseDownPosition;
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
            case EditorActions.ADD_LAYER: {
                const nextId = this.NextLayerId();
                const layer = {id: nextId, name: "layer " + nextId, selected: layers.length === 0, visible: true, isData: false}
                return layers.concat(layer);
            }
            case EditorActions.ADD_DATA_LAYER: {
                const nextId = this.NextDataLayerId();
                const layer = {id: 1000 + nextId, name: "data layer " + nextId, selected: false, visible: true, isData: true}
                return layers.concat(layer);
            }
            case EditorActions.REMOVE_LAYER:
                return layers.filter(layer => layer.selected === false);
            case EditorActions.RENAME_LAYER: {
                const selectedLayer = this.SelectedLayer;
                const name = prompt("Rename layer", selectedLayer.name);
                if(name) {
                    return layers.map(layer => {
                        if(layer.id === selectedLayer.id) {
                            return {...layer, name};
                        }
                        return layer;
                    });
                }
            }
            case EditorActions.SELECT_LAYER:
                return layers.map(layer => {
                    return {
                        ...layer,
                        selected: layer.id === action.data.layer.id
                    }
                });
            case EditorActions.TOGGLE_LAYER_VISIBILITY: {
                return layers.map(layer => {
                    if(layer.id === action.data.layer.id) {
                        return {...layer, visible: !layer.visible};
                    }
                    return layer;
                });
            }
            case EditorActions.MOVE_LAYER_UP: {
                const copy = layers.concat();
                const selectedLayer = this.SelectedLayer;
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
                const selectedLayer = this.SelectedLayer;
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
            case EditorActions.DUPLICATE_LAYER: {
                const selectedLayer = this.SelectedLayer;
                const nextId = selectedLayer.isData ? this.NextDataLayerId() : this.NextLayerId();
                const newLayer = {...selectedLayer, id: nextId, selected: false};
                return layers.concat(newLayer);
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

    private UpdateCurrentScene(currentScene: string, action: IAction<IActionData>): string {
        switch(action.type) {
            case EditorActions.CHANGE_SCENE:
                return action.data.name;
            default:
                return currentScene || this.DefaultState().currentScene;
        }
    }

    // helpers

    private CalcDataBrushValue(value: number, actionType: EditorActions): number {
        const inc = actionType === EditorActions.DATA_BRUSH_INC ? 1 : -1;
        return Math.max(Math.min(value + inc, 999), -999);
    }

    private NextLayerId(): number {
        const spriteLayers = this.state.layers.filter(layer => layer.isData === false);
        const nextId = spriteLayers.length ? spriteLayers.reduce((prev, curr) => curr.id > prev.id ? curr : prev).id + 1 : 0;
        return nextId;
    }

    private NextDataLayerId(): number {
        const dataLayers = this.state.layers.filter(layer => layer.isData);
        const nextId = dataLayers.length ? dataLayers.reduce((prev, curr) => curr.id > prev.id ? curr : prev).id - 999 : 0;
        return nextId;
    }

    public get SelectedDataBrush(): DataBrush {
        return this.state.dataBrushes.find(db => db.name === this.state.currentBrush.name);
    }

    public get SelectedLayer(): Layer {
        return this.state.layers.find(layer => layer.selected);
    }
}
