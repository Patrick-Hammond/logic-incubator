import { Vec2Like } from "@logic-incubator/lib/math/Geometry";
import { AddTypes, SubtractTypes } from "@logic-incubator/lib/patterns/EnumerateTypes";
import Store, { IAction } from "@logic-incubator/lib/patterns/redux/Store";
import { Scenes } from "@logic-incubator/engine/Constants";
import { InitalScale } from "../Layout";
import { DefaultPickupValue } from "@logic-incubator/engine/level/entities/Pickups";
import { Brush, DataBrushName, DataBrushValue, TileLayerKind } from "@logic-incubator/engine/level/LevelFormat";
import { Layer } from "./LevelDataStore";

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
    MOVE_LAYER_UP,
    MOVE_LAYER_DOWN,
    TOGGLE_LAYER_VISIBILITY,
    CHANGE_SCENE,
    SET_TOOL,
    PICK_BRUSH,
    REFRESH,
    RESET
}

export const enum MouseButtonState {
    LEFT_DOWN,
    RIGHT_DOWN,
    UP,
    MIDDLE_DOWN
}

/**
 * What a left-click/drag on the map does - picked from the toolbar (see `Toolbar`, `Tools`). The data-select
 * tool is only on offer while a data layer is selected (see `ToolFitsLayer`), as that's where data lives.
 */
export const enum EditorTool {
    BRUSH = "brush",
    ERASE = "erase",
    DATA_SELECT = "data-select",
    STAMP = "stamp",
    DROPPER = "dropper",
    FILL = "fill",
    MOVE = "move"
}

/** Whether `tool` can be used with `layer` selected: every tool can, except data-select, which wants a data layer (the "attributes" one). */
export function ToolFitsLayer(tool: EditorTool, layer: Layer | undefined): boolean {
    return tool !== EditorTool.DATA_SELECT || (layer !== undefined && layer.isData);
}

/** Max editable (non-attributes) layers - a sanity cap; the Layers panel's list scrolls past what fits. */
export const MaxEditableLayers = 16;

/**
 * Fixed id of "attributes", the one data layer: player-start, collision and z-index are painted
 * onto it like any data brush, and it also draws the read-only overlay of what the game derives
 * from tiles' own `AssetMetadata` (collision, door footprints, lights, spawners - see
 * `FindImplicitPlacements`), so a cell's full picture - hand-placed and intrinsic - is always in
 * one place. `isData: true` is what keeps `Level.LoadLevel` from ever mistaking it for a tile
 * layer; its id is what everything else (duplicating, reordering, the layer badge) keys off, since
 * it's the one layer that's always there rather than something a user added. Always present
 * (re-added on load/reset). There's deliberately no way to add another data layer alongside it -
 * painting height/collision on more than one was never useful and just made "which layer is this
 * on" a question worth asking.
 */
export const IMPLICIT_LAYER_ID = -99999;

function ImplicitLayer(): Layer {
    return { id: IMPLICIT_LAYER_ID, name: "attributes", selected: false, visible: true, isData: true };
}

/**
 * Returns `layers` untouched if it already has the implicit layer under its current name (so
 * subscribers' reference checks don't see a change), else a copy with it prepended or renamed.
 * Its name used to be fixed at "implicit (read-only)", with no way to rename it - so a layer still
 * carrying that exact name is only ever the old default, never something a user chose, and safe to
 * bring up to its new one ("attributes") automatically rather than leave every already-saved level
 * behind.
 */
function WithImplicitLayer(layers: Layer[]): Layer[] {
    const existing = layers.find(layer => layer.id === IMPLICIT_LAYER_ID);
    if (!existing) {
        return [ImplicitLayer(), ...layers];
    }
    if (existing.name === "implicit (read-only)") {
        return layers.map(layer => (layer === existing ? { ...layer, name: "attributes" } : layer));
    }
    return layers;
}

/** The tile layers every level has, in the order they're added (floor under walls) - there's always at least one of each kind, so the palette always has somewhere to put floor and wall tiles. */
export const DefaultTileLayerKinds: ReadonlyArray<TileLayerKind> = ["floor", "walls"];

/**
 * `layers` with "attributes" (see `WithImplicitLayer`) and at least one floor and one walls layer -
 * a new level starts with just those three, and a level saved before layers had kinds gets an empty one
 * of each, after "attributes" (so the tiles it already has stay drawn on top). Something is always
 * selected: the first floor layer, if nothing was. Untouched (the same array) if there's nothing to add.
 */
