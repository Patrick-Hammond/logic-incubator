import { Key } from "@logic-incubator/lib/io/Keyboard";
import { Vec2Like } from "@logic-incubator/lib/math/Geometry";
import { TileSize } from "@logic-incubator/engine/Constants";
import { DataBrushName, DataBrushValue } from "@logic-incubator/engine/level/LevelFormat";
import { CellEntry } from "../CellEntries";
import { OpenDataBrushDialog } from "../DataBrushDialog";
import { DataBrushEditorFor } from "../DataBrushEditors";
import { DescribeDataValue } from "../DataLabels";
import EditorComponent from "../EditorComponent";
import { HeightColour } from "../Heights";
import { GridBounds } from "../Layout";
import { ActiveAttributeType, DataBrushLabel, EditorActions, IEditorState, IsHeightLayer } from "../stores/EditorStore";
import { LevelDataActions, LevelDataState } from "../stores/LevelDataStore";
import { IsFormDialogOpen } from "../ui/dialog/FormDialog";
import { ButtonEl, El, InjectStyles } from "../ui/dom/Dom";
import EditorOverlay from "../ui/dom/EditorOverlay";
import { EditorCellEntries } from "./CellLookups";

/** The swatch colour of a door, which a tile carries of its own and has no data brush to borrow one from - the map's (see `Canvas`). */
const DOOR_COLOUR = 0x4cc9f0;
/** A height of 0 isn't drawn on the heatmap at all; its swatch is the panel's well instead. */
const GROUND_COLOUR = 0x1f1f23;
const WIDTH = 236;
/** The gap between the inspected cell and the panel beside it. */
const GAP = 8;

/**
 * The cell inspector: a small panel beside a cell of the map, opened by clicking it with the data arrow (see `Tools`),
 * listing everything on it - each data brush painted there, each tile's own light, spawner, pickup or door lock covering
 * it, and its height - with Edit for each that has a value to edit and Delete for each that can go on its own (a tile's
 * own value goes with the tile, so it has none; deleting a height flattens the cell to 0). The active attribute type's
 * row is marked. It follows its cell as the view moves, hides while the cell's off the map, and closes on its ×, Esc,
 * a click on its cell or an empty one, or a tile layer being selected (see `IEditorState.inspectedCell`).
 */
export default class CellInspector extends EditorComponent {
    private panel: HTMLElement;
    private title: HTMLElement;
    private list: HTMLElement;

    protected OnInitialise(): void {
        InjectStyles("ci-styles", STYLES);
        this.panel = El("div", "ed-panel ci-panel");
        this.panel.setAttribute("role", "dialog");
        this.panel.style.width = WIDTH + "px";
        const header = this.panel.appendChild(El("div", "ed-panel-header"));
        this.title = header.appendChild(El("span", "ed-panel-title ci-title"));
        const close = header.appendChild(ButtonEl("ed-icon-button ci-close", "×", "Close (Esc)"));
        close.setAttribute("aria-label", "Close");
        close.addEventListener("click", () => this.Close());
        this.list = this.panel.appendChild(El("div", "ci-list"));
        EditorOverlay.inst.Slot("float").appendChild(this.panel);
        this.Own(() => this.panel.remove());

        this.Own(this.editorStore.Subscribe(this.OnEditorChange, this));
        this.Own(this.levelDataStore.Subscribe(this.OnLevelChange, this));
        this.ListenWhileShown(this.game.keyboard, "keydown", (e: KeyboardEvent) => {
            if (e.keyCode === Key.Escape && this.editorStore.state.inspectedCell && !IsFormDialogOpen()) {
                this.Close();
            }
        });
        this.Render();
    }

    private OnEditorChange(prevState: IEditorState, state: IEditorState): void {
        if (
            prevState.inspectedCell !== state.inspectedCell ||
            prevState.viewOffset !== state.viewOffset ||
            prevState.viewScale !== state.viewScale ||
            prevState.layers !== state.layers ||
            prevState.currentBrush.name !== state.currentBrush.name ||
            prevState.dataBrushes !== state.dataBrushes
        ) {
            this.Render();
        }
    }

