import { Vec2Like } from "../../../_lib/math/Geometry";
import { AddTypes, SubtractTypes } from "../../../_lib/patterns/EnumerateTypes";
import Store, { IAction } from "../../../_lib/patterns/redux/Store";
import { InitalScale } from "../../Constants";
import { LightValue } from "../../game/level/Lighting";
import { Brush, Layer } from "./LevelDataStore";

export const enum EditorActions {
    BRUSH_MOVED,
    ROTATE_BRUSH,
    FLIP_BRUSH_H,
    FLIP_BRUSH_V,
    BRUSH_CHANGED,
    BRUSH_HOVERED,
    BRUSH_VISIBLE,
    BRUSH_NUDGE,
    DATA_BRUSH_INC,
    DATA_BRUSH_DEC,
    SET_DATA_BRUSH_VALUE,
    ZOOM_IN,
    ZOOM_OUT,
    MOUSE_BUTTON,
    VIEW_DRAG,
    VIEW_MOVE,
    ADD_LAYER,
    REMOVE_LAYER,
    RENAME_LAYER,
    SELECT_LAYER,
    DUPLICATE_LAYER,
    ADD_DATA_LAYER,
    MOVE_LAYER_UP,
    MOVE_LAYER_DOWN,
    TOGGLE_LAYER_VISIBILITY,
    CHANGE_SCENE,
    REFRESH,
    RESET
}

export const enum MouseButtonState {
    LEFT_DOWN,
    RIGHT_DOWN,
    UP,
    MIDDLE_DOWN
}

export const enum DataBrushName {
    PLAYER_START = "player-start",
    COLLISION = "collision",
    Z_INDEX = "z-index",
    LIGHT = "light"
}

export type DataBrushValue = number | LightValue;

/** Max editable (non-`readOnly`) layers - bounded by the Layers panel's list height. */
export const MaxEditableLayers = 6;

/**
 * Fixed id of the read-only layer that shows data the game derives from tiles'
 * `AssetMetadata` (collision, door footprints, lights - see
 * `FindImplicitPlacements`) rather than hand-painted brushes. Always present
 * (re-added on load/reset), never holds brushes, and `isData` so
 * `Level.LoadEditorData` never mistakes it for a tile layer. Far below any id
 * `NextDataLayerId` hands out (-1, -1000, -1999, ...).
 */
export const IMPLICIT_LAYER_ID = -99999;

function ImplicitLayer(): Layer {
    return { id: IMPLICIT_LAYER_ID, name: "implicit (read-only)", selected: false, visible: true, isData: true, readOnly: true };
}

/** Returns `layers` untouched if it already has the implicit layer (so subscribers' reference checks don't see a change), else a copy with it prepended. */
function WithImplicitLayer(layers: Layer[]): Layer[] {
    return layers.some(layer => layer.id === IMPLICIT_LAYER_ID) ? layers : [ImplicitLayer(), ...layers];
}

export function EditableLayerCount(layers: Layer[]): number {
    return layers.filter(layer => !layer.readOnly).length;
}

export type DataBrush = { name: string; colour: number; value: DataBrushValue };

interface IActionData {
    mouseButtonState?: MouseButtonState;
    name?: string;
    position?: Vec2Like;
    rotation?: number;
    nudge?: Vec2Like;
    move?: Vec2Like;
    scale?: Vec2Like;
    persistZoom?: boolean;
    layer?: Layer;
    visible?: boolean;
    value?: DataBrushValue;
}

export interface IEditorState {
    currentBrush: Brush;
    brushVisible: boolean;
    hoveredBrushName: string;
    dataBrushes: DataBrush[];
    layers: Layer[];
    mouseButtonState: MouseButtonState;
    mouseDownPosition: Vec2Like;
    viewOffset: Vec2Like;
    viewScale: number;
    currentScene: string;
}

export default class EditorStore extends Store<IEditorState, IActionData> {
    protected DefaultState(): IEditorState {
        return {
            currentBrush: {
                name: "",
                position: { x: 0, y: 0 },
                pixelOffset: { x: 0, y: 0 },
                rotation: 0,
                scale: { x: 1, y: 1 },
                layerId: 0,
                data: null
            },
            brushVisible: false,
            hoveredBrushName: "",
            dataBrushes: [
                { name: DataBrushName.PLAYER_START, colour: 0xfe3464, value: 0 },
                { name: DataBrushName.COLLISION, colour: 0xffd166, value: 0 },
                { name: DataBrushName.Z_INDEX, colour: 0x06d6a0, value: 0 },
                { name: DataBrushName.LIGHT, colour: 0xff8100, value: { brightness: 0.5, tint: 0xff8100, range: 5 } }
            ],
            layers: [],
            mouseButtonState: MouseButtonState.UP,
            mouseDownPosition: null,
            viewOffset: { x: 0, y: 0 },
            viewScale: InitalScale,
            currentScene: null
        };
    }

