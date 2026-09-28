import { Graphics, Text } from "pixi.js";
import { Key } from "@logic-incubator/lib/io/Keyboard";
import { Vec2Like } from "@logic-incubator/lib/math/Geometry";
import { Scenes, TileSize } from "@logic-incubator/engine/Constants";
import { GridBounds } from "../Layout";
import { OpenDataBrushDialog } from "../DataBrushDialog";
import { DataBrushEditorFor } from "../DataBrushEditors";
import EditorComponent from "../EditorComponent";
import AssetMetadataStore from "@logic-incubator/engine/level/AssetMetadata";
import { EffectiveLight, EffectiveSpawner } from "@logic-incubator/engine/level/ImplicitData";
import { Brush, DataBrushValue } from "@logic-incubator/engine/level/LevelFormat";
import { EditorActions, EditorTool, IEditorState, MouseButtonState } from "../stores/EditorStore";
import { Layer, LevelDataActions } from "../stores/LevelDataStore";
import { CellRect, FloodFill, RectCells, SpanRect, TopmostBrushAt } from "../tools/ToolGeometry";

/** What the data-select tool found at a cell, and how to edit it: `editorKey` is what `OpenDataBrushDialog` looks up (an explicit data brush's own name, or "light"/"spawner" for an intrinsic tile value), `target` is the placed `Brush` `SET_DATA` writes the result onto. */
type EditableTarget = { target: Brush; editorKey: string; value: DataBrushValue; context: string };

/** Whether the brush sprite follows the cursor under this tool - only for the tools that paint with it. */
export function ToolShowsBrush(tool: EditorTool): boolean {
    return tool === EditorTool.BRUSH || tool === EditorTool.STAMP || tool === EditorTool.FILL;
}

const PAINT_COLOUR = 0x9b5de5;
const ERASE_COLOUR = 0xff5d5d;
const PICK_COLOUR = 0x4cc9f0;

/** A rectangle being dragged out - painted (or erased) as one undo step when the button's released. */
type RectDrag = { anchor: Vec2Like; erase: boolean; brush: Brush };

/**
 * What a click or drag on the map does under each toolbar tool, and the
 * previews that show it before it happens:
 *
 * - Brush: left paints, right erases, Ctrl+drag stamps a filled rectangle
 *   (right: erases one) - the editor's original mouse controls.
 * - Erase: left erases on the selected layer; Ctrl+drag erases a rectangle.
 * - Data select: click a placed height (an explicit data brush) to edit its value, or a tile with
 *   an effective light/spawner (its own override, or its asset's default) to edit that instead -
 *   see `EditableTargetAt`.
 * - Stamp: drag a rectangle to paint; hold Ctrl for just its border. Right-drag erases one.
 * - Dropper: click a tile (or on a data layer, a data brush) to paint with it.
 * - Fill: flood-fills the region of matching cells on the selected layer, within the visible map.
 * - Move: drag to pan (the view drag itself is `Canvas`'s, like middle-drag).
 *
 * Middle-drag and Space+drag pan under any tool. Rectangles are previewed
 * while dragging and only committed on release, so Escape can cancel them.
 */
export default class Tools extends EditorComponent {
    private preview = new Graphics();
    private previewMask = new Graphics();
    private label: Text;
    private drag: RectDrag = null;
    /** `keyAt` for the fill preview, cached per level data/layer. */
    private fillKeys: { levelData: Brush[]; layerId: number; keys: Map<string, string> } = null;

    constructor() {
        super();
        this.AddToScene(Scenes.EDITOR);
    }