    private OnLevelChange(prevState: LevelDataState, state: LevelDataState): void {
        if (prevState.levelData !== state.levelData) {
            this.Render();
        }
    }

    private Close(): void {
        this.editorStore.Dispatch({ type: EditorActions.INSPECT_CELL, data: { position: undefined } });
    }

    private Render(): void {
        const state = this.editorStore.state;
        const cell = state.inspectedCell;
        if (!cell) {
            this.panel.style.display = "none";
            return;
        }
        const entries = EditorCellEntries(this.levelDataStore.state.levelData, state.layers, cell);
        this.title.textContent = `Cell ${cell.x}, ${cell.y}`;
        this.list.textContent = "";
        if (entries.length === 1) {
            this.list.appendChild(El("div", "ci-empty", "Nothing painted here."));
        }
        entries.forEach(entry => this.list.appendChild(this.Row(entry, cell, state)));
        this.Place(cell, state);
    }

    /** Beside the cell - right of it, or left where there's no room - kept on the map; hidden while the cell's scrolled off it. */
    private Place(cell: Vec2Like, state: IEditorState): void {
        const size = TileSize * state.viewScale;
        const left = (cell.x - state.viewOffset.x) * size + GridBounds.x;
        const top = (cell.y - state.viewOffset.y) * size + GridBounds.y;
        if (!GridBounds.contains(left + size / 2, top + size / 2)) {
            this.panel.style.display = "none";
            return;
        }
        this.panel.style.display = "";
        const height = this.panel.offsetHeight;
        let x = left + size + GAP;
        if (x + WIDTH > GridBounds.right) {
            x = left - GAP - WIDTH;
        }
        x = Math.max(GridBounds.x, x);
        const y = Math.max(GridBounds.y, Math.min(top, GridBounds.bottom - height));
        this.panel.style.left = Math.round(x) + "px";
        this.panel.style.top = Math.round(y) + "px";
    }

    private Row(entry: CellEntry, cell: Vec2Like, state: IEditorState): HTMLElement {
        const look = this.Describe(entry, state);
        const row = El("div", "ci-row");
        row.classList.toggle("ci-active", look.active);
        const chip = row.appendChild(El("span", "ci-chip"));
        chip.style.background = "#" + ("00000" + look.colour.toString(16)).slice(-6);
        const text = row.appendChild(El("div", "ci-text"));
        text.appendChild(El("div", "ci-name", look.name));
        if (look.detail) {
            const detail = text.appendChild(El("div", "ci-detail", look.detail));
            detail.title = look.detail;
        }
        const edit = this.EditAction(entry, cell);
        if (edit) {
            const button = row.appendChild(ButtonEl("ed-button ci-button", "Edit", "Edit its value"));
            button.addEventListener("click", edit);
        }
        const remove = this.DeleteAction(entry, cell);
        if (remove) {
            const button = row.appendChild(ButtonEl("ed-button ci-button ci-delete", "Delete", "Take it off this cell"));
            button.addEventListener("click", remove);
        } else if (entry.type === "tile") {
            row.title = `The ${entry.kind} is “${entry.target.name}”'s own: erase the tile to take it away.`;
        }
        return row;
    }

    /** A row's swatch, name and one line about it, and whether it's what's being painted - the active type, or the height on the height layer. */
    private Describe(entry: CellEntry, state: IEditorState): { colour: number; name: string; detail: string; active: boolean } {
        const colourOf = (name: string) => {
            const dataBrush = state.dataBrushes.find(db => db.name === name);
            return dataBrush ? dataBrush.colour : 0xffffff;
        };
        switch (entry.type) {
            case "data":
                return {
                    colour: colourOf(entry.target.name),
                    name: DataBrushLabel(entry.target.name),
                    // Player start, collision and an exit have nothing to say beyond their name.
                    detail: DataBrushEditorFor(entry.target.name) ? DescribeDataValue(entry.target.data).text : "",
                    active: entry.target.name === ActiveAttributeType(state)
                };
            case "tile": {
                const colour = entry.kind === "door" ? DOOR_COLOUR : colourOf(entry.kind);
                const about = entry.replaced ? "replaced by the painted light" : DescribeDataValue(entry.value).text;
                return { colour, name: entry.kind, detail: (about ? about + " · " : "") + entry.target.name, active: false };
            }
            default:
                return {
                    colour: entry.height === 0 ? GROUND_COLOUR : HeightColour(entry.height),
                    name: "height",
                    detail: entry.height === 0 ? "0 - the ground" : String(entry.height),
                    active: IsHeightLayer(state.layers.find(layer => layer.selected))
                };
        }
    }

