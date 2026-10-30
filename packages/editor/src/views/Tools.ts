import { Graphics, Text } from "pixi.js";
import { Key } from "@logic-incubator/lib/io/Keyboard";
import { Vec2Like } from "@logic-incubator/lib/math/Geometry";
import { Scenes, TileSize } from "@logic-incubator/engine/Constants";
import { GridBounds } from "../Layout";
import { SummariseCell } from "../CellEntries";
import EditorComponent from "../EditorComponent";
import { CellKey, HeightAtCell, HeightChange, MakeHeightBrush, WithHeights } from "../Heights";
import AssetMetadataStore from "@logic-incubator/engine/level/AssetMetadata";
import { Brush, DataBrushName } from "@logic-incubator/engine/level/LevelFormat";
import {
    ActiveAttributeType,
    DataBrushLabel,
    EditorActions,
    EditorTool,
    IEditorState,
    IsHeightBrushName,
    IsHeightLayer,
    LOWER_BRUSH,
    MouseButtonState,
    RAISE_BRUSH
} from "../stores/EditorStore";
import { Layer, LevelDataActions } from "../stores/LevelDataStore";
import { EditorCellEntries } from "./CellLookups";
import { TakesCategory } from "./PaletteCategories";
import { CellRect, FloodFill, RectCells, SpanRect, TopmostBrushAt } from "../tools/ToolGeometry";

const PAINT_COLOUR = 0x9b5de5;
const ERASE_COLOUR = 0xff5d5d;
const PICK_COLOUR = 0x4cc9f0;
/** The outline round the cell the inspector is open on. */
const INSPECTED_COLOUR = 0xffffff;

/** A rectangle being dragged out - painted (or erased) as one undo step when the button's released. */
type RectDrag = { anchor: Vec2Like; erase: boolean; brush: Brush };

/**
 * What a click or drag on the map does under each toolbar tool, and the
 * previews that show it before it happens:
 *
 * - Brush: left paints, right erases, Ctrl+drag stamps a filled rectangle
 *   (right: erases one) - the editor's original mouse controls.
 * - Erase: left erases on the selected layer; Ctrl+drag erases a rectangle.
 * - Data select (only with a data layer selected): click a cell to open the inspector on it (see `CellInspector`),
 *   which lists everything there - its data brushes, its tiles' own lights, spawners, pickups and door locks, its
 *   height - to edit or delete each. Hovering names them beside the cursor.
 * - Stamp: drag a rectangle to paint; hold Ctrl for just its border. Right-drag erases one.
 * - Dropper: click a tile (or on a data layer, a data brush) to paint with it.
 * - Fill: flood-fills the region of matching cells on the selected layer, within the visible map.
 * - Move: drag to pan (the view drag itself is `Canvas`'s, like middle-drag).
 *
 * On "attributes", painting, erasing and filling touch only the active type (see `ActiveAttributeType`). On the
 * height layer they change heights rather than place brushes (see `WithHeights`): the height brush sets its number,
 * raise and lower step each cell once a stroke, erasing flattens to 0, a fill takes the connected cells of the same
 * height, and the dropper picks a cell's height into the height brush.
 *
 * Middle-drag and Space+drag pan under any tool. Rectangles are previewed
 * while dragging and only committed on release, so Escape can cancel them.
 */
export default class Tools extends EditorComponent {
    private preview = new Graphics();
    private previewMask = new Graphics();
    private label: Text;
    private drag: RectDrag = null;
    /** `keyAt` for the fill preview, cached per level data, layer and the attribute type it's for. */
    private fillKeys: { levelData: Brush[]; layerId: number; only: string | null; keys: Map<string, string> } = null;
    /** The cells a freehand stroke on the height layer has raised or lowered already, so going back over one doesn't step it again. */
    private stroke = new Set<string>();

