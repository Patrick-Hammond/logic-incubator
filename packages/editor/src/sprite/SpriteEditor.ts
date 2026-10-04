/**
 * The sprite editor window: a full-page editor over the level editor for one sprite (or animation) - the tools, the 256-colour
 * palette with its extractor, library and channel mixer, the frames with onion skin and playback, and save / save as. This
 * file builds the window and runs what the menus do; the drawing logic is in `ToolController` and `SpriteDocument`, the
 * server side in the dev server's sprite API.
 *
 * Saving writes the PNGs into the game's asset folders (as indexed PNGs, so the palette survives) and the dev build packs
 * them; the page itself doesn't pick up new art until it's reloaded, so closing the window after a save reloads the page -
 * the level in progress is kept first, and the editor comes back with the saved sprite picked.
 */

import { FormDialogOptions, FormValues, IsFormDialogOpen, OpenFormDialog } from "../ui/dialog/FormDialog";
import { ButtonEl, El, InjectStyles, InjectTheme } from "../ui/dom/Dom";
import { Bitmap, FillRegion, FlipHorizontal, FlipVertical, MaxBrushSize, Point, RotateClockwise, RotateCounterClockwise, ShiftBitmap } from "./Bitmap";
import { ColourHex, Rgba } from "./Colour";
import { DefaultToolSettings, ToolController } from "./ToolController";
import { ExtractPalette, MaxPaletteSize, FormatPalette, ParsePalette, PaletteSort, TransparentIndex } from "./Palette";
import { PaletteLibrary, StorageLike as LibraryStorage, WithTransparentFirst } from "./PaletteLibrary";
import { EncodeIndexedPng, DecodePng } from "./Png";
import { Playback } from "./Playback";
import { ClearRecovery, SpriteOrigin, WriteRecovery } from "./Recovery";
import { ReadBundleHash, WaitForBundleChange } from "./ManifestWatch";
import { StorageLike, WriteResumeNote } from "./Resume";
import { SpriteApi, SpriteApiError } from "./SpriteApi";
import { SpriteDocument, SpriteState, StateFromImages } from "./SpriteDocument";
import { SuggestSpriteName } from "./SpriteNames";
import { View } from "./Viewport";
import CanvasView, { BackdropKind } from "./ui/CanvasView";
import {
    AnchorFromValue, ApplyPaletteDialog, Category, ExportPaletteDialog, ExtractDialog, LoadPaletteDialog, ManagePalettesDialog, ReadSaveAs, ResizeDialog, SaveAsDialog, SavePaletteDialog, ShiftDialog
} from "./ui/Dialogs";
import { ChooseFile, DownloadText, ImageFileToRgba, ReadFileText } from "./ui/FileIo";
import MenuBar, { MenuDef, MenuItem } from "./ui/Menu";
import MixerPanel from "./ui/MixerPanel";
import PalettePanel from "./ui/PalettePanel";
import { SpriteEditorStyles } from "./ui/Styles";
import Timeline from "./ui/Timeline";
import Toolbox, { ToolDefs } from "./ui/Toolbox";

/** What the editor window needs from the page it's on. */
export type SpriteEditorContext = {
    api: SpriteApi;
    /** Where the served asset manifest is, to tell when a save's rebuild has landed. "" if unknown. */
    manifestUrl: string;
    /** The palette tabs, for a new sprite's category. */
    categories: ReadonlyArray<Category>;
    /** Keeps the level being edited, ahead of a page reload. */
    persistLevel(): void;
    reload(): void;
    /** localStorage and sessionStorage (or null if the browser won't give them). */
    localStorage: LibraryStorage | null;
    sessionStorage: StorageLike | null;
};

export type { SpriteOrigin } from "./Recovery";

const Shortcuts = `Tools: B pencil, E eraser, L line, R rectangle, O ellipse, G fill, I picker, M select
Alt-click picks a colour with any tool; right button paints the second colour; Shift draws a straight line / a square or circle
[ ] brush size · X swap colours · Space-drag or middle-drag to pan · wheel or + - to zoom · 0 to fit
Ctrl+Z undo · Ctrl+Y redo · Ctrl+S save · Ctrl+Shift+S save as
Ctrl+C / X / V copy, cut, paste · Ctrl+A select all · Ctrl+D deselect · Delete clears the selection · arrows nudge it
Ctrl-drag a selection to copy it · , . previous / next frame · Enter play / pause · Esc cancel or close`;

function BrowserStorage<T>(get: () => T): T | null {
    try {
        return get();
    } catch {
        return null;
    }
}

const IsEditable = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) {
        return false;
    }
    return target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target.isContentEditable || (target instanceof HTMLInputElement && !["range", "checkbox", "radio", "button", "color"].includes(target.type));
};

export default class SpriteEditor {
    /** The window that's open, if any - there's only ever one. */
    static Active: SpriteEditor | null = null;