    protected Create(): void {
        this.label = new Text("", { fontFamily: "Arial", fontSize: 12, fill: 0xffffff, stroke: 0x000000, strokeThickness: 3 });
        this.previewMask.beginFill(0xffffff).drawShape(GridBounds).endFill();
        this.preview.mask = this.previewMask;
        this.root.addChild(this.previewMask, this.preview, this.label);

        this.editorStore.Subscribe(this.Render, this);
        this.levelDataStore.Subscribe(() => this.DrawPreview(), this);

        this.game.keyboard.on("keydown", (e: KeyboardEvent) => this.OnKey(e));
        this.game.keyboard.on("keyup", (e: KeyboardEvent) => this.OnKey(e));

        // The cursor is the canvas's, so hand it back while another scene has the stage.
        const scene = this.game.sceneManager.GetScene(Scenes.EDITOR).root;
        scene.on("added", () => this.UpdateCursor());
        scene.on("removed", () => this.SetCursor("inherit"));
        this.UpdateCursor();
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
        if (this.editorStore.state.currentScene !== Scenes.EDITOR) {
            return;
        }
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
                    this.EditPlacedData(state, cell);
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
        if (paint) {
            this.levelDataStore.Dispatch({
                type: LevelDataActions.PAINT,
                data: { brush: paint, viewOffset: state.viewOffset },
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

    private StartRect(state: IEditorState, erase: boolean): void {
        const layer = this.EditableLayer();
        const brush = erase ? layer && { ...state.currentBrush, layerId: layer.id } : this.PaintBrush(state);
        if (brush) {
            this.drag = { anchor: this.MapCell(state), erase, brush };
        }
    }

    private CommitRect(state: IEditorState): void {
        const rect = SpanRect(this.drag.anchor, this.MapCell(state));
        if (this.drag.erase) {
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
                data: { brush: this.drag.brush, cells: RectCells(rect, this.StampBorder(state)) },
                canUndo: true
            });
        }
    }

    private Fill(state: IEditorState, cell: Vec2Like): void {
        const cells = this.FillRegion(state, cell);
        if (cells.length) {
            this.levelDataStore.Dispatch({
                type: LevelDataActions.PAINT_CELLS,
                data: { brush: this.PaintBrush(state), cells },
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

    private EditPlacedData(state: IEditorState, cell: Vec2Like): void {
        const editable = this.EditableTargetAt(state, cell);
        if (!editable) {
            return;
        }
        OpenDataBrushDialog(editable.editorKey, editable.value, editable.context).then(value => {
            if (value != null) {
                this.levelDataStore.Dispatch({ type: LevelDataActions.SET_DATA, data: { target: editable.target, value }, canUndo: true });
            }
        });
    }

    // queries

    /**
     * The picked brush, to paint onto the selected layer - or null if there's nothing to paint: no
     * brush, the read-only layer, or a brush of the wrong kind for the layer (a data brush on a tile
     * layer, or a tile on a data layer - e.g. just after adding a layer of the other kind).
     */
    private PaintBrush(state: IEditorState): Brush | null {
        const layer = this.EditableLayer();
        const name = state.currentBrush.name;
        if (!layer || name === "") {
            return null;
        }
        const isDataBrush = state.dataBrushes.some(db => db.name === name);
        return isDataBrush === layer.isData ? { ...state.currentBrush, layerId: layer.id } : null;
    }

    /** The selected layer, if it can be painted on. */
    private EditableLayer(): Layer | undefined {
        const layer = this.editorStore.SelectedLayer;
        return layer && !layer.readOnly ? layer : undefined;
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

    /** What a fill at `cell` would paint: the matching region on the selected layer, or nothing if there's nothing to paint (see `PaintBrush`) or the region's already this brush. */
    private FillRegion(state: IEditorState, cell: Vec2Like): Vec2Like[] {
        const brush = this.PaintBrush(state);
        if (!brush) {
            return [];
        }
        const layer = this.EditableLayer();
        const name = brush.name;
        const levelData = this.levelDataStore.state.levelData;
        if (!this.fillKeys || this.fillKeys.levelData !== levelData || this.fillKeys.layerId !== layer.id) {
            // Last painted wins, as it's the one drawn on top.
            const keys = new Map<string, string>();
            levelData.forEach(brush => {
                if (brush.layerId === layer.id) {
                    keys.set(brush.position.x + "," + brush.position.y, brush.name);
                }
            });
            this.fillKeys = { levelData, layerId: layer.id, keys };
        }
        const keys = this.fillKeys.keys;
        const keyAt = (x: number, y: number) => keys.get(x + "," + y) || "";
        if (keyAt(cell.x, cell.y) === name) {
            return [];
        }
        return FloodFill(cell, this.VisibleCells(state), keyAt);
    }

    /** The dropper samples the selected layer's kind: tiles from tile layers, data brushes from data layers. */
    private PickableAt(state: IEditorState, cell: Vec2Like): Brush | undefined {
        const selected = this.editorStore.SelectedLayer;
        const wantData = selected != null && selected.isData && !selected.readOnly;
        const layers = state.layers.filter(layer => !layer.readOnly && layer.isData === wantData);
        return TopmostBrushAt(this.levelDataStore.state.levelData, layers, cell);
    }

    /** The data brush on top at `cell` (on any visible data layer) whose value has a dialog. */
    private EditableDataAt(state: IEditorState, cell: Vec2Like): Brush | undefined {
        const layers = state.layers.filter(layer => layer.isData && !layer.readOnly);
        return TopmostBrushAt(this.levelDataStore.state.levelData, layers, cell, brush => DataBrushEditorFor(brush.name) != null);
    }

    /**
     * What the data-select tool would edit at `cell`: an explicit data brush (height, on the
     * "attributes" layer) if there is one there, else the topmost tile (on any visible tile layer)
     * with an effective light or spawner - its own override, or its asset's default (see
     * `EffectiveLight`/`EffectiveSpawner`) - to edit, since neither is a paintable data brush any more.
     */
    private EditableTargetAt(state: IEditorState, cell: Vec2Like): EditableTarget | undefined {
        const explicit = this.EditableDataAt(state, cell);
        if (explicit) {
            const layer = state.layers.find(l => l.id === explicit.layerId);
            return {
                target: explicit,
                editorKey: explicit.name,
                value: explicit.data,
                context: `At ${explicit.position.x}, ${explicit.position.y} on “${layer ? layer.name : explicit.layerId}”.`
            };
        }

        const tileLayers = state.layers.filter(layer => !layer.isData);
        const implicit = TopmostBrushAt(this.levelDataStore.state.levelData, tileLayers, cell, brush => this.IntrinsicValueOf(brush) != null);
        const found = implicit && this.IntrinsicValueOf(implicit);
        return (
            found && {
                target: implicit,
                editorKey: found.kind,
                value: found.value,
                context: `“${implicit.name}” at ${implicit.position.x}, ${implicit.position.y}.`
            }
        );
    }

    /** `brush`'s effective light or spawner (see `EffectiveLight`/`EffectiveSpawner`), tagged with which kind it is - `EditableTargetAt` needs both to pick `OpenDataBrushDialog`'s editor. */
    private IntrinsicValueOf(brush: Brush): { kind: "light" | "spawner"; value: DataBrushValue } | undefined {
        const meta = AssetMetadataStore.inst.Get(brush.name);
        const light = EffectiveLight(brush, meta);
        if (light) {
            return { kind: "light", value: light };
        }
        const spawner = EffectiveSpawner(brush, meta);
        return spawner ? { kind: "spawner", value: spawner } : undefined;
    }

    private Key(key: Key): boolean {
        return !!this.game.keyboard.KeyPressed(key);
    }

    // feedback

    private UpdateCursor(): void {
        const state = this.editorStore.state;
        if (!this.game.sceneManager.GetScene(Scenes.EDITOR).root.parent) {
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
            cursor = state.brushVisible && this.EditableTargetAt(state, this.MapCell(state)) ? "pointer" : "default";
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
                    this.ShowLabel(state, cell, brush.name);
                }
                break;
            }
            case EditorTool.DATA_SELECT: {
                const editable = this.EditableTargetAt(state, cell);
                if (editable) {
                    this.OutlineCells(state, one, PICK_COLOUR);
                    this.ShowLabel(state, cell, "Edit " + editable.target.name);
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