    protected OnInitialise(): void {
        this.label = new Text("", { fontFamily: "Arial", fontSize: 12, fill: 0xffffff, stroke: 0x000000, strokeThickness: 3 });
        this.previewMask.beginFill(0xffffff).drawShape(GridBounds).endFill();
        this.preview.mask = this.previewMask;
        this.root.addChild(this.previewMask, this.preview, this.label);

        this.Own(this.editorStore.Subscribe(this.Render, this));
        this.Own(this.levelDataStore.Subscribe(() => this.DrawPreview(), this));

        this.ListenWhileShown(this.game.keyboard, "keydown", (e: KeyboardEvent) => this.OnKey(e));
        this.ListenWhileShown(this.game.keyboard, "keyup", (e: KeyboardEvent) => this.OnKey(e));
    }

    protected OnShow(): void {
        this.UpdateCursor();
    }

    /** The cursor is the canvas's, so hand it back while another scene has the stage. */
    protected OnHide(): void {
        this.SetCursor("inherit");
    }

    private Render(prevState: IEditorState, state: IEditorState): void {
        if (prevState.tool !== state.tool) {
            this.drag = null;
        }
        if (prevState.mouseButtonState !== state.mouseButtonState) {
            this.OnButton(state);
        } else {
            const pos = state.currentBrush.position;
            const prevPos = prevState.currentBrush.position;
            if (pos.x !== prevPos.x || pos.y !== prevPos.y) {
                this.OnDrag(state);
            }
        }
        this.UpdateCursor();
        this.DrawPreview();
    }

    private OnKey(e: KeyboardEvent): void {
        if (e.type === "keydown" && e.keyCode === Key.Escape && this.drag) {
            this.drag = null;
        }
        // Ctrl flips the stamp between filled and border; Space shows the pan cursor.
        if (e.keyCode === Key.Ctrl || e.keyCode === Key.Space || e.keyCode === Key.Escape) {
            this.UpdateCursor();
            this.DrawPreview();
        }
    }

    // input

    private OnButton(state: IEditorState): void {
        // A rectangle in progress is committed by releasing its button, and dropped by pressing another.
        if (this.drag) {
            if (state.mouseButtonState === MouseButtonState.UP) {
                this.CommitRect(state);
            }
            this.drag = null;
        }

        const left = state.mouseButtonState === MouseButtonState.LEFT_DOWN;
        const right = state.mouseButtonState === MouseButtonState.RIGHT_DOWN;
        if ((!left && !right) || this.Key(Key.Space)) {
            return;
        }
        this.stroke.clear();
        const ctrl = this.Key(Key.Ctrl);
        const cell = this.MapCell(state);

        switch (state.tool) {
            case EditorTool.BRUSH:
                if (ctrl) {
                    this.StartRect(state, right);
                } else {
                    this.Freehand(state);
                }
                break;
            case EditorTool.ERASE:
                if (left && ctrl) {
                    this.StartRect(state, true);
                } else if (left) {
                    this.Freehand(state);
                }
                break;
            case EditorTool.STAMP:
                this.StartRect(state, right);
                break;
            case EditorTool.FILL:
                if (left) {
                    this.Fill(state, cell);
                }
                break;
            case EditorTool.DROPPER:
                if (left) {
                    this.Pick(state, cell);
                }
                break;
            case EditorTool.DATA_SELECT:
                if (left) {
                    this.Inspect(state, cell);
                }
                break;
        }
    }

    /** The cursor moved onto another cell - freehand tools keep painting/erasing while their button's down. */
    private OnDrag(state: IEditorState): void {
        if (!this.drag && !this.Key(Key.Ctrl)) {
            this.Freehand(state);
        }
    }

