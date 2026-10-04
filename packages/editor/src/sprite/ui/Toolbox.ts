/**
 * The tool column: the tools, the options of whichever is picked (brush size and shape, filled shapes, fill mode, mirroring),
 * and the two paint colours. It only edits the `ToolController`'s settings - the pointer logic lives there.
 */

import { Rgba } from "../Colour";
import { MaxBrushSize } from "../Bitmap";
import { SpriteDocument } from "../SpriteDocument";
import { ToolController, ToolId } from "../ToolController";
import { ButtonEl, El } from "../../ui/dom/Dom";
import { Icon } from "./Icons";

export type ToolDef = { id: ToolId; label: string; icon: string; key: string };

export const ToolDefs: ReadonlyArray<ToolDef> = [
    { id: "pencil", label: "Pencil", icon: "pencil", key: "B" },
    { id: "eraser", label: "Eraser", icon: "eraser", key: "E" },
    { id: "line", label: "Line", icon: "line", key: "L" },
    { id: "rect", label: "Rectangle", icon: "rect", key: "R" },
    { id: "ellipse", label: "Ellipse", icon: "ellipse", key: "O" },
    { id: "fill", label: "Fill", icon: "fill", key: "G" },
    { id: "picker", label: "Colour picker", icon: "picker", key: "I" },
    { id: "select", label: "Select", icon: "select", key: "M" }
];

/** A CSS colour for a palette entry (with its alpha). */
export function CssColour(c: Rgba): string {
    return `rgba(${c.r},${c.g},${c.b},${Math.round((c.a / 255) * 1000) / 1000})`;
}

/** Paints a swatch element: the colour over a checkerboard, so transparency shows. */
export function ShowColour(el: HTMLElement, c: Rgba | undefined): void {
    el.style.backgroundImage = c
        ? `linear-gradient(${CssColour(c)}, ${CssColour(c)}), repeating-conic-gradient(#4a4a50 0% 25%, #2c2c31 0% 50%)`
        : "none";
    el.style.backgroundSize = "auto, 8px 8px";
}

export default class Toolbox {
    readonly el: HTMLElement;
    private buttons: { [id: string]: HTMLButtonElement } = {};
    private rows: { [name: string]: HTMLElement } = {};
    private size: HTMLInputElement;
    private sizeBox: HTMLInputElement;
    private shapes: { [shape: string]: HTMLButtonElement } = {};
    private filled: HTMLInputElement;
    private contiguous: HTMLInputElement;
    private mirrorX: HTMLButtonElement;
    private mirrorY: HTMLButtonElement;
    private crop: HTMLButtonElement;
    private fg: HTMLElement;
    private bg: HTMLElement;
    private unsubscribe: () => void;

