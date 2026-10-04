/**
 * The palette: all 256 slots as a grid you click to pick the paint colours (left button: foreground, right: background; ctrl
 * adds to a multi-selection, shift extends one, and dragging one entry onto another swaps them - the picture follows), and an
 * editor for the foreground colour - red, green, blue and alpha sliders, a hex box and the browser's colour picker.
 * Everything goes through the document, so it's all undoable.
 */

import { ColourHex, ParseColour, Rgba, Transparent } from "../Colour";
import { MaxPaletteSize } from "../Palette";
import { SpriteDocument, SpriteState } from "../SpriteDocument";
import { ToolController } from "../ToolController";
import { ButtonEl, El } from "../../ui/dom/Dom";
import { DrawChecker } from "./CanvasView";
import { Icon } from "./Icons";
import { ShowColour } from "./Toolbox";

const Cell = 14;
const Columns = 16;
const Rows = MaxPaletteSize / Columns;
const GridSize = Cell * Columns;

type Channel = "r" | "g" | "b" | "a";
const Channels: ReadonlyArray<{ key: Channel; label: string; title: string }> = [
    { key: "r", label: "R", title: "Red" },
    { key: "g", label: "G", title: "Green" },
    { key: "b", label: "B", title: "Blue" },
    { key: "a", label: "A", title: "Alpha (0 is transparent)" }
];

export default class PalettePanel {
    readonly el: HTMLElement;
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private countLabel: HTMLElement;
    private removeButton: HTMLButtonElement;
    private addButton: HTMLButtonElement;
    private selection = new Set<number>([1]);
    private anchor = 1;
    private drag: { from: number; x: number; y: number; moved: boolean } | null = null;
    private dropTarget = -1;
    private preview: Rgba[] | null = null;
    private usage: { state: SpriteState; counts: number[] } | null = null;
    private dirty = true;

    private swatch: HTMLElement;
    private indexLabel: HTMLElement;
    private fields: { [key: string]: { range: HTMLInputElement; box: HTMLInputElement } } = {};
    private hex: HTMLInputElement;
    private native: HTMLInputElement;
    private unsubscribe: Array<() => void> = [];

    constructor(private doc: SpriteDocument, private tool: ToolController, private hooks: { SelectionChanged(): void }) {
        this.el = El("div", "se-palette");

        const header = this.el.appendChild(El("div", "se-section-head"));
        header.appendChild(El("span", "se-section-title", "Palette"));
        this.countLabel = header.appendChild(El("span", "se-section-note"));
        this.addButton = header.appendChild(ButtonEl("se-mini", undefined, "Add a colour (a copy of the foreground one)"));
        this.addButton.appendChild(Icon("plus"));
        this.removeButton = header.appendChild(ButtonEl("se-mini", undefined, "Remove the selected colours - pixels that used them take the nearest colour left"));
        this.removeButton.appendChild(Icon("minus"));
        this.addButton.addEventListener("click", () => this.AddColour());
        this.removeButton.addEventListener("click", () => this.RemoveSelected());

        this.canvas = this.el.appendChild(document.createElement("canvas"));
        this.canvas.className = "se-grid";
        this.ctx = this.canvas.getContext("2d");
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = Math.round(GridSize * dpr);
        this.canvas.height = Math.round(Cell * Rows * dpr);
        this.canvas.style.width = GridSize + "px";
        this.canvas.style.height = Cell * Rows + "px";
        this.canvas.addEventListener("pointerdown", e => this.OnDown(e));
        this.canvas.addEventListener("pointermove", e => this.OnMove(e));
        this.canvas.addEventListener("pointerup", e => this.OnUp(e));
        this.canvas.addEventListener("pointercancel", () => this.CancelDrag());
        this.canvas.addEventListener("contextmenu", e => e.preventDefault());

        const editor = this.el.appendChild(El("div", "se-colour-editor"));
        const top = editor.appendChild(El("div", "se-colour-top"));
        this.swatch = top.appendChild(El("div", "se-colour-swatch"));
        const labels = top.appendChild(El("div", "se-colour-labels"));
        this.indexLabel = labels.appendChild(El("div", "se-colour-index"));
        this.hex = labels.appendChild(document.createElement("input"));
        this.hex.type = "text";
        this.hex.className = "se-hex";
        this.hex.maxLength = 9;
        this.hex.spellcheck = false;
        this.hex.setAttribute("aria-label", "Colour as hex (#rrggbb or #rrggbbaa)");
        this.native = top.appendChild(document.createElement("input"));
        this.native.type = "color";
        this.native.className = "se-native-colour";
        this.native.title = "Pick a colour";
        Channels.forEach(channel => {
            const row = editor.appendChild(El("div", "se-channel"));
            row.appendChild(El("label", "se-channel-label", channel.label)).title = channel.title;
            const range = row.appendChild(document.createElement("input"));
            range.type = "range";
            range.min = "0";
            range.max = "255";
            range.setAttribute("aria-label", channel.title);
            const box = row.appendChild(document.createElement("input"));
            box.type = "number";
            box.min = "0";
            box.max = "255";
            box.setAttribute("aria-label", channel.title + " value");
            this.fields[channel.key] = { range, box };
            range.addEventListener("input", () => this.EditChannel(channel.key, Number(range.value)));
            box.addEventListener("input", () => {
                const n = Number(box.value);
                if (box.value !== "" && Number.isFinite(n)) {
                    this.EditChannel(channel.key, Math.max(0, Math.min(255, Math.round(n))));
                }
            });
            box.addEventListener("change", () => this.Sync());
        });
        this.hex.addEventListener("input", () => {
            const c = ParseColour(this.hex.value);
            if (c) {
                this.Edit(c);
            }
        });
        this.hex.addEventListener("change", () => this.Sync());
        this.native.addEventListener("input", () => {
            const c = ParseColour(this.native.value);
            if (c) {
                this.Edit({ ...c, a: this.Current().a });
            }
        });

        this.unsubscribe.push(doc.Subscribe(() => this.Sync()));
        this.Sync();
    }