    /** Brush (left paints, right erases) and Erase (left) - one cell at a time, as the cursor moves. */
    private Freehand(state: IEditorState): void {
        const layer = this.EditableLayer();
        const shift = this.Key(Key.Shift);
        if (!layer || shift || this.Key(Key.Space)) {
            return;
        }
        const left = state.mouseButtonState === MouseButtonState.LEFT_DOWN;
        const right = state.mouseButtonState === MouseButtonState.RIGHT_DOWN;
        const paint = state.tool === EditorTool.BRUSH && left ? this.PaintBrush(state) : null;
        const erase = (state.tool === EditorTool.BRUSH && right) || (state.tool === EditorTool.ERASE && left);
        if (IsHeightLayer(layer)) {
            this.PaintHeight(state, paint ? HeightChangeOf(paint) : erase ? { height: 0 } : null);
        } else if (paint) {
            this.levelDataStore.Dispatch({
                type: LevelDataActions.PAINT,
                data: { brush: paint, viewOffset: state.viewOffset, layers: state.layers },
                canUndo: true
            });
        } else if (erase) {
            this.levelDataStore.Dispatch({
                type: LevelDataActions.ERASE,
                data: { brush: { ...state.currentBrush, layerId: layer.id }, viewOffset: state.viewOffset, layers: state.layers },
                canUndo: true
            });
        }
    }

    /** One cell of a freehand stroke on the height layer: raise and lower step each cell once a stroke, and a cell already as it would be is no undo step. */
    private PaintHeight(state: IEditorState, change: HeightChange | null): void {
        if (!change) {
            return;
        }
        const cell = this.MapCell(state);
        const key = CellKey(cell);
        if (change.delta != null && this.stroke.has(key)) {
            return;
        }
        this.stroke.add(key);
        const levelData = this.levelDataStore.state.levelData;
        if (WithHeights(levelData, [cell], change) !== levelData) {
            this.levelDataStore.Dispatch({ type: LevelDataActions.SET_HEIGHT, data: { cells: [cell], heightChange: change }, canUndo: true });
        }
    }

    private StartRect(state: IEditorState, erase: boolean): void {
        const layer = this.EditableLayer();
        const brush = erase ? layer && { ...state.currentBrush, layerId: layer.id } : this.PaintBrush(state);
        if (brush) {
            this.drag = { anchor: this.MapCell(state), erase, brush };
        }
    }

    private CommitRect(state: IEditorState): void {
        const rect = SpanRect(this.drag.anchor, this.MapCell(state));
        if (this.drag.brush.layerId === this.HeightLayerId(state)) {
            const change = this.drag.erase ? { height: 0 } : HeightChangeOf(this.drag.brush);
            if (change) {
                this.levelDataStore.Dispatch({
                    type: LevelDataActions.SET_HEIGHT,
                    data: { cells: RectCells(rect, this.StampBorder(state)), heightChange: change },
                    canUndo: true
                });
            }
        } else if (this.drag.erase) {
            this.levelDataStore.Dispatch({
                type: LevelDataActions.ERASE_RECT,
                data: {
                    brush: this.drag.brush,
                    rectTopLeft: { x: rect.x, y: rect.y },
                    rectBottomRight: { x: rect.x + rect.width - 1, y: rect.y + rect.height - 1 },
                    viewOffset: { x: 0, y: 0 },
                    layers: state.layers
                },
                canUndo: true
            });
        } else {
            this.levelDataStore.Dispatch({
                type: LevelDataActions.PAINT_CELLS,
                data: { brush: this.drag.brush, cells: RectCells(rect, this.StampBorder(state)), layers: state.layers },
                canUndo: true
            });
        }
    }

    private Fill(state: IEditorState, cell: Vec2Like): void {
        const cells = this.FillRegion(state, cell);
        if (!cells.length) {
            return;
        }
        const brush = this.PaintBrush(state);
        if (IsHeightLayer(this.EditableLayer())) {
            this.levelDataStore.Dispatch({ type: LevelDataActions.SET_HEIGHT, data: { cells, heightChange: HeightChangeOf(brush) }, canUndo: true });
        } else {
            this.levelDataStore.Dispatch({
                type: LevelDataActions.PAINT_CELLS,
                data: { brush, cells, layers: state.layers },
                canUndo: true
            });
        }
    }

    private Pick(state: IEditorState, cell: Vec2Like): void {
        const brush = this.PickableAt(state, cell);
        if (brush) {
            this.editorStore.Dispatch({ type: EditorActions.PICK_BRUSH, data: { brush } });
            this.editorStore.Dispatch({ type: EditorActions.BRUSH_HOVERED, data: { name: brush.name } });
        }
    }