    private doc: SpriteDocument;
    private tool: ToolController;
    private playback: Playback;
    private library: PaletteLibrary;
    private root: HTMLElement;
    private menu: MenuBar;
    private canvas: CanvasView;
    private toolbox: Toolbox;
    private palette: PalettePanel;
    private mixer: MixerPanel;
    private timeline: Timeline;
    private mixerDetails: HTMLDetailsElement;
    private titleText: HTMLElement;
    private metaText: HTMLElement;
    private hoverText: HTMLElement;
    private zoomText: HTMLElement;
    private messageText: HTMLElement;
    private saveButton: HTMLButtonElement;
    private busy: HTMLElement | null = null;
    private saving = false;
    private closing = false;
    private closed = false;
    private pendingBuild: Promise<"changed" | "timeout"> | null = null;
    private toastTimer = 0;
    private subscriptions: Array<() => void> = [];

    constructor(private ctx: SpriteEditorContext, state: SpriteState, private origin: SpriteOrigin, private done: (applied: boolean) => void) {
        InjectTheme();
        InjectStyles("se-styles", SpriteEditorStyles);

        this.doc = new SpriteDocument(state);
        const settings = DefaultToolSettings();
        settings.foreground = state.palette.length > 1 ? 1 : 0;
        settings.background = Math.max(0, TransparentIndex(state.palette));
        this.tool = new ToolController(this.doc, settings);
        this.playback = new Playback(this.doc.FrameCount);
        this.library = new PaletteLibrary(ctx.localStorage);

        this.subscriptions.push(this.doc.Subscribe(() => this.DocumentChanged()));
        this.subscriptions.push(
            this.tool.SubscribePick((index, button) => {
                if (button === 2) {
                    this.palette.SetBackground(index);
                } else {
                    this.palette.SetForeground(index);
                }
            })
        );

        this.canvas = new CanvasView(this.doc, this.tool, {
            Hover: cell => this.ShowHover(cell),
            ViewChanged: view => this.ShowZoom(view),
            Focus: () => this.Focus()
        });
        this.toolbox = new Toolbox(this.tool, this.doc, { SwapColours: () => this.SwapColours(), CropToSelection: () => this.CropToSelection() });
        this.palette = new PalettePanel(this.doc, this.tool, { SelectionChanged: () => this.mixer.SelectionChanged() });
        this.mixer = new MixerPanel(this.doc, () => this.palette.SelectedIndices(), { Preview: palette => this.SetPreview(palette) });
        this.timeline = new Timeline(this.doc, this.tool, this.playback, { OnionChanged: enabled => this.canvas.SetOnion({ enabled }) });
        this.subscriptions.push(this.doc.Subscribe(() => this.toolbox.Sync()));

        this.root = El("div", "se-root");
        this.root.tabIndex = -1;
        this.root.setAttribute("role", "dialog");
        this.root.setAttribute("aria-label", "Sprite editor");

        const top = this.root.appendChild(El("div", "se-top"));
        this.menu = new MenuBar(this.MenuDefs());
        top.appendChild(this.menu.el);
        this.titleText = top.appendChild(El("div", "se-title"));
        this.metaText = top.appendChild(El("div", "se-meta"));
        top.appendChild(El("div", "se-spacer"));
        this.saveButton = top.appendChild(ButtonEl("ed-button se-primary", "Save", "Save the sprite into the game's assets (Ctrl+S)"));
        this.saveButton.addEventListener("click", () => this.Save());
        const closeButton = top.appendChild(ButtonEl("ed-button", "Close", "Close the editor (Esc)"));
        closeButton.addEventListener("click", () => this.RequestClose());

        const main = this.root.appendChild(El("div", "se-main"));
        main.appendChild(El("div", "se-left")).appendChild(this.toolbox.el);
        main.appendChild(this.canvas.el);
        const side = main.appendChild(El("div", "se-side"));
        side.appendChild(this.palette.el);
        this.mixerDetails = side.appendChild(document.createElement("details"));
        this.mixerDetails.className = "se-details";
        this.mixerDetails.appendChild(El("summary", "", "Channel mixer"));
        this.mixerDetails.appendChild(this.mixer.el);

        this.root.appendChild(this.timeline.el);

        const status = this.root.appendChild(El("div", "se-status"));
        this.hoverText = status.appendChild(El("span", "se-hover"));
        this.zoomText = status.appendChild(El("span", "se-zoom"));
        this.messageText = status.appendChild(El("span", "se-message"));
        status.appendChild(El("span", "", "? Help > Keyboard shortcuts"));

        // Whatever's typed in the editor's own boxes never reaches the level editor's shortcuts behind it.
        this.root.addEventListener("keydown", e => e.stopPropagation());
        document.body.appendChild(this.root);
        SpriteEditor.Active = this;

        window.addEventListener("keydown", this.onKeyCapture, true);
        window.addEventListener("keyup", this.onKeyUp, true);
        window.addEventListener("blur", this.onBlur);
        window.addEventListener("beforeunload", this.onBeforeUnload);

        this.DocumentChanged();
        this.canvas.Layout();
        this.Focus();
    }

    // ------------------------------------------------------------------------------------------ window pieces

    private Focus(): void {
        this.root.focus({ preventScroll: true });
    }

    private get DisplayName(): string {
        return `${this.origin.bundle}.${this.origin.name}`;
    }

