import Game from "../../../../_lib/game/Game";
import { EditorHeight, EditorWidth, GridBounds } from "../../../Constants";
import { El, InjectStyles, InjectTheme } from "./Dom";

export type OverlaySlot = "brushes" | "selected" | "layers" | "help";

/**
 * Hosts the editor's DOM side panels (brushes, selected brush, layers) and
 * help line over the Pixi canvas, in the canvas's own 1280x720 coordinates:
 * the root is sized to the stage and scaled/positioned to wherever
 * `BorderResizeStrategy` has put the canvas, so panels can be laid out
 * against `GridBounds` like the Pixi views are.
 *
 * The root lets pointer events through (only the panels themselves take
 * them), so the grid underneath stays paintable. Buttons inside never take
 * focus from a click - a focused button would be re-pressed by Enter/Space,
 * which the editor's document-level shortcuts also act on.
 *
 * Each view fills its own named slot; the slots are made up front, so the
 * panels' order doesn't depend on which view happens to be created first.
 */
export default class EditorOverlay {
    private static _inst: EditorOverlay;
    public static get inst(): EditorOverlay {
        if (!EditorOverlay._inst) {
            EditorOverlay._inst = new EditorOverlay();
        }
        return EditorOverlay._inst;
    }

    private root: HTMLElement;
    private slots: { [slot: string]: HTMLElement } = {};

    private constructor() {
        InjectTheme();
        InjectStyles("eo-styles", STYLES);

        this.root = El("div", "eo-root");
        this.root.style.width = EditorWidth + "px";
        this.root.style.height = EditorHeight + "px";

        const sidebar = El("div", "eo-sidebar");
        sidebar.style.left = GridBounds.right + 10 + "px";
        sidebar.style.top = GridBounds.y + "px";
        sidebar.style.width = EditorWidth - GridBounds.right - 20 + "px";
        sidebar.style.height = GridBounds.height + "px";
        this.root.appendChild(sidebar);

        (["brushes", "selected", "layers"] as OverlaySlot[]).forEach(name => {
            this.slots[name] = sidebar.appendChild(El("div", "eo-slot eo-" + name));
        });

        const help = El("div", "eo-help");
        help.style.left = GridBounds.x + "px";
        help.style.top = GridBounds.bottom + "px";
        help.style.width = EditorWidth - GridBounds.x * 2 + "px";
        help.style.height = EditorHeight - GridBounds.bottom + "px";
        this.slots.help = this.root.appendChild(help);

        this.root.addEventListener("mousedown", e => {
            if (e.target instanceof Element && e.target.closest("button")) {
                e.preventDefault();
            }
        });

        document.body.appendChild(this.root);

        // Game's own window.onresize rescales the canvas; this listener is added after it, so runs after it.
        window.addEventListener("resize", () => this.Fit());
        this.Fit();
        requestAnimationFrame(() => this.Fit());
    }

    Slot(name: OverlaySlot): HTMLElement {
        return this.slots[name];
    }

    get Visible(): boolean {
        return this.root.style.display !== "none";
    }

    SetVisible(visible: boolean): void {
        this.root.style.display = visible ? "" : "none";
        if (visible) {
            this.Fit();
        }
    }

    private Fit(): void {
        const rect = Game.inst.view.getBoundingClientRect();
        this.root.style.left = rect.left + "px";
        this.root.style.top = rect.top + "px";
        this.root.style.transform = "scale(" + rect.width / EditorWidth + ")";
    }
}

const STYLES = `
.eo-root {
    position: fixed; left: 0; top: 0; z-index: 10; transform-origin: 0 0;
    pointer-events: none; user-select: none; -webkit-user-select: none;
    font: var(--ed-font); color: var(--ed-text);
}
.eo-sidebar { position: absolute; display: flex; flex-direction: column; gap: 6px; }
.eo-slot { display: flex; flex-direction: column; min-height: 0; pointer-events: auto; }
.eo-slot > * { flex: 1; }
.eo-brushes { flex: 1 1 auto; }
.eo-selected { flex: 0 0 auto; }
.eo-layers { flex: 0 0 232px; }
.eo-help { position: absolute; display: flex; align-items: center; }
.eo-root kbd {
    display: inline-block; min-width: 9px; padding: 0 4px; box-sizing: border-box;
    background: var(--ed-well); border: 1px solid var(--ed-button-border); border-bottom-width: 2px; border-radius: 3px;
    font: 10px/13px Arial, Helvetica, sans-serif; color: var(--ed-label); text-align: center;
}
`;