export function WithDefaultLayers(layers: Layer[]): Layer[] {
    let result = WithImplicitLayer(layers);
    let nextId = NextTileLayerId(result);
    DefaultTileLayerKinds.forEach((kind, index) => {
        if (result.some(layer => layer.kind === kind)) {
            return;
        }
        // After the last of the kinds before it (walls go over floor), else straight after "attributes".
        let at = result.findIndex(layer => layer.id === IMPLICIT_LAYER_ID) + 1;
        result.forEach((layer, i) => {
            if (layer.kind && DefaultTileLayerKinds.indexOf(layer.kind) < index) {
                at = Math.max(at, i + 1);
            }
        });
        const layer: Layer = { id: nextId++, name: kind, selected: false, visible: true, isData: false, kind };
        result = result.slice(0, at).concat(layer, result.slice(at));
    });
    if (!result.some(layer => layer.selected)) {
        const floor = result.find(layer => layer.kind === "floor");
        result = result.map(layer => (layer === floor ? { ...layer, selected: true } : layer));
    }
    return result;
}

/** One more than the highest tile layer id, or 0 for the first. ("attributes" has its own fixed id.) */
export function NextTileLayerId(layers: Layer[]): number {
    return layers.filter(layer => !layer.isData).reduce((next, layer) => Math.max(next, layer.id + 1), 0);
}

/** Whether `layer` can be removed: never "attributes", nor the last floor or walls layer. */
export function IsRemovableLayer(layers: Layer[], layer: Layer | undefined): boolean {
    if (!layer || layer.id === IMPLICIT_LAYER_ID) {
        return false;
    }
    return !layer.kind || layers.some(other => other.kind === layer.kind && other.id !== layer.id);
}

export function EditableLayerCount(layers: Layer[]): number {
    return layers.filter(layer => layer.id !== IMPLICIT_LAYER_ID).length;
}

export type DataBrush = { name: string; colour: number; value: DataBrushValue };

/**
 * A sprite (its first frame, for an animation) drawn over each data brush's colour in the palette
 * and on the map. They're the game's art, so it picks them (`IDungeonEditorOptions.dataBrushIcons`);
 * a brush without one shows just its colour.
 */
export type DataBrushIcons = { readonly [K in DataBrushName]?: string };

/** `icons`' sprite for the named data brush, if it has one. */
export function DataBrushIcon(icons: DataBrushIcons, name: string): string | undefined {
    return (icons as { readonly [name: string]: string | undefined })[name];
}

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
    tool?: EditorTool;
    /** PICK_BRUSH: a brush placed on the map, to paint with next. */
    brush?: Brush;
    /** ADD_LAYER: a floor or walls layer, rather than one that takes any other tile. */
    kind?: TileLayerKind;
}