    /**
     * `Store.Load()` replaces state wholesale with whatever was saved, with no reconciliation against
     * the current code - so a `dataBrushes` entry saved under a name that's since been renamed (or typo'd
     * in a hand-edited export) silently stops matching. The palette swatch is unaffected (`Palette.Create`
     * builds it fresh from the current `DataBrushName` enum before this runs), but `SelectedDataBrush` and
     * the `BRUSH_CHANGED`/`DATA_BRUSH_INC`/`DEC` lookups key off the *loaded* catalogue, so the mismatched
     * entry's value can never be found again - see the "door"/"doors" mismatch this fixed in level.json.
     * Reconcile on load: always keep the current code's set of brush names/colours, carrying over each
     * one's saved `value` only where its name still matches.
     */
    Load(state: IEditorState): void {
        super.Load({
            ...state,
            dataBrushes: this.ReconcileDataBrushes(state && state.dataBrushes),
            layers: WithImplicitLayer((state && state.layers) || [])
        });
    }

    private ReconcileDataBrushes(loaded: DataBrush[]): DataBrush[] {
        return this.DefaultState().dataBrushes.map(def => {
            const saved = loaded && loaded.find(db => db.name === def.name);
            return saved ? { ...def, value: saved.value } : def;
        });
    }

    protected Reduce(state: IEditorState, action: IAction<IActionData>): IEditorState {
        const newState = {
            dataBrushes: this.UpdateDataBrushes(state.dataBrushes, action),
            currentBrush: this.UpdateBrush(state.currentBrush, action),
            brushVisible: this.UpdateBrushVisible(state.brushVisible, action),
            hoveredBrushName: this.UpdateHoveredBrushName(state.hoveredBrushName, action),
            layers: WithImplicitLayer(this.UpdateLayers(state.layers, action)),
            mouseButtonState: this.UpdateMouseButton(state.mouseButtonState, action),
            mouseDownPosition: this.UpdateMouseDownPosition(state.mouseDownPosition, action),
            viewOffset: this.UpdateViewOffset(state.viewOffset, action),
            viewScale: this.UpdateViewScale(state.viewScale, action),
            currentScene: this.UpdateCurrentScene(state.currentScene, action)
        };
        return newState as IEditorState;
    }