    /** Opens the inspector on a cell with anything on it - or closes it, clicking the cell it's open on again, or an empty one. */
    private Inspect(state: IEditorState, cell: Vec2Like): void {
        const open = state.inspectedCell;
        const again = open != null && open.x === cell.x && open.y === cell.y;
        const position = !again && SummariseCell(this.EntriesAt(state, cell)) ? cell : undefined;
        if (position || open) {
            this.editorStore.Dispatch({ type: EditorActions.INSPECT_CELL, data: { position } });
        }
    }

    // queries

    /**
     * The picked brush, to paint onto the selected layer - or null if there's nothing to paint: no
     * brush, or a brush of the wrong kind for the layer (a data brush on a tile layer, or a tile on a
     * data layer - e.g. just after adding a layer of the other kind - or a height brush anywhere but the
     * height layer and any other there, or a tile that isn't floor on a floor layer, or isn't walls on a
     * walls layer; see `TakesCategory`).
     */
    private PaintBrush(state: IEditorState): Brush | null {
        const layer = this.EditableLayer();
        const name = state.currentBrush.name;
        if (!layer || name === "") {
            return null;
        }
        const isDataBrush = state.dataBrushes.some(db => db.name === name);
        if (isDataBrush !== layer.isData || (!isDataBrush && !TakesCategory(layer.kind, AssetMetadataStore.inst.CategoryOf(name)))) {
            return null;
        }
        if (isDataBrush && IsHeightBrushName(name) !== IsHeightLayer(layer)) {
            return null;
        }
        return { ...state.currentBrush, layerId: layer.id };
    }

    private HeightLayerId(state: IEditorState): number | undefined {
        const layer = state.layers.find(IsHeightLayer);
        return layer && layer.id;
    }

    /** The selected layer, if there is one - every layer, including "attributes", can be painted on. */
    private EditableLayer(): Layer | undefined {
        return this.editorStore.SelectedLayer;
    }

    /** The cursor's cell in map coordinates (what a brush's `position` holds), rather than relative to the view. */
    private MapCell(state: IEditorState): Vec2Like {
        return { x: state.currentBrush.position.x + state.viewOffset.x, y: state.currentBrush.position.y + state.viewOffset.y };
    }

    /** The cells whose top-left corner is on the grid - the same ones `Canvas` draws. */
    private VisibleCells(state: IEditorState): CellRect {
        const size = TileSize * state.viewScale;
        return { x: state.viewOffset.x, y: state.viewOffset.y, width: Math.ceil(GridBounds.width / size), height: Math.ceil(GridBounds.height / size) };
    }

    private StampBorder(state: IEditorState): boolean {
        return state.tool === EditorTool.STAMP && this.Key(Key.Ctrl);
    }

    /**
     * What a fill at `cell` would paint: the matching region on the selected layer, or nothing if there's nothing to paint (see
     * `PaintBrush`) or the region's already this brush. On a data layer the cells match by whether they have the brush's type, so a
     * fill spreads over the cells without it; on the height layer, by height.
     */
    private FillRegion(state: IEditorState, cell: Vec2Like): Vec2Like[] {
        const brush = this.PaintBrush(state);
        if (!brush) {
            return [];
        }
        const layer = this.EditableLayer();
        const height = IsHeightLayer(layer);
        const only = layer.isData && !height ? brush.name : null;
        const levelData = this.levelDataStore.state.levelData;
        if (!this.fillKeys || this.fillKeys.levelData !== levelData || this.fillKeys.layerId !== layer.id || this.fillKeys.only !== only) {
            // Last painted wins, as it's the one drawn on top.
            const keys = new Map<string, string>();
            levelData.forEach(brush => {
                if (brush.layerId === layer.id && (only == null || brush.name === only)) {
                    keys.set(brush.position.x + "," + brush.position.y, height ? String(brush.data) : brush.name);
                }
            });
            this.fillKeys = { levelData, layerId: layer.id, only, keys };
        }
        const keys = this.fillKeys.keys;
        const empty = height ? "0" : "";
        const keyAt = (x: number, y: number) => keys.get(x + "," + y) || empty;
        const change = height ? HeightChangeOf(brush) : null;
        if (height ? change == null || (change.height != null && keyAt(cell.x, cell.y) === String(change.height)) : keyAt(cell.x, cell.y) === brush.name) {
            return [];
        }
        return FloodFill(cell, this.VisibleCells(state), keyAt);
    }