    /** Keeps the title, size line and paint colours up to date with the document. */
    private DocumentChanged(): void {
        const s = this.tool.settings;
        const last = this.doc.Palette.length - 1;
        if (s.foreground > last) {
            s.foreground = last;
        }
        if (s.background > last) {
            s.background = last;
        }
        if (!this.titleText) {
            return;
        }
        this.titleText.textContent = this.DisplayName + (this.doc.Dirty ? " •" : "") + (this.origin.mode === "create" ? " (new)" : "");
        this.titleText.title = this.titleText.textContent;
        const frames = this.doc.FrameCount;
        this.metaText.textContent = `${this.doc.Width}×${this.doc.Height} · ${frames} frame${frames === 1 ? "" : "s"} · ${this.doc.Palette.length} colours`;
        document.title = document.title.replace(/^\* /, "");
    }

    private ShowHover(cell: Point | null): void {
        if (!cell || cell.x < 0 || cell.y < 0 || cell.x >= this.doc.Width || cell.y >= this.doc.Height) {
            this.hoverText.textContent = "";
            return;
        }
        const bitmap = this.tool.PreviewFrame;
        const index = bitmap.data[cell.y * bitmap.width + cell.x];
        const colour = this.doc.Palette[index];
        this.hoverText.textContent = `${cell.x}, ${cell.y} · colour ${index}${colour ? " " + ColourHex(colour, colour.a !== 255) : ""}`;
    }

    private ShowZoom(view: View): void {
        this.zoomText.textContent = `${Math.round(view.zoom * 100)}%`;
    }

    private SetPreview(palette: Rgba[] | null): void {
        this.canvas.SetPreviewPalette(palette);
        this.timeline.SetPreviewPalette(palette);
        this.palette.SetPreviewPalette(palette);
    }

    /** Says something in the status bar and, briefly, over the canvas. */
    private Say(text: string, error = false): void {
        this.messageText.textContent = text;
        this.messageText.classList.toggle("is-error", error);
        const toast = this.root.appendChild(El("div", "se-toast" + (error ? " is-error" : ""), text));
        window.clearTimeout(this.toastTimer);
        this.toastTimer = window.setTimeout(() => toast.remove(), error ? 7000 : 3500);
        // Only the latest toast stays.
        Array.from(this.root.querySelectorAll(".se-toast")).forEach(t => {
            if (t !== toast) {
                t.remove();
            }
        });
    }

    private SwapColours(): void {
        const s = this.tool.settings;
        const fg = s.foreground;
        s.foreground = s.background;
        s.background = fg;
        this.tool.SettingsChanged();
        this.palette.Sync();
    }

    // ------------------------------------------------------------------------------------------ dialogs

    private async Ask(options: FormDialogOptions): Promise<FormValues | null> {
        this.menu.Close();
        const result = await OpenFormDialog(options);
        this.Focus();
        return result;
    }

    private async Alert(title: string, message: string): Promise<void> {
        await this.Ask({ title, subtitle: message, fields: [], values: {}, saveLabel: "OK", cancelLabel: null });
    }

    private async Confirm(title: string, message: string, yes: string, no = "Cancel"): Promise<boolean> {
        return (await this.Ask({ title, subtitle: message, fields: [], values: {}, saveLabel: yes, cancelLabel: no })) !== null;
    }

    private Fail(error: unknown, what: string): Promise<void> {
        const message = error instanceof SpriteApiError || error instanceof Error ? error.message : String(error);
        const details = error instanceof SpriteApiError && error.details && error.details.length > 1 ? "\n\n" + error.details.join("\n") : "";
        this.Say(`${what}: ${message}`, true);
        return this.Alert(what, message + details);
    }

    // ------------------------------------------------------------------------------------------ keyboard

    private onKeyCapture = (e: KeyboardEvent): void => {
        if (this.closed || IsFormDialogOpen()) {
            return;
        }
        if (IsEditable(e.target) && e.target instanceof HTMLElement && this.root.contains(e.target)) {
            // Typing in one of the editor's own boxes: it gets the key (the root's own listener keeps it from the page behind) - apart
            // from a few that mean the same wherever you are: Escape leaves the box; Ctrl+S saves; and Ctrl+Z / Ctrl+Y in a number box,
            // where there's no text to undo, undo the sprite (the box applies what's typed straight away).
            const ctrl = e.ctrlKey || e.metaKey;
            const key = e.key.toLowerCase();
            if (e.key === "Escape") {
                e.stopImmediatePropagation();
                e.preventDefault();
                this.menu.Close();
                e.target.blur();
                this.Focus();
            } else if (ctrl && key === "s") {
                e.stopImmediatePropagation();
                this.OnKey(e);
            } else if (ctrl && (key === "z" || key === "y") && e.target instanceof HTMLInputElement && e.target.type === "number") {
                e.stopImmediatePropagation();
                this.OnKey(e);
            }
            return;
        }
        e.stopImmediatePropagation();
        this.OnKey(e);
    };

    private onKeyUp = (e: KeyboardEvent): void => {
        if (e.code === "Space") {
            this.canvas.SetPanHeld(false);
        }
    };

    private onBlur = (): void => this.canvas.SetPanHeld(false);

    /**
     * The page is going - F5, or the dev server reloading it after a slow rebuild dropped its connection. Unless that's us closing on
     * purpose, keep the sprite and the level to come back to (see Recovery.ts), and if there are unsaved edits give the browser the
     * chance to ask first.
     */
    private onBeforeUnload = (e: BeforeUnloadEvent): void => {
        if (this.closing || this.closed) {
            return;
        }
        this.tool.Flush();
        WriteRecovery(this.ctx.sessionStorage, { origin: this.origin, state: this.doc.State, frameIndex: this.doc.FrameIndex, dirty: this.doc.Dirty });
        try {
            this.ctx.persistLevel();
        } catch {
            // Storage full or blocked: the level just isn't kept this time.
        }
        if (this.doc.Dirty) {
            e.preventDefault();
            e.returnValue = "";
        }
    };

