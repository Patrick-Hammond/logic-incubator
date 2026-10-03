import { Key } from "@logic-incubator/lib/io/Keyboard";
import { AssetPath } from "@logic-incubator/engine/Constants";
import EditorComponent from "../EditorComponent";
import { EditorActions, EditorTool, IEditorState } from "../stores/EditorStore";
import { ButtonEl, El, InjectStyles } from "../ui/dom/Dom";
import EditorOverlay from "../ui/dom/EditorOverlay";

type ToolInfo = { tool: EditorTool; icon: string; name: string; key: Key; keyLabel: string; hint: string };

/** Top to bottom. What each does on the map is `Tools`'. Shortcut letters avoid the editor's existing keys (E edits data, H/V flip, R rotates, S saves...). */
const TOOLS: ToolInfo[] = [
    { tool: EditorTool.BRUSH, icon: "brush", name: "Brush", key: Key.B, keyLabel: "B", hint: "Paint the brush. Right-click erases; Ctrl+drag paints a rectangle." },
    { tool: EditorTool.ERASE, icon: "eraser", name: "Erase", key: Key.X, keyLabel: "X", hint: "Erase from the selected layer. Ctrl+drag erases a rectangle." },
    {
        tool: EditorTool.DATA_SELECT,
        icon: "arrow",
        name: "Data select",
        key: Key.A,
        keyLabel: "A",
        hint: "Click a placed light, spawner or height to edit its value."
    },
    {
        tool: EditorTool.STAMP,
        icon: "stamp",
        name: "Stamp",
        key: Key.U,
        keyLabel: "U",
        hint: "Drag out a rectangle of the brush; hold Ctrl for just its border. Right-drag erases a rectangle. Esc cancels."
    },
    {
        tool: EditorTool.DROPPER,
        icon: "dropper",
        name: "Dropper",
        key: Key.I,
        keyLabel: "I",
        hint: "Click a tile to paint with it (on a data layer, a data brush - with its value)."
    },
    {
        tool: EditorTool.FILL,
        icon: "bucket",
        name: "Fill",
        key: Key.G,
        keyLabel: "G",
        hint: "Fill the area of matching cells under the cursor on the selected layer, up to the edge of the view."
    },
    { tool: EditorTool.MOVE, icon: "arrows", name: "Move", key: Key.M, keyLabel: "M", hint: "Drag to move the view. Middle-drag or Space+drag also move it with any tool." }
];

/** The tool strip at the editor's right edge: picks the current `EditorTool`, by click or shortcut key. */
export default class Toolbar extends EditorComponent {
    private buttons: { [tool: string]: HTMLButtonElement } = {};

    protected OnInitialise(): void {
        InjectStyles("tb-styles", STYLES);

        const panel = El("div", "ed-panel tb-panel");
        panel.setAttribute("role", "toolbar");
        panel.setAttribute("aria-orientation", "vertical");
        panel.setAttribute("aria-label", "Tools");
        TOOLS.forEach(info => {
            const button = panel.appendChild(ButtonEl("tb-tool", undefined, `${info.name} (${info.keyLabel})\n${info.hint}`));
            button.setAttribute("aria-label", info.name);
            const icon = button.appendChild(document.createElement("img"));
            icon.src = AssetPath + "icons/" + info.icon + ".png";
            icon.alt = "";
            button.appendChild(El("span", "tb-key", info.keyLabel));
            button.addEventListener("click", () => this.SetTool(info.tool));
            this.buttons[info.tool] = button;
        });
        EditorOverlay.inst.Slot("tools").appendChild(panel);
        this.Own(() => panel.remove());

        this.ListenWhileShown(this.game.keyboard, "keydown", (e: KeyboardEvent) => {
            if (e.ctrlKey || e.altKey || e.metaKey) {
                return;
            }
            const info = TOOLS.find(t => t.key === e.keyCode);
            if (info) {
                this.SetTool(info.tool);
            }
        });

        this.Own(this.editorStore.Subscribe(this.Render, this));
        this.Highlight(this.editorStore.state.tool);
    }

    private SetTool(tool: EditorTool): void {
        if (tool !== this.editorStore.state.tool) {
            this.editorStore.Dispatch({ type: EditorActions.SET_TOOL, data: { tool } });
        }
    }

    private Render(prevState: IEditorState, state: IEditorState): void {
        if (prevState.tool !== state.tool) {
            this.Highlight(state.tool);
        }
    }

    private Highlight(tool: EditorTool): void {
        TOOLS.forEach(info => this.buttons[info.tool].setAttribute("aria-pressed", String(info.tool === tool)));
    }
}

const STYLES = `
.tb-panel { flex-direction: column; align-items: center; gap: 3px; padding: 4px 0; }
.tb-tool {
    position: relative; display: flex; align-items: center; justify-content: center;
    width: 32px; height: 32px; padding: 0; box-sizing: border-box;
    background: none; border: 1px solid transparent; border-radius: 4px; cursor: pointer;
}
.tb-tool img { width: 20px; height: 20px; opacity: 0.7; }
.tb-tool:hover { background: var(--ed-button-hover); border-color: var(--ed-button-border); }
.tb-tool:hover img { opacity: 1; }
.tb-tool[aria-pressed=true] { background: var(--ed-accent-bg); border-color: var(--ed-accent); }
.tb-tool[aria-pressed=true] img { opacity: 1; }
.tb-key {
    position: absolute; right: 2px; bottom: 0; font-size: 8px; line-height: 10px; font-weight: bold;
    color: var(--ed-faint); pointer-events: none;
}
.tb-tool[aria-pressed=true] .tb-key { color: var(--ed-link); }
`;