    /**
     * The dropper samples the selected layer's kind: tiles from tile layers, data brushes from "attributes" - the active
     * type's, if the cell has one - and on the height layer, the cell's height (0 where it's unpainted), as the height brush.
     */
    private PickableAt(state: IEditorState, cell: Vec2Like): Brush | undefined {
        const selected = this.editorStore.SelectedLayer;
        const levelData = this.levelDataStore.state.levelData;
        if (IsHeightLayer(selected)) {
            return MakeHeightBrush(cell, HeightAtCell(levelData, cell));
        }
        const wantData = selected != null && selected.isData;
        const layers = state.layers.filter(layer => layer.isData === wantData && !IsHeightLayer(layer));
        const active = ActiveAttributeType(state);
        return (active && TopmostBrushAt(levelData, layers, cell, brush => brush.name === active)) || TopmostBrushAt(levelData, layers, cell);
    }

    /** Everything on `cell` (see `CellEntriesAt`). */
    private EntriesAt(state: IEditorState, cell: Vec2Like) {
        return EditorCellEntries(this.levelDataStore.state.levelData, state.layers, cell);
    }

    private Key(key: Key): boolean {
        return !!this.game.keyboard.KeyPressed(key);
    }

    // feedback

    private UpdateCursor(): void {
        const state = this.editorStore.state;
        // Store changes keep arriving while another scene has the stage - the cursor isn't ours then.
        if (this.game.sceneManager.CurrentScene !== Scenes.EDITOR) {
            return;
        }
        let cursor = "crosshair";
        if (!state.brushVisible && state.mouseButtonState === MouseButtonState.UP) {
            // Off the grid (brushVisible follows the grid's mouseover/out) - e.g. over the help line.
            cursor = "inherit";
        } else if (state.mouseButtonState === MouseButtonState.MIDDLE_DOWN) {
            cursor = "grabbing";
        } else if (state.tool === EditorTool.MOVE || this.Key(Key.Space)) {
            cursor = state.mouseButtonState === MouseButtonState.LEFT_DOWN ? "grabbing" : "grab";
        } else if (state.tool === EditorTool.DATA_SELECT) {
            cursor = state.brushVisible && SummariseCell(this.EntriesAt(state, this.MapCell(state))) ? "pointer" : "default";
        }
        this.SetCursor(cursor);
    }

    /** The grid has no `cursor` of its own, so Pixi applies `cursorStyles.default` over it - set that too, or its next re-apply undoes this. */
    private SetCursor(cursor: string): void {
        this.game.interactionManager.cursorStyles.default = cursor;
        this.game.view.style.cursor = cursor;
    }