    constructor(private tool: ToolController, private doc: SpriteDocument, hooks: { SwapColours(): void; CropToSelection(): void }) {
        this.el = El("div", "se-toolbox");
        const grid = this.el.appendChild(El("div", "se-tools"));
        ToolDefs.forEach(def => {
            const button = ButtonEl("se-tool", undefined, `${def.label} (${def.key})`);
            button.appendChild(Icon(def.icon));
            button.setAttribute("aria-pressed", "false");
            button.addEventListener("click", () => this.tool.SetTool(def.id));
            this.buttons[def.id] = grid.appendChild(button);
        });

        const colours = this.el.appendChild(El("div", "se-colours"));
        this.bg = colours.appendChild(El("div", "se-bg-swatch"));
        this.fg = colours.appendChild(El("div", "se-fg-swatch"));
        const swap = colours.appendChild(ButtonEl("se-swap", undefined, "Swap the two colours (X)"));
        swap.appendChild(Icon("swap"));
        swap.addEventListener("click", () => hooks.SwapColours());
        this.fg.title = "Left button colour";
        this.bg.title = "Right button colour";

        // Brush size
        const sizeRow = (this.rows.size = this.el.appendChild(El("div", "se-opt")));
        sizeRow.appendChild(El("label", "se-opt-label", "Brush size"));
        const sizeControls = sizeRow.appendChild(El("div", "se-opt-controls"));
        this.size = sizeControls.appendChild(document.createElement("input"));
        this.size.type = "range";
        this.size.min = "1";
        this.size.max = String(Math.min(MaxBrushSize, 16));
        this.size.setAttribute("aria-label", "Brush size");
        this.sizeBox = sizeControls.appendChild(document.createElement("input"));
        this.sizeBox.type = "number";
        this.sizeBox.min = "1";
        this.sizeBox.max = String(MaxBrushSize);
        this.sizeBox.setAttribute("aria-label", "Brush size in pixels");
        const setSize = (n: number) => {
            if (Number.isFinite(n)) {
                this.tool.settings.brushSize = Math.max(1, Math.min(MaxBrushSize, Math.round(n)));
                this.tool.SettingsChanged();
            }
        };
        this.size.addEventListener("input", () => setSize(Number(this.size.value)));
        this.sizeBox.addEventListener("input", () => setSize(Number(this.sizeBox.value)));
        this.sizeBox.addEventListener("change", () => setSize(Number(this.sizeBox.value)));

        const shapeRow = (this.rows.shape = this.el.appendChild(El("div", "se-opt")));
        shapeRow.appendChild(El("label", "se-opt-label", "Brush shape"));
        const shapeControls = shapeRow.appendChild(El("div", "se-opt-controls"));
        (["square", "round"] as const).forEach(shape => {
            const button = ButtonEl("se-toggle", undefined, shape === "square" ? "Square brush" : "Round brush");
            button.appendChild(Icon(shape));
            button.addEventListener("click", () => {
                this.tool.settings.brushShape = shape;
                this.tool.SettingsChanged();
            });
            this.shapes[shape] = shapeControls.appendChild(button);
        });

        this.filled = this.Check("Filled shapes", "filled", checked => (this.tool.settings.filled = checked));
        this.contiguous = this.Check("Fill touching pixels only", "contiguous", checked => (this.tool.settings.contiguous = checked));

        const mirrorRow = (this.rows.mirror = this.el.appendChild(El("div", "se-opt")));
        mirrorRow.appendChild(El("label", "se-opt-label", "Mirror"));
        const mirrorControls = mirrorRow.appendChild(El("div", "se-opt-controls"));
        this.mirrorX = mirrorControls.appendChild(ButtonEl("se-toggle", undefined, "Mirror left to right (draws on both sides of the vertical middle)"));
        this.mirrorX.appendChild(Icon("mirrorX"));
        this.mirrorY = mirrorControls.appendChild(ButtonEl("se-toggle", undefined, "Mirror top to bottom"));
        this.mirrorY.appendChild(Icon("mirrorY"));
        this.mirrorX.addEventListener("click", () => {
            this.tool.settings.mirrorX = !this.tool.settings.mirrorX;
            this.tool.SettingsChanged();
        });
        this.mirrorY.addEventListener("click", () => {
            this.tool.settings.mirrorY = !this.tool.settings.mirrorY;
            this.tool.SettingsChanged();
        });

        const cropRow = (this.rows.crop = this.el.appendChild(El("div", "se-opt")));
        cropRow.appendChild(El("label", "se-opt-label", "Selection"));
        this.crop = cropRow.appendChild(ButtonEl("ed-button se-wide-button", "Crop to selection", "Cut every frame down to the selected area (Edit and Sprite menus too)"));
        this.crop.addEventListener("click", () => hooks.CropToSelection());

        this.unsubscribe = tool.Subscribe(() => this.Sync());
        this.Sync();
    }

    private Check(label: string, name: string, set: (checked: boolean) => void): HTMLInputElement {
        const row = (this.rows[name] = this.el.appendChild(El("label", "se-opt se-check")));
        const input = row.appendChild(document.createElement("input"));
        input.type = "checkbox";
        row.appendChild(El("span", "", label));
        input.addEventListener("change", () => {
            set(input.checked);
            this.tool.SettingsChanged();
        });
        return input;
    }

    /** Shows the settings as they are, and only the options the picked tool uses. */
    Sync(): void {
        const s = this.tool.settings;
        Object.keys(this.buttons).forEach(id => this.buttons[id].setAttribute("aria-pressed", String(id === s.tool)));
        const drawing = s.tool === "pencil" || s.tool === "eraser" || s.tool === "line" || s.tool === "rect" || s.tool === "ellipse";
        this.rows.size.hidden = !drawing;
        this.rows.shape.hidden = !drawing;
        this.rows.filled.hidden = !(s.tool === "rect" || s.tool === "ellipse");
        this.rows.contiguous.hidden = s.tool !== "fill";
        this.rows.mirror.hidden = !drawing;
        this.rows.crop.hidden = s.tool !== "select";
        this.crop.disabled = !this.tool.HasSelection;
        if (document.activeElement !== this.sizeBox) {
            this.sizeBox.value = String(s.brushSize);
        }
        this.size.value = String(Math.min(Number(this.size.max), s.brushSize));
        Object.keys(this.shapes).forEach(shape => this.shapes[shape].setAttribute("aria-pressed", String(s.brushShape === shape)));
        this.filled.checked = s.filled;
        this.contiguous.checked = s.contiguous;
        this.mirrorX.setAttribute("aria-pressed", String(s.mirrorX));
        this.mirrorY.setAttribute("aria-pressed", String(s.mirrorY));
        ShowColour(this.fg, this.doc.Palette[s.foreground]);
        ShowColour(this.bg, this.doc.Palette[s.background]);
    }

    Destroy(): void {
        this.unsubscribe();
        this.el.remove();
    }
}