    /** What the row's Edit does - its value's popup, saved as one undo step - or null if it has no value to edit (player start, collision, an exit). */
    private EditAction(entry: CellEntry, cell: Vec2Like): (() => void) | null {
        const quests = this.levelDataStore.state.quests;
        const at = `At ${cell.x}, ${cell.y}.`;
        switch (entry.type) {
            case "data":
                return DataBrushEditorFor(entry.target.name) ? () => this.EditData(entry.target.name, entry.target.data, at, entry.target) : null;
            case "tile":
                return () => this.EditData(entry.kind, entry.value, `“${entry.target.name}” at ${entry.target.position.x}, ${entry.target.position.y}.`, entry.target);
            default:
                return () =>
                    OpenDataBrushDialog(DataBrushName.Z_INDEX, entry.height, at, quests).then(value => {
                        if (typeof value === "number") {
                            this.levelDataStore.Dispatch({ type: LevelDataActions.SET_HEIGHT, data: { cells: [cell], heightChange: { height: value } }, canUndo: true });
                        }
                    });
        }
    }

    private EditData(editorKey: string, value: DataBrushValue, context: string, target: CellEntry["target"]): void {
        OpenDataBrushDialog(editorKey, value, context, this.levelDataStore.state.quests).then(edited => {
            if (edited != null) {
                this.levelDataStore.Dispatch({ type: LevelDataActions.SET_DATA, data: { target, value: edited }, canUndo: true });
            }
        });
    }

    /** What the row's Delete does, as one undo step - or null for what can't go on its own: a tile's own value, or a height that's 0 already. */
    private DeleteAction(entry: CellEntry, cell: Vec2Like): (() => void) | null {
        switch (entry.type) {
            case "data":
                return () => this.levelDataStore.Dispatch({ type: LevelDataActions.REMOVE, data: { target: entry.target }, canUndo: true });
            case "height":
                return entry.height !== 0
                    ? () => this.levelDataStore.Dispatch({ type: LevelDataActions.SET_HEIGHT, data: { cells: [cell], heightChange: { height: 0 } }, canUndo: true })
                    : null;
            default:
                return null;
        }
    }
}

const STYLES = `
.ci-panel { position: absolute; max-height: 320px; }
.ci-panel .ed-panel-header { min-height: 28px; padding: 2px 4px 2px 10px; }
.ci-title { flex: 1; }
.ci-close { font-size: 16px; line-height: 1; color: var(--ed-muted); }
.ci-list { padding: 4px 0; overflow-y: auto; }
.ci-empty { padding: 4px 10px 6px; font-size: 11px; color: var(--ed-faint); }
.ci-row { display: flex; align-items: center; gap: 6px; padding: 3px 6px 3px 8px; border-left: 2px solid transparent; }
.ci-row.ci-active { background: var(--ed-accent-bg); border-left-color: var(--ed-accent); }
.ci-chip { flex: 0 0 auto; width: 12px; height: 12px; border: 1px solid rgba(255, 255, 255, 0.35); border-radius: 2px; }
.ci-text { flex: 1; min-width: 0; }
.ci-name { font-size: 12px; color: var(--ed-text-strong); }
.ci-detail { font-size: 11px; color: var(--ed-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ci-button { flex: 0 0 auto; padding: 1px 6px; font-size: 11px; }
.ci-delete:hover { border-color: var(--ed-error); color: var(--ed-error); }
`;