    // ------------------------------------------------------------------------------------------ state

    private get Palette(): ReadonlyArray<Rgba> {
        return this.preview || this.doc.Palette;
    }

    private Current(): Rgba {
        return this.doc.Palette[this.tool.settings.foreground] || { ...Transparent };
    }

    /** The entries in the multi-selection, in order - the foreground one if nothing else is. */
    SelectedIndices(): number[] {
        const indices = Array.from(this.selection).filter(i => i < this.doc.Palette.length).sort((a, b) => a - b);
        return indices.length ? indices : [this.tool.settings.foreground];
    }

    /** Shows these colours instead of the palette's own (the channel mixer's preview); null goes back. */
    SetPreviewPalette(palette: Rgba[] | null): void {
        this.preview = palette;
        this.dirty = true;
        this.DrawGrid();
    }

    SetForeground(index: number, keepSelection = false): void {
        const clamped = Math.max(0, Math.min(this.doc.Palette.length - 1, index));
        this.tool.settings.foreground = clamped;
        if (!keepSelection) {
            this.selection = new Set([clamped]);
        }
        this.anchor = clamped;
        this.tool.SettingsChanged();
        this.hooks.SelectionChanged();
        this.Sync();
    }

    SetBackground(index: number): void {
        this.tool.settings.background = Math.max(0, Math.min(this.doc.Palette.length - 1, index));
        this.tool.SettingsChanged();
        this.Sync();
    }

    /** Keeps both paint colours (and the selection) pointing at entries that exist - after an undo, a removal. */
    private Clamp(): void {
        const last = this.doc.Palette.length - 1;
        const s = this.tool.settings;
        if (s.foreground > last) {
            s.foreground = last;
        }
        if (s.background > last) {
            s.background = last;
        }
        this.selection.forEach(i => {
            if (i > last) {
                this.selection.delete(i);
            }
        });
        if (!this.selection.size) {
            this.selection.add(s.foreground);
        }
    }

    // ------------------------------------------------------------------------------------------ editing

    private Edit(colour: Rgba): void {
        const index = this.tool.settings.foreground;
        this.doc.SetColour(index, colour, "colour:" + index);
    }