    private OnKey(e: KeyboardEvent): void {
        const ctrl = e.ctrlKey || e.metaKey;
        const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        let handled = true;
        if (e.code === "Space") {
            if (!e.repeat) {
                this.canvas.SetPanHeld(true);
            }
        } else if (key === "Escape") {
            this.Escape();
        } else if (ctrl) {
            switch (key) {
                case "z":
                    if (e.shiftKey) {
                        this.Redo();
                    } else {
                        this.Undo();
                    }
                    break;
                case "y":
                    this.Redo();
                    break;
                case "s":
                    if (e.shiftKey) {
                        this.SaveAs();
                    } else {
                        this.Save();
                    }
                    break;
                case "c":
                    this.tool.Copy();
                    break;
                case "x":
                    this.tool.Cut();
                    break;
                case "v":
                    this.tool.Paste();
                    break;
                case "a":
                    this.tool.SelectAll();
                    break;
                case "d":
                    this.tool.Deselect();
                    break;
                default:
                    handled = false;
            }
        } else if (e.altKey) {
            handled = false;
        } else {
            switch (key) {
                case "Delete":
                case "Backspace":
                    this.tool.Delete();
                    break;
                case "Enter":
                    this.timeline.TogglePlay();
                    break;
                case "[":
                case "]":
                    this.tool.settings.brushSize = Math.max(1, Math.min(MaxBrushSize, this.tool.settings.brushSize + (key === "]" ? 1 : -1)));
                    this.tool.SettingsChanged();
                    break;
                case "x":
                    this.SwapColours();
                    break;
                case ",":
                    this.GoToFrame(this.doc.FrameIndex - 1);
                    break;
                case ".":
                    this.GoToFrame(this.doc.FrameIndex + 1);
                    break;
                case "Home":
                    this.GoToFrame(0);
                    break;
                case "End":
                    this.GoToFrame(this.doc.FrameCount - 1);
                    break;
                case "+":
                case "=":
                    this.canvas.ZoomStep(1);
                    break;
                case "-":
                    this.canvas.ZoomStep(-1);
                    break;
                case "0":
                    this.canvas.Fit();
                    break;
                case "ArrowLeft":
                case "ArrowRight":
                case "ArrowUp":
                case "ArrowDown": {
                    const step = e.shiftKey ? 8 : 1;
                    handled = this.tool.NudgeSelection(key === "ArrowLeft" ? -step : key === "ArrowRight" ? step : 0, key === "ArrowUp" ? -step : key === "ArrowDown" ? step : 0);
                    break;
                }
                default: {
                    const def = ToolDefs.find(d => d.key.toLowerCase() === key);
                    if (def) {
                        this.tool.SetTool(def.id);
                    } else {
                        handled = false;
                    }
                }
            }
        }
        if (handled) {
            e.preventDefault();
        }
    }

    private Escape(): void {
        if (this.menu.Close()) {
            return;
        }
        if (this.tool.Cancel()) {
            return;
        }
        this.RequestClose();
    }

    private Undo(): void {
        if (!this.tool.UndoFirst()) {
            this.doc.Undo();
        }
    }

    private Redo(): void {
        this.tool.Flush();
        this.doc.Redo();
    }

    private GoToFrame(index: number): void {
        this.tool.Flush();
        this.doc.SetFrameIndex(index);
    }

    // ------------------------------------------------------------------------------------------ menus