/** What a layer was last painted with: the tool and the brush picked on it, given back when it's selected again (see `IEditorState.layerMemory`). */
export type LayerMemory = { tool: EditorTool; brush: Brush };

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
    tool: EditorTool;
    /**
     * Each layer's tool and brush as they were when another layer was selected, keyed by layer id - so going
     * back to a layer picks up where it was left, e.g. a floor tile on the floor layer and a wall on the walls one.
     */
    layerMemory: { [layerId: string]: LayerMemory };
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
                { name: DataBrushName.PICKUP, colour: 0xf15bb5, value: DefaultPickupValue() }
            ],
            layers: [],
            mouseButtonState: MouseButtonState.UP,
            mouseDownPosition: null,
            viewOffset: { x: 0, y: 0 },
            viewScale: InitalScale,
            // What the game shows at boot. Was null, which left every editor shortcut (gated on
            // `currentScene === EDITOR` in Keyboard) dead until the first Enter toggled it into place.
            currentScene: Scenes.EDITOR,
            tool: EditorTool.BRUSH,
            layerMemory: {}
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
     *
     * `currentScene` is kept as-is rather than taken from the save: which scene is on screen isn't part of
     * a map, and a save carrying some other value (e.g. null, from before it had a default) would
     * otherwise switch scenes on load or disable the editor shortcuts again. Likewise the current `tool`.
     */
    Load(state: IEditorState): void {
        const layers = WithDefaultLayers((state && state.layers) || []);
        super.Load({
            ...state,
            currentScene: this.state.currentScene,
            // Still the current tool - unless the loaded layers have a tile layer selected, which data-select can't be used on.
            tool: this.UsableTool(this.state.tool, layers),
            dataBrushes: this.ReconcileDataBrushes(state && state.dataBrushes),
            layers,
            // A save from before layers were remembered has none.
            layerMemory: (state && state.layerMemory) || {}
        });
    }

    private ReconcileDataBrushes(loaded: DataBrush[]): DataBrush[] {
        return this.DefaultState().dataBrushes.map(def => {
            const saved = loaded && loaded.find(db => db.name === def.name);
            return saved ? { ...def, value: saved.value } : def;
        });
    }

    protected Reduce(state: IEditorState, action: IAction<IActionData>): IEditorState {
        const layers = WithDefaultLayers(this.UpdateLayers(state.layers, action));
        const switched = this.SwitchLayer(state, layers, action, this.UpdateBrush(state.currentBrush, action), this.UpdateTool(state.tool, action));
        const newState = {
            dataBrushes: this.UpdateDataBrushes(state.dataBrushes, action),
            currentBrush: switched.brush,
            brushVisible: this.UpdateBrushVisible(state.brushVisible, action),
            hoveredBrushName: this.UpdateHoveredBrushName(state.hoveredBrushName, action),
            layers,
            mouseButtonState: this.UpdateMouseButton(state.mouseButtonState, action),
            mouseDownPosition: this.UpdateMouseDownPosition(state.mouseDownPosition, action),
            viewOffset: this.UpdateViewOffset(state.viewOffset, action),
            viewScale: this.UpdateViewScale(state.viewScale, action),
            currentScene: this.UpdateCurrentScene(state.currentScene, action),
            tool: this.UsableTool(switched.tool, layers),
            layerMemory: switched.layerMemory
        };
        return newState as IEditorState;
    }

    /**
     * When the selected layer changes - picked in the panel, or by adding, removing or the dropper - the layer
     * being left remembers its tool and brush, and the one selected gets back its own (or, the first time, the
     * empty brush and whatever tool was in use). The dropper's pick is the exception: it's the brush wanted next,
     * so it's kept. `brush` and `tool` are what the action would otherwise leave. Memory of a layer that's gone is
     * dropped.
     */
    private SwitchLayer(state: IEditorState, layers: Layer[], action: IAction<IActionData>, brush: Brush, tool: EditorTool): { brush: Brush; tool: EditorTool; layerMemory: { [layerId: string]: LayerMemory } } {
        let layerMemory = state.layerMemory || this.DefaultState().layerMemory;
        if (action.type === EditorActions.RESET) {
            return { brush, tool, layerMemory: this.DefaultState().layerMemory };
        }
        const from = (state.layers || []).find(layer => layer.selected);
        const to = layers.find(layer => layer.selected);
        if (from && to && from.id !== to.id) {
            layerMemory = { ...layerMemory, [from.id]: { tool: state.tool, brush: state.currentBrush } };
            const remembered = layerMemory[to.id];
            if (action.type !== EditorActions.PICK_BRUSH) {
                brush = remembered
                    ? { ...remembered.brush, layerId: to.id, position: state.currentBrush.position }
                    : { ...this.DefaultState().currentBrush, layerId: to.id, position: state.currentBrush.position };
                if (remembered) {
                    tool = remembered.tool;
                }
            }
        }
        const gone = Object.keys(layerMemory).filter(id => !layers.some(layer => String(layer.id) === id));
        if (gone.length) {
            layerMemory = { ...layerMemory };
            gone.forEach(id => delete layerMemory[id]);
        }
        return { brush, tool, layerMemory };
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
            case EditorActions.PICK_BRUSH: {
                // Everything about the placed brush but where it is - the cursor stays where it was.
                const picked = action.data.brush;
                return {
                    ...picked,
                    position: currentBrush.position,
                    pixelOffset: { ...picked.pixelOffset },
                    scale: { ...picked.scale }
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
            case EditorActions.PICK_BRUSH: {
                // Picking a placed light/spawner picks up its settings too, so the palette brush (and its
                // Edit dialog) carry on from them.
                const picked = action.data.brush;
                if (picked.data == null || !dataBrushes.some(db => db.name === picked.name)) {
                    return dataBrushes;
                }
                return dataBrushes.map(db => (db.name === picked.name ? { ...db, value: picked.data } : db));
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

    /**
     * Where the last left or right press was. Kept in level cells (the view cell plus `viewOffset`), not
     * view cells, so panning or zooming mid-drag doesn't move it. (Rect drags keep their own anchor - see `Tools`.)
     */
    private UpdateMouseDownPosition(mouseDownPosition: Vec2Like, action: IAction<IActionData>): Vec2Like {
        switch (action.type) {
            case EditorActions.MOUSE_BUTTON:
                if (
                    action.data.mouseButtonState === MouseButtonState.LEFT_DOWN ||
                    action.data.mouseButtonState === MouseButtonState.RIGHT_DOWN
                ) {
                    return AddTypes(this.state.currentBrush.position, this.state.viewOffset);
                }
                // A middle press or a release leaves it where it was.
                return mouseDownPosition || this.DefaultState().mouseDownPosition;
            default:
                return mouseDownPosition || this.DefaultState().mouseDownPosition;
        }
    }

    private UpdateLayers(layers: Layer[], action: IAction<IActionData>): Layer[] {
        switch (action.type) {
            case EditorActions.ADD_LAYER: {
                const nextId = NextTileLayerId(layers);
                const kind = action.data && action.data.kind;
                const layer: Layer = { id: nextId, name: (kind || "layer") + " " + nextId, selected: true, visible: true, isData: false };
                if (kind) {
                    layer.kind = kind;
                }
                return layers.map(other => (other.selected ? { ...other, selected: false } : other)).concat(layer);
            }
            case EditorActions.REMOVE_LAYER:
                return layers.filter(layer => layer.selected === false);
            case EditorActions.RENAME_LAYER: {
                // The new name comes from the Layers panel's rename dialog.
                const selectedLayer = this.SelectedLayer;
                const name = action.data && action.data.name;
                if (!selectedLayer || !name) {
                    return layers;
                }
                return layers.map(layer => (layer.id === selectedLayer.id ? { ...layer, name } : layer));
            }
            case EditorActions.SELECT_LAYER:
                return layers.map(layer => {
                    return {
                        ...layer,
                        selected: layer.id === action.data.layer.id
                    };
                });
            case EditorActions.PICK_BRUSH: {
                // Paint it back onto its own kind of layer - a tile picked while a data layer is
                // selected would otherwise get painted onto the data layer.
                const layerId = action.data.brush.layerId;
                if (!layers.some(layer => layer.id === layerId) || (this.SelectedLayer && this.SelectedLayer.id === layerId)) {
                    return layers;
                }
                return layers.map(layer => (layer.selected === (layer.id === layerId) ? layer : { ...layer, selected: layer.id === layerId }));
            }
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
                // There's only ever the one "attributes" layer - what's left to duplicate is always a tile layer.
                if (!selectedLayer || selectedLayer.id === IMPLICIT_LAYER_ID) {
                    return layers;
                }
                const newLayer = { ...selectedLayer, id: NextTileLayerId(layers), selected: false };
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
            case EditorActions.VIEW_DRAG: {
                const delta = SubtractTypes(this.state.currentBrush.position, action.data.position);
                return SubtractTypes(offset, delta);
            }
            case EditorActions.VIEW_MOVE: {
                return AddTypes(offset, action.data.move);
            }
            case EditorActions.RESET: {
                return this.DefaultState().viewOffset;
            }
            default: {
                return offset ? offset : this.DefaultState().viewOffset;
            }
        }
    }

    private UpdateViewScale(scale: number, action: IAction<IActionData>): number {
        switch (action.type) {
            case EditorActions.ZOOM_IN:
                return scale * 1.1;
            case EditorActions.ZOOM_OUT:
                return scale * 0.909;
            case EditorActions.RESET:
                // Ctrl+Q keeps the zoom; a fresh start doesn't.
                return action.data.persistZoom && scale ? scale : this.DefaultState().viewScale;
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

    private UpdateTool(tool: EditorTool, action: IAction<IActionData>): EditorTool {
        switch (action.type) {
            case EditorActions.SET_TOOL:
                return action.data.tool;
            default:
                return tool || this.DefaultState().tool;
        }
    }

    // helpers

    /**
     * `tool`, or the brush if it can't be used with the layer that's now selected - data-select with a tile
     * layer, whether that came from picking the layer, adding one, the dropper picking a tile off one, or
     * the tool being asked for in the first place. Decided here rather than in each of those, so none can be missed.
     */
    private UsableTool(tool: EditorTool, layers: Layer[]): EditorTool {
        return ToolFitsLayer(tool, layers.find(layer => layer.selected)) ? tool : EditorTool.BRUSH;
    }

    /** Plain +/- stepping only applies to a numeric data brush value - every remaining one (player-start, collision, height) is a number, but a save from before light/spawner moved off the data-brush model could still hand this a `LightValue`/`SpawnerValue`, so the guard stays. */
    private CalcDataBrushValue(value: DataBrushValue, actionType: EditorActions): DataBrushValue {
        if (typeof value !== "number") {
            return value;
        }
        const inc = actionType === EditorActions.DATA_BRUSH_INC ? 1 : -1;
        return Math.max(Math.min(value + inc, 999), -999);
    }

    get SelectedDataBrush(): DataBrush {
        return this.state.dataBrushes.find(db => db.name === this.state.currentBrush.name);
    }

    get SelectedLayer(): Layer {
        return this.state.layers.find(layer => layer.selected);
    }
}
