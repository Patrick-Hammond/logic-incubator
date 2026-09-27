import { Scenes } from "../../Constants";
import EditorComponent from "../EditorComponent";
import { El, InjectStyles } from "../ui/dom/Dom";
import EditorOverlay from "../ui/dom/EditorOverlay";

/** Shortcut reminders, as [what, key] pairs. */
const SHORTCUTS: [string, string][] = [
    ["Paint", "Left mouse"],
    ["Erase", "Right mouse"],
    ["Rotate", "R"],
    ["Nudge", "Arrows"],
    ["Edit data", "E"],
    ["Undo", "Ctrl+Z"],
    ["Zoom", "+/- or wheel"],
    ["Save", "S"],
    ["Load", "L"],
    ["Reset", "Ctrl+Q"],
    ["Play", "Enter"]
];

/** The help line under the grid. */
export default class Menu extends EditorComponent {
    /** `titleScene`: see `IDungeonEditorOptions` - its T shortcut is only listed when the game has one. */
    constructor(private readonly titleScene?: string) {
        super();
        this.AddToScene(Scenes.EDITOR);
    }

    protected Create(): void {
        InjectStyles("hb-styles", STYLES);
        const help = EditorOverlay.inst.Slot("help");
        const shortcuts = this.titleScene ? SHORTCUTS.concat([["Title screen", "T"]]) : SHORTCUTS;
        shortcuts.forEach(([what, key]) => {
            const item = help.appendChild(El("span", "hb-item", what + " "));
            item.appendChild(El("kbd", "", key));
        });
    }
}

const STYLES = `
.eo-help { gap: 16px; font-size: 11px; color: var(--ed-muted); white-space: nowrap; }
`;