    private MenuDefs(): MenuDef[] {
        const doc = this.doc;
        const tool = this.tool;
        const sep: MenuItem = { separator: true };
        const sort = (label: string, by: PaletteSort): MenuItem => ({
            label,
            action: () => {
                tool.Flush();
                this.Say(doc.SortColours(by) ? `Palette sorted by ${label.toLowerCase().replace("sort by ", "")}.` : "Already in that order.");
            }
        });
        return [
            {
                label: "File",
                items: () => [
                    { label: "Save", shortcut: "Ctrl+S", action: () => this.Save() },
                    { label: "Save as…", shortcut: "Ctrl+Shift+S", action: () => this.SaveAs() },
                    { label: "Revert to saved", disabled: this.origin.mode !== "overwrite", action: () => this.Revert() },
                    sep,
                    { label: "Close", shortcut: "Esc", action: () => this.RequestClose() }
                ]
            },
            {
                label: "Edit",
                items: () => [
                    { label: doc.UndoLabel ? `Undo ${doc.UndoLabel.toLowerCase()}` : "Undo", shortcut: "Ctrl+Z", disabled: !(tool.Busy || doc.CanUndo), action: () => this.Undo() },
                    { label: doc.RedoLabel ? `Redo ${doc.RedoLabel.toLowerCase()}` : "Redo", shortcut: "Ctrl+Y", disabled: !doc.CanRedo, action: () => this.Redo() },
                    sep,
                    { label: "Cut", shortcut: "Ctrl+X", disabled: !tool.HasSelection, action: () => tool.Cut() },
                    { label: "Copy", shortcut: "Ctrl+C", disabled: !tool.HasSelection, action: () => tool.Copy() },
                    { label: "Paste", shortcut: "Ctrl+V", disabled: !tool.CanPaste, action: () => tool.Paste() },
                    { label: "Clear selection", shortcut: "Del", disabled: !tool.HasSelection, action: () => tool.Delete() },
                    sep,
                    { label: "Select all", shortcut: "Ctrl+A", action: () => tool.SelectAll() },
                    { label: "Deselect", shortcut: "Ctrl+D", disabled: !tool.HasSelection, action: () => tool.Deselect() },
                    { label: "Crop to selection", disabled: !tool.HasSelection, action: () => this.CropToSelection() },
                    sep,
                    { label: "Flip selection horizontally", disabled: !tool.HasSelection, action: () => tool.FlipSelection(true) },
                    { label: "Flip selection vertically", disabled: !tool.HasSelection, action: () => tool.FlipSelection(false) },
                    { label: "Rotate selection clockwise", disabled: !tool.HasSelection, action: () => tool.RotateSelection(true) },
                    { label: "Rotate selection counter-clockwise", disabled: !tool.HasSelection, action: () => tool.RotateSelection(false) }
                ]
            },
            {
                label: "Sprite",
                items: () => [
                    { label: "Resize canvas…", action: () => this.ResizeCanvas() },
                    { label: "Crop to selection", disabled: !tool.HasSelection, action: () => this.CropToSelection() },
                    { label: "Shift picture…", action: () => this.ShiftPicture() },
                    sep,
                    { label: "Flip every frame horizontally", action: () => this.Transform(FlipHorizontal, "Flip sprite horizontally") },
                    { label: "Flip every frame vertically", action: () => this.Transform(FlipVertical, "Flip sprite vertically") },
                    { label: "Rotate every frame clockwise", action: () => this.Transform(RotateClockwise, "Rotate sprite clockwise") },
                    { label: "Rotate every frame counter-clockwise", action: () => this.Transform(RotateCounterClockwise, "Rotate sprite counter-clockwise") },
                    sep,
                    { label: "Flip this frame horizontally", action: () => this.EditFrame(FlipHorizontal(doc.Frame), "Flip frame horizontally") },
                    { label: "Flip this frame vertically", action: () => this.EditFrame(FlipVertical(doc.Frame), "Flip frame vertically") },
                    { label: "Clear this frame", action: () => this.ClearFrame() },
                    sep,
                    { label: "Reverse frame order", disabled: doc.FrameCount < 2, action: () => this.EditFrames(() => doc.ReverseFrames()) }
                ]
            },
            {
                label: "View",
                items: () => [
                    { label: "Zoom in", shortcut: "+", action: () => this.canvas.ZoomStep(1) },
                    { label: "Zoom out", shortcut: "-", action: () => this.canvas.ZoomStep(-1) },
                    { label: "Fit to window", shortcut: "0", action: () => this.canvas.Fit() },
                    { label: "Actual size", action: () => this.canvas.SetZoom(1) },
                    sep,
                    { label: "Pixel grid", checked: this.canvas.Grid, action: () => (this.canvas.Grid = !this.canvas.Grid) },
                    { label: "Onion skin", checked: this.canvas.Onion.enabled, disabled: doc.FrameCount < 2, action: () => this.SetOnion(!this.canvas.Onion.enabled) },
                    sep,
                    ...([["checker", "Checkerboard background"], ["dark", "Dark background"], ["light", "Light background"], ["magenta", "Magenta background"]] as Array<[BackdropKind, string]>).map(
                        ([kind, label]): MenuItem => ({ label, checked: this.canvas.Backdrop === kind, action: () => (this.canvas.Backdrop = kind) })
                    )
                ]
            },
            {
                label: "Palette",
                items: () => [
                    { label: "Extract palette from sprite…", action: () => this.ExtractFromSprite() },
                    { label: "Extract palette from image…", action: () => this.ExtractFromImage() },
                    sep,
                    { label: "Load palette…", action: () => this.LoadPalette() },
                    { label: "Save palette…", action: () => this.SavePalette() },
                    { label: "My palettes…", action: () => this.ManagePalettes() },
                    sep,
                    { label: "Import palette file…", action: () => this.ImportPaletteFile() },
                    { label: "Export palette file…", action: () => this.ExportPaletteFile() },
                    sep,
                    sort("Sort by brightness", "luminance"),
                    sort("Sort by hue", "hue"),
                    sort("Sort by most used", "frequency"),
                    {
                        label: "Remove unused colours",
                        action: () => {
                            tool.Flush();
                            this.Say(doc.RemoveUnusedColours() ? "Unused colours removed." : "Every colour is in use.");
                        }
                    },
                    sep,
                    {
                        label: "Channel mixer",
                        action: () => {
                            this.mixerDetails.open = true;
                            this.mixerDetails.scrollIntoView({ block: "nearest" });
                        }
                    }
                ]
            },
            {
                label: "Help",
                items: () => [{ label: "Keyboard shortcuts…", action: () => this.Alert("Keyboard shortcuts", Shortcuts) }]
            }
        ];
    }

    private SetOnion(enabled: boolean): void {
        this.canvas.SetOnion({ enabled });
        this.timeline.SetOnion(enabled);
    }