    private DrawPreview(): void {
        const state = this.editorStore.state;
        this.preview.clear();
        this.label.visible = false;
        const cell = this.MapCell(state);
        if (state.inspectedCell) {
            this.OutlineCells(state, { x: state.inspectedCell.x, y: state.inspectedCell.y, width: 1, height: 1 }, INSPECTED_COLOUR);
        }

        if (this.drag) {
            const rect = SpanRect(this.drag.anchor, cell);
            const border = !this.drag.erase && this.StampBorder(state);
            const colour = this.drag.erase ? ERASE_COLOUR : PAINT_COLOUR;
            if (border && rect.width > 2 && rect.height > 2) {
                // The ring, as four strips.
                const inner = { x: rect.x + 1, y: rect.y + 1, width: rect.width - 2, height: rect.height - 2 };
                this.FillCells(state, { ...rect, height: 1 }, colour, 0.35);
                this.FillCells(state, { ...rect, y: rect.y + rect.height - 1, height: 1 }, colour, 0.35);
                this.FillCells(state, { x: rect.x, y: inner.y, width: 1, height: inner.height }, colour, 0.35);
                this.FillCells(state, { x: rect.x + rect.width - 1, y: inner.y, width: 1, height: inner.height }, colour, 0.35);
            } else {
                this.FillCells(state, rect, colour, 0.35);
            }
            this.OutlineCells(state, rect, colour);
            const kind = this.drag.erase ? "erase" : border ? "border" : "fill";
            this.ShowLabel(state, cell, `${rect.width} × ${rect.height} ${kind}`);
            return;
        }

        if (!state.brushVisible || state.mouseButtonState === MouseButtonState.MIDDLE_DOWN || this.Key(Key.Space)) {
            return;
        }
        const one = { x: cell.x, y: cell.y, width: 1, height: 1 };
        switch (state.tool) {
            case EditorTool.ERASE:
                if (this.EditableLayer()) {
                    this.OutlineCells(state, one, ERASE_COLOUR);
                }
                break;
            case EditorTool.FILL: {
                const region = this.FillRegion(state, cell);
                region.forEach(c => this.FillCells(state, { x: c.x, y: c.y, width: 1, height: 1 }, PAINT_COLOUR, 0.25));
                if (region.length) {
                    this.ShowLabel(state, cell, `${region.length} cells`);
                }
                break;
            }
            case EditorTool.DROPPER: {
                const brush = this.PickableAt(state, cell);
                this.OutlineCells(state, one, brush ? PICK_COLOUR : 0x888888);
                if (brush) {
                    this.ShowLabel(state, cell, brush.name === DataBrushName.Z_INDEX ? `height ${brush.data}` : DataBrushLabel(brush.name));
                }
                break;
            }
            case EditorTool.DATA_SELECT: {
                const summary = SummariseCell(this.EntriesAt(state, cell));
                if (summary) {
                    this.OutlineCells(state, one, PICK_COLOUR);
                    this.ShowLabel(state, cell, summary);
                }
                break;
            }
        }
    }

    private CellToScreen(state: IEditorState, x: number, y: number): Vec2Like {
        const size = TileSize * state.viewScale;
        return { x: (x - state.viewOffset.x) * size + GridBounds.x, y: (y - state.viewOffset.y) * size + GridBounds.y };
    }

    private FillCells(state: IEditorState, rect: CellRect, colour: number, alpha: number): void {
        const size = TileSize * state.viewScale;
        const pos = this.CellToScreen(state, rect.x, rect.y);
        this.preview.lineStyle(0).beginFill(colour, alpha).drawRect(pos.x, pos.y, rect.width * size, rect.height * size).endFill();
    }

    private OutlineCells(state: IEditorState, rect: CellRect, colour: number): void {
        const size = TileSize * state.viewScale;
        const pos = this.CellToScreen(state, rect.x, rect.y);
        this.preview.lineStyle(2, colour, 0.95, 0).drawRect(pos.x, pos.y, rect.width * size, rect.height * size);
    }

    /** A note beside the cursor's cell, kept inside the grid. */
    private ShowLabel(state: IEditorState, cell: Vec2Like, text: string): void {
        const size = TileSize * state.viewScale;
        const pos = this.CellToScreen(state, cell.x, cell.y);
        this.label.text = text;
        this.label.visible = true;
        const x = pos.x + size + 6 + this.label.width > GridBounds.right ? pos.x - 6 - this.label.width : pos.x + size + 6;
        const y = Math.max(GridBounds.y, Math.min(pos.y + (size - this.label.height) / 2, GridBounds.bottom - this.label.height));
        this.label.position.set(Math.round(x), Math.round(y));
    }
}

/** How painting `brush` on the height layer changes a cell: the height brush sets its number, raise and lower step it by one. Null for any other brush. */
function HeightChangeOf(brush: Brush): HeightChange | null {
    switch (brush.name) {
        case DataBrushName.Z_INDEX:
            return typeof brush.data === "number" ? { height: brush.data } : null;
        case RAISE_BRUSH:
            return { delta: 1 };
        case LOWER_BRUSH:
            return { delta: -1 };
        default:
            return null;
    }
}