    private EditChannel(key: Channel, value: number): void {
        this.Edit({ ...this.Current(), [key]: value });
    }

    private AddColour(): void {
        const index = this.doc.AddColour(this.Current(), true);
        if (index >= 0) {
            this.SetForeground(index);
        }
    }

    private RemoveSelected(): void {
        const indices = this.SelectedIndices();
        if (this.doc.RemoveColours(indices)) {
            this.Clamp();
            this.SetForeground(Math.min(indices[0], this.doc.Palette.length - 1));
        }
    }

    // ------------------------------------------------------------------------------------------ pointer

    private CellAt(e: MouseEvent): number {
        const rect = this.canvas.getBoundingClientRect();
        const x = Math.floor(((e.clientX - rect.left) / rect.width) * Columns);
        const y = Math.floor(((e.clientY - rect.top) / rect.height) * Rows);
        return x < 0 || y < 0 || x >= Columns || y >= Rows ? -1 : y * Columns + x;
    }

    private OnDown(e: PointerEvent): void {
        e.preventDefault();
        const index = this.CellAt(e);
        if (index < 0) {
            return;
        }
        const length = this.doc.Palette.length;
        if (index >= length) {
            // The empty slot after the last colour adds one; the others are just empty.
            if (index === length && e.button === 0) {
                this.AddColour();
            }
            return;
        }
        if (e.button === 2) {
            this.SetBackground(index);
            return;
        }
        if (e.button !== 0) {
            return;
        }
        if (e.ctrlKey || e.metaKey) {
            if (this.selection.has(index) && this.selection.size > 1) {
                this.selection.delete(index);
            } else {
                this.selection.add(index);
            }
            this.SetForeground(index, true);
            return;
        }
        if (e.shiftKey) {
            const from = Math.min(this.anchor, index);
            const to = Math.max(this.anchor, index);
            this.selection = new Set();
            for (let i = from; i <= to; i++) {
                this.selection.add(i);
            }
            this.tool.settings.foreground = index;
            this.tool.SettingsChanged();
            this.hooks.SelectionChanged();
            this.Sync();
            return;
        }
        this.SetForeground(index);
        this.drag = { from: index, x: e.clientX, y: e.clientY, moved: false };
        try {
            this.canvas.setPointerCapture(e.pointerId);
        } catch {
            // A pointer that's already gone (or never was): the drag just works without capture.
        }
    }

    private OnMove(e: PointerEvent): void {
        const index = this.CellAt(e);
        if (!this.drag) {
            this.canvas.title = this.Describe(index);
            return;
        }
        if (!this.drag.moved && Math.abs(e.clientX - this.drag.x) + Math.abs(e.clientY - this.drag.y) > 5) {
            this.drag.moved = true;
        }
        const target = this.drag.moved && index >= 0 && index < this.doc.Palette.length && index !== this.drag.from ? index : -1;
        if (target !== this.dropTarget) {
            this.dropTarget = target;
            this.dirty = true;
            this.DrawGrid();
        }
    }

    private OnUp(e: PointerEvent): void {
        const drag = this.drag;
        if (!drag) {
            return;
        }
        const target = this.dropTarget;
        this.CancelDrag();
        if (this.canvas.hasPointerCapture(e.pointerId)) {
            this.canvas.releasePointerCapture(e.pointerId);
        }
        if (drag.moved && target >= 0 && this.doc.SwapColours(drag.from, target)) {
            this.SetForeground(target);
        }
    }

    private CancelDrag(): void {
        this.drag = null;
        if (this.dropTarget >= 0) {
            this.dropTarget = -1;
            this.dirty = true;
            this.DrawGrid();
        }
    }

    private Describe(index: number): string {
        if (index < 0 || index >= this.doc.Palette.length) {
            return index === this.doc.Palette.length ? "Add a colour" : "";
        }
        const c = this.doc.Palette[index];
        return `${index} · ${ColourHex(c, true)}${c.a === 0 ? " · transparent" : ""} · used by ${this.Counts()[index] || 0} pixels`;
    }

    private Counts(): number[] {
        if (!this.usage || this.usage.state !== this.doc.State) {
            this.usage = { state: this.doc.State, counts: this.doc.UsageCounts() };
        }
        return this.usage.counts;
    }