    // ------------------------------------------------------------------------------------------ picture operations

    private Transform(transform: (b: Bitmap) => Bitmap, label: string): void {
        this.tool.Flush();
        try {
            this.doc.TransformFrames(transform, label);
        } catch (error) {
            this.Fail(error, label);
        }
    }

    private EditFrame(bitmap: Bitmap, label: string): void {
        this.tool.Flush();
        this.doc.ReplaceFrame(bitmap, label);
    }

    private EditFrames(run: () => void): void {
        this.tool.Flush();
        run();
    }

    private ClearFrame(): void {
        this.tool.Flush();
        const draft = this.doc.CreateDraft();
        FillRegion(draft, { x: 0, y: 0, width: draft.width, height: draft.height }, Math.max(0, this.doc.TransparentIndex));
        this.doc.ReplaceFrame(draft, "Clear frame");
    }

    /** Cuts every frame down to the selected area, which becomes the whole canvas. */
    private CropToSelection(): void {
        const rect = this.tool.CropRect();
        if (!rect) {
            this.Say("Select the area to keep first - the Select tool (M).");
            return;
        }
        const cropped = this.doc.Crop(rect);
        // Its coordinates are the old canvas's now.
        this.tool.Deselect();
        this.Say(cropped ? `Cropped to ${rect.width}×${rect.height}.` : "The selection is the whole sprite, so there's nothing to crop.");
    }

    private async ResizeCanvas(): Promise<void> {
        this.tool.Flush();
        const values = await this.Ask(ResizeDialog(this.doc.Width, this.doc.Height));
        if (!values) {
            return;
        }
        try {
            this.doc.Resize(Number(values.width), Number(values.height), AnchorFromValue(values.anchor));
        } catch (error) {
            await this.Fail(error, "Resize canvas");
        }
    }

    private async ShiftPicture(): Promise<void> {
        this.tool.Flush();
        const values = await this.Ask(ShiftDialog());
        if (!values) {
            return;
        }
        const fill = Math.max(0, this.doc.TransparentIndex);
        this.doc.TransformFrames(frame => ShiftBitmap(frame, Number(values.dx), Number(values.dy), values.wrap === true, fill), "Shift picture");
    }

    // ------------------------------------------------------------------------------------------ palette operations

    private async ExtractFromSprite(): Promise<void> {
        this.tool.Flush();
        const values = await this.Ask(ExtractDialog("sprite", ""));
        if (!values) {
            return;
        }
        const { reduced } = this.doc.ExtractPaletteFromSprite(Number(values.colours), values.sort as PaletteSort);
        this.palette.SetForeground(Math.min(this.tool.settings.foreground, this.doc.Palette.length - 1));
        this.Say(reduced ? `Palette extracted: some similar colours were merged to fit ${this.doc.Palette.length}.` : `Palette extracted: ${this.doc.Palette.length} colours.`);
    }

    private async ExtractFromImage(): Promise<void> {
        this.tool.Flush();
        const file = await ChooseFile("image/*");
        if (!file) {
            return;
        }
        let image;
        try {
            image = await ImageFileToRgba(file);
        } catch (error) {
            await this.Fail(error, "Extract palette");
            return;
        }
        const values = await this.Ask(ExtractDialog("image", `${file.name} · ${image.width}×${image.height}. Its colours become a palette.`));
        if (!values) {
            return;
        }
        const { palette, exact } = ExtractPalette([image.rgba], Number(values.colours), values.sort as PaletteSort);
        const note = exact ? `${palette.length} colours` : `${palette.length} colours (merged from more)`;
        if (values.apply === "library") {
            this.SaveToLibrary(String(values.name), palette);
        } else if (values.apply === "load") {
            this.doc.LoadColours(palette);
            this.Say(`Palette extracted from ${file.name}: ${note}.`);
        } else {
            this.doc.RemapToPalette(palette);
            this.Say(`The sprite now uses the palette of ${file.name}: ${note}.`);
        }
    }

    private SaveToLibrary(name: string, colours: ReadonlyArray<Rgba>): void {
        const result = this.library.Save(name, colours);
        if (!result.ok) {
            this.Say(result.error, true);
        } else {
            this.Say(`${result.replaced ? "Replaced" : "Saved"} the palette "${name.trim()}"${result.persisted ? "." : " - but this browser wouldn't keep it, so it's gone when the page closes."}`, !result.persisted);
        }
    }

    private async LoadPalette(): Promise<void> {
        this.tool.Flush();
        const names = this.library.List().map(p => p.name);
        const chosen = await this.Ask(LoadPaletteDialog(names));
        if (!chosen) {
            return;
        }
        const palette = this.library.Get(String(chosen.palette));
        if (palette) {
            await this.UsePalette(palette.name, palette.colours, false, `The ${palette.colours.length} colours of "${palette.name}".`);
        }
    }