    private UpdateBrush(currentBrush: Brush, action: IAction<IActionData>): Brush {
        switch (action.type) {
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
            case EditorActions.SET_DATA_BRUSH_VALUE: {
                return {
                    ...currentBrush,
                    data: action.data.value
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
                    scale: { x: currentBrush.scale.x * -1, y: currentBrush.scale.y }
                };
            }
            case EditorActions.FLIP_BRUSH_V: {
                return {
                    ...currentBrush,
                    scale: { x: currentBrush.scale.x, y: currentBrush.scale.y * -1 }
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
        switch (action.type) {
            case EditorActions.BRUSH_VISIBLE:
                return action.data.visible;
            default:
                return visible != null ? visible : this.DefaultState().brushVisible;
        }
    }

    private UpdateDataBrushes(dataBrushes: DataBrush[], action: IAction<IActionData>): DataBrush[] {
        switch (action.type) {
            case EditorActions.DATA_BRUSH_INC:
            case EditorActions.DATA_BRUSH_DEC: {
                const dataBrush = this.SelectedDataBrush;
                if (dataBrush) {
                    const val = this.CalcDataBrushValue(dataBrush.value, action.type);
                    return dataBrushes.map(db => {
                        if (db === dataBrush) {
                            return { ...db, value: val };
                        }
                        return db;
                    });
                }
                return dataBrushes;
            }
            case EditorActions.SET_DATA_BRUSH_VALUE: {
                const dataBrush = this.SelectedDataBrush;
                if (dataBrush) {
                    return dataBrushes.map(db => (db === dataBrush ? { ...db, value: action.data.value } : db));
                }
                return dataBrushes;
            }
            default:
                return dataBrushes || this.DefaultState().dataBrushes;
        }
    }

    private UpdateHoveredBrushName(hoveredBrushName: string, action: IAction<IActionData>): string {
        switch (action.type) {
            case EditorActions.BRUSH_HOVERED:
                return action.data.name;
            default:
                return hoveredBrushName || this.DefaultState().hoveredBrushName;
        }
    }

    private UpdateMouseDownPosition(mouseDownPosition: Vec2Like, action: IAction<IActionData>): Vec2Like {
        switch (action.type) {
            case EditorActions.MOUSE_BUTTON:
                if (action.data.mouseButtonState === MouseButtonState.LEFT_DOWN) {
                    return this.state.currentBrush.position;
                }
            default:
                return mouseDownPosition || this.DefaultState().mouseDownPosition;
        }
    }

    private UpdateLayers(layers: Layer[], action: IAction<IActionData>): Layer[] {
        switch (action.type) {
            case EditorActions.ADD_LAYER: {
                const nextId = this.NextLayerId();
                layers.forEach(layer => (layer.selected = false));
                const layer = { id: nextId, name: "layer " + nextId, selected: true, visible: true, isData: false };
                return layers.concat(layer);
            }
            case EditorActions.ADD_DATA_LAYER: {
                const nextId = this.NextDataLayerId();
                const layer = { id: nextId, name: "data layer " + nextId, selected: false, visible: true, isData: true };
                return layers.concat(layer);
            }
            case EditorActions.REMOVE_LAYER:
                return layers.filter(layer => layer.selected === false);
            case EditorActions.RENAME_LAYER: {
                const selectedLayer = this.SelectedLayer;
                if (!selectedLayer || selectedLayer.readOnly) {
                    return layers;
                }
                const name = prompt("Rename layer", selectedLayer.name);
                if (name) {
                    return layers.map(layer => {
                        if (layer.id === selectedLayer.id) {
                            return { ...layer, name };
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
                    };
                });
            case EditorActions.TOGGLE_LAYER_VISIBILITY: {
                return layers.map(layer => {
                    if (layer.id === action.data.layer.id) {
                        return { ...layer, visible: !layer.visible };
                    }
                    return layer;
                });
            }
            case EditorActions.MOVE_LAYER_UP: {
                const copy = layers.concat();
                const selectedLayer = this.SelectedLayer;
                const index = copy.indexOf(selectedLayer);
                if (index > 0) {
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
                if (index < len - 1) {
                    const nextLayer = copy[index + 1];
                    copy[index + 1] = selectedLayer;
                    copy[index] = nextLayer;
                    return copy;
                }
                return layers;
            }
            case EditorActions.DUPLICATE_LAYER: {
                const selectedLayer = this.SelectedLayer;
                if (!selectedLayer || selectedLayer.readOnly) {
                    return layers;
                }
                const nextId = selectedLayer.isData ? this.NextDataLayerId() : this.NextLayerId();
                const newLayer = { ...selectedLayer, id: nextId, selected: false };
                return layers.concat(newLayer);
            }
            case EditorActions.RESET:
                return this.DefaultState().layers;
            default:
                return layers || this.DefaultState().layers;
        }
    }

    private UpdateMouseButton(mouseButtonDown: MouseButtonState, action: IAction<IActionData>): MouseButtonState {
        switch (action.type) {
            case EditorActions.MOUSE_BUTTON:
                return action.data.mouseButtonState;
            default:
                return mouseButtonDown != null ? mouseButtonDown : this.DefaultState().mouseButtonState;
        }
    }

    private UpdateViewOffset(offset: Vec2Like, action: IAction<IActionData>): Vec2Like {
        switch (action.type) {
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
        switch (action.type) {
            case EditorActions.ZOOM_IN:
                return scale * 1.1;
            case EditorActions.ZOOM_OUT:
                return scale * 0.909;
            case EditorActions.RESET:
                if (!action.data.persistZoom) {
                    return this.DefaultState().viewScale;
                }
            default:
                return scale ? scale : this.DefaultState().viewScale;
        }
    }

    private UpdateCurrentScene(currentScene: string, action: IAction<IActionData>): string {
        switch (action.type) {
            case EditorActions.CHANGE_SCENE:
                return action.data.name;
            default:
                return currentScene || this.DefaultState().currentScene;
        }
    }

    // helpers

    /** Plain +/- stepping only applies to a numeric data brush value - LIGHT's `LightValue` is edited via its own dialog (see `SelectedBrush`), so +/- is a harmless no-op while it's selected. */
    private CalcDataBrushValue(value: DataBrushValue, actionType: EditorActions): DataBrushValue {
        if (typeof value !== "number") {
            return value;
        }
        const inc = actionType === EditorActions.DATA_BRUSH_INC ? 1 : -1;
        return Math.max(Math.min(value + inc, 999), -999);
    }

    private NextLayerId(): number {
        const spriteLayers = this.state.layers.filter(layer => layer.isData === false);
        const nextId = spriteLayers.length ? spriteLayers.reduce((prev, curr) => (curr.id > prev.id ? curr : prev)).id + 1 : 0;
        return nextId;
    }

    private NextDataLayerId(): number {
        const dataLayers = this.state.layers.filter(layer => layer.isData && !layer.readOnly);
        const nextId = dataLayers.length ? dataLayers.reduce((prev, curr) => (curr.id > prev.id ? curr : prev)).id - 999 : -1;
        return nextId;
    }

    get SelectedDataBrush(): DataBrush {
        return this.state.dataBrushes.find(db => db.name === this.state.currentBrush.name);
    }

    get SelectedLayer(): Layer {
        return this.state.layers.find(layer => layer.selected);
    }
}
