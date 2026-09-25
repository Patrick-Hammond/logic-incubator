import {AssetPath, Scenes} from "../../../Constants";
import EditorComponent from "../../EditorComponent";
import {EditableLayerCount, EditorActions, IEditorState, MaxEditableLayers} from "../../stores/EditorStore";
import {Layer, LevelDataActions} from "../../stores/LevelDataStore";
import {IsFormDialogOpen, OpenFormDialog} from "../../ui/dialog/FormDialog";
import {ButtonEl, El, InjectStyles} from "../../ui/dom/Dom";
import EditorOverlay from "../../ui/dom/EditorOverlay";

/** One list row's elements, reused across renders (so a double-click's two clicks land on the same element even though the first re-renders the list). */
type LayerRow = { row: HTMLElement; eyeButton: HTMLButtonElement; eye: HTMLImageElement; badge: HTMLElement; name: HTMLElement };

function Icon(name: string): HTMLImageElement {
    const img = document.createElement("img");
    img.src = AssetPath + "icons/" + name + ".png";
    img.alt = "";
    return img;
}

/**
 * The layer list and its toolbar: add tile/data layers, remove, rename, and
 * reorder. The list is first to last from the top, so later layers (drawn on
 * top on the map) are further down; it scrolls once there are more layers
 * than fit.
 */
export default class Layers extends EditorComponent {
    private list: HTMLElement;
    private rows: LayerRow[] = [];
    private countText: HTMLElement;
    private addButton: HTMLButtonElement;
    private addDataButton: HTMLButtonElement;
    private removeButton: HTMLButtonElement;
    private renameButton: HTMLButtonElement;
    private upButton: HTMLButtonElement;
    private downButton: HTMLButtonElement;
    private selectedIndex = -1;

    constructor() {
        super();
        this.AddToScene(Scenes.EDITOR);
    }

    protected Create(): void {
        InjectStyles("ly-styles", STYLES);
        this.editorStore.Subscribe(this.Render, this);

        const panel = El("div", "ed-panel ly-panel");
        const header = panel.appendChild(El("div", "ed-panel-header"));
        header.appendChild(El("span", "ed-panel-title", "Layers"));
        this.countText = header.appendChild(El("span", "ed-panel-note"));
        this.countText.title = "Editable layers in use, of the most allowed";
        header.appendChild(El("span", "ly-spacer"));

        this.addButton = this.ToolButton(header, "plus", "Add tile layer", () => this.AddLayer(EditorActions.ADD_LAYER));
        this.addDataButton = this.ToolButton(header, "data", "Add data layer", () => this.AddLayer(EditorActions.ADD_DATA_LAYER));
        this.removeButton = this.ToolButton(header, "minus", "Remove layer", () => this.RemoveLayer());
        this.renameButton = this.ToolButton(header, "edit", "Rename layer (or double-click it)", () => this.RenameLayer());
        this.upButton = this.ToolButton(header, "arrow-up", "Move layer up", () => {
            this.editorStore.Dispatch({ type: EditorActions.MOVE_LAYER_UP });
            this.levelDataStore.Dispatch({ type: LevelDataActions.REFRESH });
        });
        this.downButton = this.ToolButton(header, "arrow-down", "Move layer down", () => {
            this.editorStore.Dispatch({ type: EditorActions.MOVE_LAYER_DOWN });
            this.levelDataStore.Dispatch({ type: LevelDataActions.REFRESH });
        });

        this.list = panel.appendChild(El("div", "ly-list ed-scroll"));
        this.list.setAttribute("role", "listbox");
        EditorOverlay.inst.Slot("layers").appendChild(panel);

        // render initial
        this.editorStore.Dispatch({ type: EditorActions.REFRESH });
    }

    private Render(prevState: IEditorState, state: IEditorState): void {
        if (prevState.layers !== state.layers) {
            this.UpdateList(state.layers);
        }

        // enforce at least 1 editable layer (the read-only implicit layer is always there, so doesn't count)
        if (EditableLayerCount(state.layers) === 0) {
            this.editorStore.Dispatch({ type: EditorActions.ADD_LAYER });
        }
    }

    private UpdateList(layers: Layer[]): void {
        while (this.rows.length < layers.length) {
            this.rows.push(this.CreateRow(this.rows.length));
        }
        this.rows.forEach((row, index) => (row.row.style.display = index < layers.length ? "" : "none"));

        layers.forEach((layer, index) => {
            const row = this.rows[index];
            const kind = layer.readOnly ? "auto" : layer.isData ? "data" : "tile";
            row.name.textContent = layer.name;
            row.row.title = layer.name;
            row.row.setAttribute("aria-selected", String(layer.selected));
            row.row.classList.toggle("ly-hidden", !layer.visible);
            row.badge.textContent = kind;
            row.badge.className = "ly-badge ly-" + kind;
            const eyeIcon = AssetPath + "icons/" + (layer.visible ? "eye" : "eye-slash") + ".png";
            if (row.eye.getAttribute("src") !== eyeIcon) {
                row.eye.src = eyeIcon;
            }
            row.eyeButton.title = layer.visible ? "Hide layer" : "Show layer";
        });

        const selectedIndex = layers.findIndex(layer => layer.selected);
        const selected = layers[selectedIndex];
        const editable = selected != null && !selected.readOnly;
        const canAdd = EditableLayerCount(layers) < MaxEditableLayers;
        this.addButton.disabled = this.addDataButton.disabled = !canAdd;
        this.removeButton.disabled = !this.CanRemove(layers, selected);
        this.renameButton.disabled = !editable;
        this.upButton.disabled = !editable || selectedIndex <= 0;
        this.downButton.disabled = !editable || selectedIndex >= layers.length - 1;
        this.countText.textContent = EditableLayerCount(layers) + "/" + MaxEditableLayers;

        if (selectedIndex !== this.selectedIndex) {
            this.selectedIndex = selectedIndex;
            if (selected) {
                this.rows[selectedIndex].row.scrollIntoView({ block: "nearest" });
            }
        }
    }