    // ------------------------------------------------------------------------------------------ drawing

    /** Redraws what shows, from the document. */
    Sync(): void {
        this.Clamp();
        this.dirty = true;
        this.DrawGrid();
        const palette = this.doc.Palette;
        const index = this.tool.settings.foreground;
        const colour = this.Current();
        this.countLabel.textContent = `${palette.length} / ${MaxPaletteSize}`;
        this.addButton.disabled = palette.length >= MaxPaletteSize;
        this.removeButton.disabled = palette.length <= 1;
        ShowColour(this.swatch, colour);
        this.indexLabel.textContent = `Colour ${index}${colour.a === 0 ? " (transparent)" : ""} · ${this.Counts()[index] || 0} px`;
        const active = document.activeElement;
        Channels.forEach(channel => {
            const field = this.fields[channel.key];
            field.range.value = String(colour[channel.key]);
            if (active !== field.box) {
                field.box.value = String(colour[channel.key]);
            }
        });
        if (active !== this.hex) {
            this.hex.value = ColourHex(colour, colour.a !== 255);
        }
        this.native.value = ColourHex(colour);
    }

    private DrawGrid(): void {
        if (!this.dirty) {
            return;
        }
        this.dirty = false;
        const { ctx } = this;
        const dpr = this.canvas.width / GridSize;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const palette = this.Palette;
        const s = this.tool.settings;
        ctx.fillStyle = "#1a1a1d";
        ctx.fillRect(0, 0, GridSize, Cell * Rows);
        for (let i = 0; i < MaxPaletteSize; i++) {
            const x = (i % Columns) * Cell;
            const y = Math.floor(i / Columns) * Cell;
            if (i < palette.length) {
                DrawChecker(ctx, x + 1, y + 1, Cell - 1, Cell - 1, 4);
                const c = palette[i];
                ctx.fillStyle = `rgba(${c.r},${c.g},${c.b},${c.a / 255})`;
                ctx.fillRect(x + 1, y + 1, Cell - 1, Cell - 1);
            } else {
                ctx.fillStyle = "#222226";
                ctx.fillRect(x + 1, y + 1, Cell - 1, Cell - 1);
                if (i === palette.length) {
                    ctx.strokeStyle = "#77777f";
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(x + Cell / 2 + 0.5, y + 4);
                    ctx.lineTo(x + Cell / 2 + 0.5, y + Cell - 3);
                    ctx.moveTo(x + 4, y + Cell / 2 + 0.5);
                    ctx.lineTo(x + Cell - 3, y + Cell / 2 + 0.5);
                    ctx.stroke();
                }
            }
        }
        const outline = (index: number, style: string, width: number, inset: number) => {
            const x = (index % Columns) * Cell;
            const y = Math.floor(index / Columns) * Cell;
            ctx.strokeStyle = style;
            ctx.lineWidth = width;
            ctx.strokeRect(x + 1 + inset, y + 1 + inset, Cell - 1 - inset * 2, Cell - 1 - inset * 2);
        };
        this.selection.forEach(i => {
            if (i < palette.length && i !== s.foreground) {
                outline(i, "#9b5de5", 2, 1);
            }
        });
        if (s.background < palette.length) {
            const x = (s.background % Columns) * Cell;
            const y = Math.floor(s.background / Columns) * Cell;
            ctx.fillStyle = "#000";
            ctx.fillRect(x + Cell - 7, y + Cell - 7, 7, 7);
            ctx.fillStyle = "#fff";
            ctx.fillRect(x + Cell - 6, y + Cell - 6, 5, 5);
        }
        if (s.foreground < palette.length) {
            outline(s.foreground, "#000", 3, 0.5);
            outline(s.foreground, "#fff", 1.5, 1);
        }
        if (this.dropTarget >= 0) {
            ctx.setLineDash([3, 2]);
            outline(this.dropTarget, "#ffd23c", 2, 1);
            ctx.setLineDash([]);
        }
    }

    Destroy(): void {
        this.unsubscribe.forEach(off => off());
        this.el.remove();
    }
}
