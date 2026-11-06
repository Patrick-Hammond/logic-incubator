import EditorComponent from "../EditorComponent";
import { IEditorState } from "../stores/EditorStore";
import { El, InjectStyles } from "../ui/dom/Dom";
import EditorOverlay from "../ui/dom/EditorOverlay";

/** Shortcut reminders, as [what, key] pairs. */
const SHORTCUTS: [string, string][] = [
    ["Paint", "Left mouse"],
    ["Erase", "Right mouse"],
    ["Rotate", "R"],
    ["Nudge", "Arrows"],
    ["Edit data", "E"],
    ["Quests", "Q"],
    ["Undo", "Ctrl+Z"],
    ["Zoom", "+/- or wheel"],
    ["Save", "S"],
    ["Load", "L"],
    ["Reset", "Ctrl+Q"],
    ["Play", "Enter"]
];

/** The help line under the grid: the level's name (see `IEditorState.levelName`), then the shortcuts. */
export default class Menu extends EditorComponent {
    private levelName: HTMLElement;

    /** `titleScene`: see `IDungeonEditorOptions` - its T shortcut is only listed when the game has one. */
    constructor(private readonly titleScene?: string) {
        super();
    }

    protected OnInitialise(): void {
        InjectStyles("hb-styles", STYLES);
        const help = EditorOverlay.inst.Slot("help");
        this.levelName = help.appendChild(El("span", "hb-level"));
        this.Own(() => this.levelName.remove());
        this.ShowLevelName(this.editorStore.state.levelName);
        this.Own(this.editorStore.Subscribe(this.Render, this));
        const shortcuts = this.titleScene ? SHORTCUTS.concat([["Title screen", "T"]]) : SHORTCUTS;
        const items = shortcuts.map(([what, key]) => {
            const item = help.appendChild(El("span", "hb-item", what + " "));
            item.appendChild(El("kbd", "", key));
            return item;
        });
        this.Own(() => items.forEach(item => item.remove()));
    }

    private Render(prevState: IEditorState, state: IEditorState): void {
        if (prevState.levelName !== state.levelName) {
            this.ShowLevelName(state.levelName);
        }
    }

    private ShowLevelName(name: string): void {
        this.levelName.textContent = name || "Unnamed level";
        this.levelName.classList.toggle("hb-unnamed", !name);
        this.levelName.title = name ? "The level's name - S saves it under another" : "S saves the level under a name";
    }
}

const STYLES = `
.eo-help { gap: 16px; font-size: 11px; color: var(--ed-muted); white-space: nowrap; }
.hb-level { flex: 0 1 auto; min-width: 0; max-width: 220px; overflow: hidden; text-overflow: ellipsis; font-weight: bold; color: var(--ed-text-strong); pointer-events: auto; }
.hb-level.hb-unnamed { font-weight: normal; font-style: italic; color: var(--ed-faint); }
`;