    /** Asks how to use a palette from outside (fill the slots, or re-match the sprite), and does it. */
    private async UsePalette(name: string, colours: ReadonlyArray<Rgba>, canSave: boolean, subtitle: string): Promise<void> {
        const values = await this.Ask(
            ApplyPaletteDialog({ title: `Use palette "${name}"`, subtitle, hasTransparent: colours.some(c => c.a === 0), canSave, suggestedName: name, existing: this.library.List().map(p => p.name) })
        );
        if (!values) {
            return;
        }
        const final = values.transparent === true ? WithTransparentFirst(colours) : colours.slice(0, MaxPaletteSize);
        if (values.apply === "match") {
            this.doc.RemapToPalette(final);
            this.Say(`The sprite now uses "${name}".`);
        } else {
            this.doc.LoadColours(final);
            this.Say(`"${name}" loaded into the palette.`);
        }
        if (canSave && values.save === true) {
            this.SaveToLibrary(String(values.name), colours);
        }
    }

    private async SavePalette(): Promise<void> {
        const values = await this.Ask(SavePaletteDialog(this.library.UnusedName(), this.library.List().map(p => p.name)));
        if (values) {
            this.SaveToLibrary(String(values.name), this.doc.Palette);
        }
    }

    private async ManagePalettes(): Promise<void> {
        const mine = this.library.List().slice(6).map(p => p.name);
        if (!mine.length) {
            await this.Alert("My palettes", "You haven't saved any palettes yet. Palette > Save palette… keeps the sprite's one.");
            return;
        }
        const values = await this.Ask(ManagePalettesDialog(mine));
        if (!values) {
            return;
        }
        const name = String(values.palette);
        if (values.action === "delete") {
            this.Say(this.library.Delete(name) ? `Deleted "${name}".` : "There's no such palette.");
        } else {
            const result = this.library.Rename(name, String(values.to));
            this.Say(result.ok ? `Renamed to "${String(values.to).trim()}".` : result.error, !result.ok);
        }
    }

    private async ImportPaletteFile(): Promise<void> {
        const file = await ChooseFile(".pal,.gpl,.json,.txt,.hex");
        if (!file) {
            return;
        }
        try {
            const parsed = ParsePalette(await ReadFileText(file));
            const name = parsed.name || file.name.replace(/\.[^.]*$/, "");
            await this.UsePalette(name, parsed.colours, true, `${parsed.colours.length} colours from ${file.name}${parsed.truncated ? " (only the first 256 are used)" : ""}.`);
        } catch (error) {
            await this.Fail(error, "Import palette");
        }
    }

    private async ExportPaletteFile(): Promise<void> {
        const values = await this.Ask(ExportPaletteDialog(this.origin.name));
        if (!values) {
            return;
        }
        const format = values.format as "json" | "pal" | "gpl";
        const name = String(values.name).trim();
        DownloadText(`${name.replace(/[^\w.-]+/g, "_")}.${format}`, FormatPalette(format, name, this.doc.Palette));
        this.Say(`Exported ${this.doc.Palette.length} colours as .${format}.`);
    }

    // ------------------------------------------------------------------------------------------ save and close

    /** Writes the sprite into the game's assets. True if it saved. */
    async Save(): Promise<boolean> {
        if (this.saving || this.closing) {
            return false;
        }
        this.tool.Flush();
        this.saving = true;
        this.saveButton.disabled = true;
        this.Say("Saving…");
        try {
            const state = this.doc.State;
            const frames = await Promise.all(state.frames.map(f => EncodeIndexedPng(state.width, state.height, f.data, state.palette)));
            const before = await ReadBundleHash(this.ctx.manifestUrl, this.origin.bundle);
            const result = await this.ctx.api.Save({
                bundle: this.origin.bundle,
                name: this.origin.name,
                mode: this.origin.mode,
                sheet: this.origin.sheet,
                category: this.origin.category,
                copyMetaFrom: this.origin.copyMetaFrom,
                frames
            });
            this.origin.mode = "overwrite";
            this.origin.copyMetaFrom = undefined;
            if (this.doc.State === state) {
                this.doc.MarkSaved();
            }
            this.DocumentChanged();
            if (result.changed) {
                this.origin.applied = true;
                this.origin.buildFrom = before === null ? undefined : before;
                this.Say(`Saved ${this.DisplayName} - the dev build is packing it…`);
                const build = WaitForBundleChange({ before, read: () => ReadBundleHash(this.ctx.manifestUrl, this.origin.bundle), timeoutMs: 30000, cancelled: () => this.closed });
                this.pendingBuild = build;
                build.then(outcome => {
                    if (this.pendingBuild === build && !this.closed) {
                        this.Say(outcome === "changed" ? `Saved ${this.DisplayName}. The level editor gets the new art when you close this window.` : `Saved ${this.DisplayName}.`);
                    }
                });
            } else {
                this.Say(`Saved ${this.DisplayName} (nothing had changed on disk).`);
            }
            const warning = result.notes.find(n => n.level !== "info");
            if (warning) {
                this.Say(warning.message, true);
            }
            return true;
        } catch (error) {
            await this.Fail(error, "Couldn't save");
            return false;
        } finally {
            this.saving = false;
            this.saveButton.disabled = false;
        }
    }