    private CreateRow(index: number): LayerRow {
        const row = this.list.appendChild(El("div", "ly-row"));
        row.setAttribute("role", "option");
        const eyeButton = row.appendChild(ButtonEl("ed-icon-button ly-eye"));
        const eye = eyeButton.appendChild(Icon("eye"));
        const badge = row.appendChild(El("span", "ly-badge"));
        const name = row.appendChild(El("span", "ly-name"));

        row.addEventListener("click", () => {
            const layer = this.editorStore.state.layers[index];
            // Re-selecting would reset the current brush for nothing.
            if (layer && !layer.selected) {
                this.editorStore.Dispatch({ type: EditorActions.SELECT_LAYER, data: { layer } });
            }
        });
        // The first click of the two has already selected it.
        row.addEventListener("dblclick", () => this.RenameLayer());
        eyeButton.addEventListener("click", e => {
            e.stopPropagation();
            this.editorStore.Dispatch({ type: EditorActions.TOGGLE_LAYER_VISIBILITY, data: { layer: this.editorStore.state.layers[index] } });
            this.levelDataStore.Dispatch({ type: LevelDataActions.REFRESH });
        });
        eyeButton.addEventListener("dblclick", e => e.stopPropagation());

        return { row, eyeButton, eye, badge, name };
    }

    private ToolButton(parent: HTMLElement, icon: string, title: string, onClick: () => void): HTMLButtonElement {
        const button = parent.appendChild(ButtonEl("ed-icon-button", undefined, title));
        button.setAttribute("aria-label", title);
        button.appendChild(Icon(icon));
        button.addEventListener("click", onClick);
        return button;
    }

    private AddLayer(type: EditorActions.ADD_LAYER | EditorActions.ADD_DATA_LAYER): void {
        if (EditableLayerCount(this.editorStore.state.layers) < MaxEditableLayers) {
            this.editorStore.Dispatch({ type });
        }
    }

    /** Never the read-only layer, nor the last tile layer. */
    private CanRemove(layers: Layer[], selectedLayer: Layer | undefined): boolean {
        const spriteLayers = layers.filter(layer => layer.isData === false);
        return selectedLayer != null && !selectedLayer.readOnly && (spriteLayers.length > 1 || selectedLayer.isData);
    }

    private RemoveLayer(): void {
        const selectedLayer = this.editorStore.SelectedLayer;
        if (!this.CanRemove(this.editorStore.state.layers, selectedLayer)) {
            return;
        }
        this.editorStore.Dispatch({ type: EditorActions.REMOVE_LAYER });
        // Not layers[0] - that's the read-only implicit layer, which leaves nothing to paint with.
        const layers = this.editorStore.state.layers;
        this.editorStore.Dispatch({
            type: EditorActions.SELECT_LAYER,
            data: { layer: layers.find(layer => !layer.readOnly) || layers[0] }
        });
        this.levelDataStore.Dispatch({ type: LevelDataActions.ERASE_LAYER, data: { destLayer: selectedLayer } });
    }

    private RenameLayer(): void {
        const layer = this.editorStore.SelectedLayer;
        if (!layer || layer.readOnly || IsFormDialogOpen()) {
            return;
        }
        OpenFormDialog({
            title: "Rename layer",
            fields: [{ type: "text", key: "name", label: "Name" }],
            values: { name: layer.name },
            validate: form => (String(form.name).trim() ? null : "Enter a name.")
        }).then(form => {
            const selected = this.editorStore.SelectedLayer;
            if (form && selected && selected.id === layer.id) {
                this.editorStore.Dispatch({ type: EditorActions.RENAME_LAYER, data: { name: String(form.name).trim() } });
            }
        });
    }
}

const STYLES = `
.ly-panel .ed-panel-header .ed-icon-button { width: 22px; height: 22px; }
.ly-spacer { flex: 1; }
.ly-list { flex: 1 1 auto; min-height: 0; padding: 4px 0; }
.ly-row {
    display: flex; align-items: center; gap: 6px; height: 22px; padding: 0 8px 0 4px; box-sizing: border-box;
    border-left: 2px solid transparent; font-size: 12px; cursor: pointer;
}
.ly-row:hover { background: rgba(255, 255, 255, 0.04); }
.ly-row[aria-selected=true] { background: var(--ed-accent-bg); border-left-color: var(--ed-accent); color: var(--ed-text-strong); }
.ly-row .ly-eye { width: 20px; height: 20px; }
.ly-row .ly-eye img { opacity: 0.75; }
.ly-row.ly-hidden .ly-name, .ly-row.ly-hidden .ly-badge { opacity: 0.45; }
.ly-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ly-badge {
    flex: 0 0 32px; padding: 1px 0; border-radius: 3px;
    font-size: 9px; font-weight: bold; letter-spacing: 0.05em; text-transform: uppercase; text-align: center;
}
.ly-tile { color: #c9c9d1; background: #3a3a42; }
.ly-data { color: #e2cffc; background: #4a3470; }
.ly-auto { color: #b8ecf7; background: #24505c; }
`;