    /** Saves a copy under another name - and carries on editing that one. */
    async SaveAs(): Promise<void> {
        this.tool.Flush();
        let bundles;
        try {
            bundles = await this.ctx.api.List();
        } catch (error) {
            await this.Fail(error, "Couldn't save");
            return;
        }
        const taken = (bundles.find(b => b.name === this.origin.bundle) || { names: [] as string[] }).names;
        let suggestion = SuggestSpriteName(this.origin.name + "_copy");
        for (let n = 2; taken.indexOf(suggestion) >= 0; n++) {
            suggestion = SuggestSpriteName(`${this.origin.name}_copy${n}`);
        }
        const values = await this.Ask(
            SaveAsDialog({
                bundles,
                categories: this.ctx.categories as Category[],
                name: suggestion,
                bundle: this.origin.bundle,
                sheet: this.origin.sheet || "user",
                category: this.origin.category || this.ctx.categories[0].id,
                canCopyProperties: this.origin.mode === "overwrite"
            })
        );
        if (!values) {
            return;
        }
        const choice = ReadSaveAs(values);
        const previous = this.origin;
        this.origin = {
            ...previous,
            bundle: choice.bundle,
            name: choice.name,
            sheet: choice.sheet,
            category: choice.category,
            mode: "create",
            copyMetaFrom: choice.copyProperties ? previous.name : undefined
        };
        if (!(await this.Save())) {
            this.origin = previous;
            this.DocumentChanged();
        }
    }

    /** Throws away the edits and loads the sprite as it is on disk. */
    private async Revert(): Promise<void> {
        if (this.origin.mode !== "overwrite") {
            return;
        }
        if (this.doc.Dirty && !(await this.Confirm("Revert to saved?", `Throw away your changes to ${this.DisplayName} and load it as it was saved?`, "Revert", "Keep editing"))) {
            return;
        }
        try {
            const { frames } = await this.ctx.api.ReadSprite(this.origin.bundle, this.origin.name);
            const images = await Promise.all(frames.map(f => DecodePng(f)));
            this.tool.Cancel();
            this.doc.Reset(StateFromImages(images).state);
            this.canvas.Fit();
            this.Say("Reverted to the saved sprite.");
        } catch (error) {
            await this.Fail(error, "Couldn't revert");
        }
    }

    /** Close: asks first if there are unsaved edits. */
    async RequestClose(): Promise<void> {
        if (this.closing || this.closed) {
            return;
        }
        this.tool.Cancel();
        if (this.doc.Dirty && !(await this.Confirm("Close without saving?", `${this.DisplayName} has changes that aren't saved.`, "Close without saving", "Keep editing"))) {
            return;
        }
        await this.Close();
    }

    private async Close(): Promise<void> {
        if (this.closing) {
            return;
        }
        this.closing = true;
        const applied = this.origin.applied;
        if (applied) {
            // The page has to reload to see the new art: keep the level, wait for the pack, leave a note to come back to this sprite.
            this.busy = this.root.appendChild(El("div", "se-busy"));
            this.busy.appendChild(El("div", "", "Applying the saved art to the level editor…"));
            const skip = new Promise<void>(resolve => {
                const button = this.busy.appendChild(ButtonEl("ed-button", "Don't wait"));
                button.style.marginLeft = "14px";
                button.addEventListener("click", () => resolve());
            });
            this.busy.style.gap = "6px";
            this.ctx.persistLevel();
            WriteResumeNote(this.ctx.sessionStorage, { bundle: this.origin.bundle, name: this.origin.name, category: this.origin.category });
            if (this.pendingBuild) {
                await Promise.race([this.pendingBuild, skip]);
            }
        }
        this.Destroy();
        if (applied) {
            this.ctx.reload();
        }
        this.done(applied);
    }

    Destroy(): void {
        if (this.closed) {
            return;
        }
        this.closed = true;
        window.removeEventListener("keydown", this.onKeyCapture, true);
        window.removeEventListener("keyup", this.onKeyUp, true);
        window.removeEventListener("blur", this.onBlur);
        window.removeEventListener("beforeunload", this.onBeforeUnload);
        ClearRecovery(this.ctx.sessionStorage);
        window.clearTimeout(this.toastTimer);
        this.subscriptions.forEach(off => off());
        this.menu.Destroy();
        this.canvas.Destroy();
        this.toolbox.Destroy();
        this.palette.Destroy();
        this.mixer.Destroy();
        this.timeline.Destroy();
        this.root.remove();
        if (SpriteEditor.Active === this) {
            SpriteEditor.Active = null;
        }
    }

    // ------------------------------------------------------------------------------------------ for the tests and the page

    /** Puts the window back as a reload left it: on the frame it was on, with its unsaved edits still counting as unsaved. */
    Restore(frameIndex: number, dirty: boolean): void {
        this.doc.SetFrameIndex(frameIndex);
        if (dirty) {
            this.doc.MarkUnsaved();
        }
        if (this.origin.applied && this.origin.buildFrom) {
            // A save's rebuild may still be going: closing waits for it, as it would have without the reload.
            this.pendingBuild = WaitForBundleChange({ before: this.origin.buildFrom, read: () => ReadBundleHash(this.ctx.manifestUrl, this.origin.bundle), timeoutMs: 30000, cancelled: () => this.closed });
        }
        this.Say("The page reloaded; your sprite is back as you left it (undo history isn't kept).");
    }

    /** A message in the status bar and over the canvas. */
    Notify(text: string, error = false): void {
        this.Say(text, error);
    }

    get Document(): SpriteDocument {
        return this.doc;
    }
    get Tool(): ToolController {
        return this.tool;
    }
    get Origin(): SpriteOrigin {
        return this.origin;
    }
    get Root(): HTMLElement {
        return this.root;
    }
}

export { BrowserStorage };
