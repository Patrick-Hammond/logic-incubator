/**
 * What the drawing tools do with the pointer, with no DOM in sight: the canvas view tells it where the pointer went
 * (in pixel coordinates) and draws `PreviewFrame` - the frame as it will be once the stroke or move in progress is
 * let go. A stroke paints into a draft; letting go commits it to the document as one undo step. Pure, so it runs under
 * the plain node test runner (see ToolController.test.ts).
 *
 * Selections are a marquee (a rectangle) that becomes "floating" - lifted off the frame - once it's moved, flipped,
 * rotated or pasted. A floating selection is dropped back onto the frame by `Flush`, which the caller runs before
 * anything else that edits the document (changing frame, saving...); undo and Escape cancel it instead.
 */

import {
    Bitmap, BrushOffsets, BrushShape, ClipRect, CloneBitmap, EllipsePoints, FillRegion, FlipHorizontal, FlipVertical, FloodFill, LinePoints, Mirror, PlotPoints, Point,
    ReadRegion, Rect, RectPoints, RotateClockwise, RotateCounterClockwise, WriteRegion
} from "./Bitmap";
import { Transparent } from "./Colour";
import { IndexImage } from "./Palette";
import { SpriteDocument, ToRgba } from "./SpriteDocument";

export type ToolId = "pencil" | "eraser" | "line" | "rect" | "ellipse" | "fill" | "picker" | "select";

export type ToolSettings = {
    tool: ToolId;
    /** Palette indices painted by the left and right buttons. */
    foreground: number;
    background: number;
    brushSize: number;
    brushShape: BrushShape;
    /** Rectangles and ellipses: solid, or just the outline. */
    filled: boolean;
    /** Fill: only the connected area, or every pixel of that colour. */
    contiguous: boolean;
    mirrorX: boolean;
    mirrorY: boolean;
};

export function DefaultToolSettings(): ToolSettings {
    return { tool: "pencil", foreground: 1, background: 0, brushSize: 1, brushShape: "square", filled: false, contiguous: true, mirrorX: false, mirrorY: false };
}

export type PointerInfo = {
    /** 0 = main button (paints the foreground), 2 = secondary (paints the background). */
    button: number;
    /** Held: pencil draws a line from the last point; shapes snap to a square / circle / 45 degrees. */
    shift: boolean;
    /** Held while dragging a selection: copies it instead of moving it. */
    ctrl: boolean;
    /** Held with a drawing tool: picks the colour under the pointer instead. */
    alt: boolean;
};

export const PlainPointer: PointerInfo = { button: 0, shift: false, ctrl: false, alt: false };

/** Pixels held for pasting, as colours rather than indices so they survive a palette change or another sprite. */
export type ClipboardImage = { width: number; height: number; rgba: Uint8Array };
export class SpriteClipboard {
    image: ClipboardImage | null = null;
}
/** What every editor window shares, so you can copy in one sprite and paste in another. */
export const SharedClipboard = new SpriteClipboard();

type Stroke = {
    kind: "freehand" | "shape";
    tool: ToolId;
    frame: number;
    /** The frame as it was (shapes redraw from it on every move). */
    base: Bitmap;
    draft: Bitmap;
    value: number;
    start: Point;
    last: Point;
};

type Floating = {
    bitmap: Bitmap;
    x: number;
    y: number;
    frame: number;
    /** The frame with the lifted pixels cleared out (or not, if this is a copy). */
    base: Bitmap;
    /** Where the selection was lifted from, for putting back on cancel. */
    origin: Rect | null;
    label: string;
    /** What counts as see-through when dropping the pixels back (-1: nothing). */
    skip: number;
};

type Drag = { kind: "marquee"; start: Point; moved: boolean } | { kind: "move"; dx: number; dy: number };

const Inside = (rect: Rect, p: Point): boolean => p.x >= rect.x && p.y >= rect.y && p.x < rect.x + rect.width && p.y < rect.y + rect.height;

const ShapeLabels: { [tool: string]: string } = { line: "Line", rect: "Rectangle", ellipse: "Ellipse" };

export class ToolController {
    private stroke: Stroke | null = null;
    private floating: Floating | null = null;
    private selection: Rect | null = null;
    private drag: Drag | null = null;
    private hover: Point | null = null;
    private lastPoint: Point | null = null;
    private committing = false;
    private composite: Bitmap | null = null;
    private listeners: Array<() => void> = [];
    private pickListeners: Array<(index: number, button: number) => void> = [];

    constructor(private doc: SpriteDocument, public settings: ToolSettings = DefaultToolSettings(), private clipboard: SpriteClipboard = SharedClipboard) {
        doc.Subscribe(() => this.DocumentChanged());
    }

    // ------------------------------------------------------------------------------------------ what to draw

    /** The current frame as it will be after the stroke or move in progress. */
    get PreviewFrame(): Bitmap {
        if (this.stroke) {
            return this.stroke.draft;
        }
        if (this.floating) {
            if (!this.composite) {
                this.composite = this.Composite(this.floating);
            }
            return this.composite;
        }
        return this.doc.Frame;
    }

    /** The selection rectangle - where the floating pixels are, if lifted. Floating ones can hang off the canvas. */
    get Marquee(): Rect | null {
        return this.floating ? { x: this.floating.x, y: this.floating.y, width: this.floating.bitmap.width, height: this.floating.bitmap.height } : this.selection;
    }

    /** Where the pointer last was over the canvas, for the brush outline - null once it's left. */
    get Hover(): Point | null {
        return this.hover;
    }

    /** True with a stroke or drag under way, or pixels floating: not a time for undo or changing frame. */
    get Busy(): boolean {
        return !!(this.stroke || this.floating || this.drag);
    }

    get HasSelection(): boolean {
        return !!(this.selection || this.floating);
    }

    get CanPaste(): boolean {
        return !!this.clipboard.image;
    }

    Subscribe(listener: () => void): () => void {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    /** Called when the picker (or alt-click) takes a colour: the palette index, and the button - 0 for the foreground, 2 for the background. */
    SubscribePick(listener: (index: number, button: number) => void): () => void {
        this.pickListeners.push(listener);
        return () => {
            this.pickListeners = this.pickListeners.filter(l => l !== listener);
        };
    }

    private Changed(): void {
        this.listeners.slice().forEach(l => l());
    }

    /** Picks a tool. Floating pixels are put down first, since most tools would otherwise paint round them. */
    SetTool(tool: ToolId): void {
        if (tool !== this.settings.tool) {
            this.Flush();
            this.settings.tool = tool;
            this.Changed();
        }
    }

    /** The settings object was changed by whoever holds it (brush size, mirroring...): tells the listeners. */
    SettingsChanged(): void {
        this.Changed();
    }

    // ------------------------------------------------------------------------------------------ pointer

    PointerDown(p: Point, info: PointerInfo = PlainPointer): void {
        this.hover = p;
        if (this.stroke || this.drag) {
            return;
        }
        const tool = this.settings.tool;
        if (tool === "select") {
            this.SelectDown(p, info);
            this.Changed();
            return;
        }
        this.Flush();
        if (tool === "picker" || info.alt) {
            this.Pick(p, info.button);
            this.Changed();
            return;
        }
        const value = tool === "eraser" ? this.EraseValue() : info.button === 2 ? this.settings.background : this.settings.foreground;
        const frame = this.doc.FrameIndex;
        if (tool === "fill") {
            const draft = this.doc.CreateDraft();
            FloodFill(draft, p.x, p.y, value, !this.settings.contiguous);
            this.Commit(draft, "Fill", frame);
            this.lastPoint = p;
            this.Changed();
            return;
        }
        const base = this.doc.Frame;
        if (tool === "pencil" || tool === "eraser") {
            const start = info.shift && this.lastPoint ? this.lastPoint : p;
            const draft = CloneBitmap(base);
            PlotPoints(draft, LinePoints(start, p), this.Brush(), value, this.Mirror());
            this.stroke = { kind: "freehand", tool, frame, base, draft, value, start, last: p };
        } else {
            const draft = CloneBitmap(base);
            this.stroke = { kind: "shape", tool, frame, base, draft, value, start: p, last: p };
            this.DrawShape(this.stroke, p, info);
        }
        this.lastPoint = p;
        this.Changed();
    }

    PointerMove(p: Point, info: PointerInfo = PlainPointer): void {
        this.hover = p;
        if (this.stroke) {
            const stroke = this.stroke;
            if (stroke.kind === "freehand") {
                PlotPoints(stroke.draft, LinePoints(stroke.last, p), this.Brush(), stroke.value, this.Mirror());
                stroke.last = p;
                this.lastPoint = p;
            } else {
                this.DrawShape(stroke, p, info);
            }
        } else if (this.drag) {
            this.DragTo(p);
        }
        this.Changed();
    }

    /** The pointer left the canvas (without a button down). */
    PointerLeave(): void {
        if (this.hover && !this.stroke && !this.drag) {
            this.hover = null;
            this.Changed();
        }
    }

    PointerUp(p?: Point): void {
        if (p) {
            this.hover = p;
        }
        if (this.stroke) {
            const stroke = this.stroke;
            this.stroke = null;
            const label = stroke.kind === "freehand" ? (stroke.tool === "eraser" ? "Erase" : "Draw") : ShapeLabels[stroke.tool];
            this.Commit(stroke.draft, label, stroke.frame);
        } else if (this.drag) {
            const drag = this.drag;
            this.drag = null;
            if (drag.kind === "marquee" && !drag.moved) {
                // A click without a drag: nothing selected.
                this.selection = null;
            }
        }
        this.Changed();
    }

    /** Escape: drops the stroke or the floating pixels as if they'd never been started. */
    Cancel(): boolean {
        if (!this.Busy && !this.selection) {
            return false;
        }
        if (this.floating) {
            this.selection = this.floating.origin;
        } else if (!this.stroke && !this.drag) {
            // Nothing in progress: Escape just deselects.
            this.selection = null;
        }
        this.stroke = null;
        this.floating = null;
        this.drag = null;
        this.composite = null;
        this.Changed();
        return true;
    }

    /**
     * Undo, for a window that routes it here first: if a stroke or floating selection is pending it's thrown away and
     * true comes back (so the caller doesn't also undo the document); otherwise false.
     */
    UndoFirst(): boolean {
        if (!this.Busy) {
            return false;
        }
        this.Cancel();
        return true;
    }

    /** Puts floating pixels down where they are - the selection stays selected. True if there was anything to do. */
    Flush(): boolean {
        if (this.stroke) {
            return false;
        }
        const floating = this.floating;
        if (!floating) {
            return false;
        }
        this.drag = null;
        this.floating = null;
        const result = this.Composite(floating);
        this.composite = null;
        const clipped = ClipRect(result, { x: floating.x, y: floating.y, width: floating.bitmap.width, height: floating.bitmap.height });
        this.selection = clipped.width > 0 && clipped.height > 0 ? clipped : null;
        this.Commit(result, floating.label, floating.frame);
        this.Changed();
        return true;
    }

    // ------------------------------------------------------------------------------------------ drawing

    private Brush(): Point[] {
        return BrushOffsets(this.settings.brushSize, this.settings.brushShape);
    }

    private Mirror(): Mirror {
        return { x: this.settings.mirrorX, y: this.settings.mirrorY };
    }

    /** The index the eraser paints: the transparent entry - made if the palette has none and there's room. */
    private EraseValue(): number {
        let index = this.doc.TransparentIndex;
        if (index < 0) {
            index = this.doc.AddColour({ ...Transparent });
        }
        return index >= 0 ? index : this.settings.background;
    }

    private DrawShape(stroke: Stroke, to: Point, info: PointerInfo): void {
        stroke.draft = CloneBitmap(stroke.base);
        stroke.last = to;
        const end = info.shift ? Constrain(stroke.start, to, stroke.tool) : to;
        let points: Point[];
        let brush: Point[];
        switch (stroke.tool) {
            case "line":
                points = LinePoints(stroke.start, end);
                brush = this.Brush();
                break;
            case "rect":
                points = RectPoints(stroke.start, end, this.settings.filled);
                brush = this.settings.filled ? [{ x: 0, y: 0 }] : this.Brush();
                break;
            default:
                points = EllipsePoints(stroke.start, end, this.settings.filled);
                brush = this.settings.filled ? [{ x: 0, y: 0 }] : this.Brush();
                break;
        }
        PlotPoints(stroke.draft, points, brush, stroke.value, this.Mirror());
    }

    private Pick(p: Point, button: number): void {
        const frame = this.doc.Frame;
        if (p.x < 0 || p.y < 0 || p.x >= frame.width || p.y >= frame.height) {
            return;
        }
        const index = frame.data[p.y * frame.width + p.x];
        this.pickListeners.slice().forEach(l => l(index, button));
    }

    private Commit(bitmap: Bitmap, label: string, frame: number): void {
        const current = this.doc.Frames[frame];
        if (!current || current.width !== bitmap.width || current.height !== bitmap.height) {
            return;
        }
        this.committing = true;
        try {
            this.doc.ReplaceFrame(bitmap, label, frame);
        } finally {
            this.committing = false;
        }
    }

    // ------------------------------------------------------------------------------------------ selection

    private SelectDown(p: Point, info: PointerInfo): void {
        const marquee = this.Marquee;
        if (marquee && Inside(marquee, p)) {
            if (!this.floating) {
                this.Lift(info.ctrl);
            }
            this.drag = { kind: "move", dx: p.x - this.floating.x, dy: p.y - this.floating.y };
            return;
        }
        this.Flush();
        const clamped = this.Clamp(p);
        this.selection = { x: clamped.x, y: clamped.y, width: 1, height: 1 };
        this.drag = { kind: "marquee", start: clamped, moved: false };
    }

    private DragTo(p: Point): void {
        const drag = this.drag;
        if (drag.kind === "move") {
            if (this.floating) {
                this.floating.x = p.x - drag.dx;
                this.floating.y = p.y - drag.dy;
                this.composite = null;
            }
            return;
        }
        const c = this.Clamp(p);
        if (c.x !== drag.start.x || c.y !== drag.start.y) {
            drag.moved = true;
        }
        const x0 = Math.min(drag.start.x, c.x);
        const y0 = Math.min(drag.start.y, c.y);
        this.selection = { x: x0, y: y0, width: Math.abs(drag.start.x - c.x) + 1, height: Math.abs(drag.start.y - c.y) + 1 };
    }

    private Clamp(p: Point): Point {
        const frame = this.doc.Frame;
        return { x: Math.max(0, Math.min(frame.width - 1, p.x)), y: Math.max(0, Math.min(frame.height - 1, p.y)) };
    }

    /** What the cleared hole of a lifted selection - and the see-through part of a floating one - is: transparent, if the palette has it. */
    private SkipIndex(): number {
        return this.doc.TransparentIndex;
    }

    /** Lifts the marquee's pixels off the frame so they can move; `copy` leaves the original in place. */
    private Lift(copy: boolean, label = "Move selection"): void {
        if (this.floating || !this.selection) {
            return;
        }
        const frame = this.doc.Frame;
        const rect = ClipRect(frame, this.selection);
        const base = CloneBitmap(frame);
        const skip = this.SkipIndex();
        if (!copy) {
            FillRegion(base, rect, skip >= 0 ? skip : this.settings.background);
        }
        this.floating = { bitmap: ReadRegion(frame, rect), x: rect.x, y: rect.y, frame: this.doc.FrameIndex, base, origin: rect, label: copy ? "Copy selection" : label, skip };
        this.selection = null;
        this.composite = null;
    }

    private Composite(floating: Floating): Bitmap {
        const out = CloneBitmap(floating.base);
        WriteRegion(out, floating.bitmap, floating.x, floating.y, floating.skip);
        return out;
    }

    SelectAll(): void {
        this.Flush();
        const frame = this.doc.Frame;
        this.selection = { x: 0, y: 0, width: frame.width, height: frame.height };
        this.Changed();
    }

    Deselect(): void {
        this.Flush();
        this.selection = null;
        this.Changed();
    }

    /** Copies the selection to the clipboard (as colours). False if nothing is selected. */
    Copy(): boolean {
        const pixels = this.SelectionPixels();
        if (!pixels) {
            return false;
        }
        this.clipboard.image = { width: pixels.width, height: pixels.height, rgba: ToRgba(this.doc.Palette, pixels) };
        return true;
    }

    /** Copies the selection, then clears it. */
    Cut(): boolean {
        if (!this.Copy()) {
            return false;
        }
        return this.Delete("Cut");
    }

    /** Clears the selection to transparent. */
    Delete(label = "Delete selection"): boolean {
        if (this.floating) {
            // The lifted pixels just don't get put back: the frame under them has the hole already (or, for a copy, never lost anything).
            const floating = this.floating;
            this.floating = null;
            this.composite = null;
            this.selection = null;
            this.Commit(floating.base, label, floating.frame);
            this.Changed();
            return true;
        }
        if (!this.selection) {
            return false;
        }
        const draft = this.doc.CreateDraft();
        const skip = this.SkipIndex();
        FillRegion(draft, this.selection, skip >= 0 ? skip : this.settings.background);
        this.Commit(draft, label, this.doc.FrameIndex);
        this.Changed();
        return true;
    }

    /** Pastes the clipboard as floating pixels at the top-left corner, and switches to the select tool. */
    Paste(): boolean {
        const image = this.clipboard.image;
        if (!image) {
            return false;
        }
        this.Flush();
        const bitmap: Bitmap = { width: image.width, height: image.height, data: IndexImage(image.rgba, this.doc.Palette) };
        const skip = this.SkipIndex();
        this.floating = { bitmap, x: 0, y: 0, frame: this.doc.FrameIndex, base: CloneBitmap(this.doc.Frame), origin: null, label: "Paste", skip };
        this.selection = null;
        this.composite = null;
        this.settings.tool = "select";
        this.Changed();
        return true;
    }

    /**
     * The area to crop to: the selection, as it lies on the frame. Floating pixels are put down first. Null if nothing is selected, or
     * none of it is on the frame.
     */
    CropRect(): Rect | null {
        this.Flush();
        if (!this.selection) {
            return null;
        }
        const r = ClipRect(this.doc.Frame, this.selection);
        return r.width > 0 && r.height > 0 ? r : null;
    }

    /** Moves the selected pixels (lifting them first) by whole pixels - the arrow keys. False if nothing is selected. */
    NudgeSelection(dx: number, dy: number): boolean {
        if (this.stroke) {
            return false;
        }
        if (!this.floating) {
            this.Lift(false);
        }
        if (!this.floating) {
            return false;
        }
        this.floating.x += dx;
        this.floating.y += dy;
        this.composite = null;
        this.Changed();
        return true;
    }

    FlipSelection(horizontal: boolean): boolean {
        return this.TransformSelection(horizontal ? FlipHorizontal : FlipVertical, "Flip selection");
    }

    RotateSelection(clockwise: boolean): boolean {
        return this.TransformSelection(clockwise ? RotateClockwise : RotateCounterClockwise, "Rotate selection");
    }

    private TransformSelection(transform: (b: Bitmap) => Bitmap, label: string): boolean {
        if (!this.floating) {
            this.Lift(false, label);
        }
        const floating = this.floating;
        if (!floating) {
            return false;
        }
        const before = floating.bitmap;
        const after = transform(before);
        // Turn about the middle, so a rotated selection stays where it was.
        floating.x = Math.round(floating.x + before.width / 2 - after.width / 2);
        floating.y = Math.round(floating.y + before.height / 2 - after.height / 2);
        floating.bitmap = after;
        floating.label = label;
        this.composite = null;
        this.Changed();
        return true;
    }

    /** The selected pixels as a bitmap - the floating ones, or the marquee's part of the frame. */
    private SelectionPixels(): Bitmap | null {
        if (this.floating) {
            return CloneBitmap(this.floating.bitmap);
        }
        if (this.selection) {
            const pixels = ReadRegion(this.doc.Frame, this.selection);
            return pixels.width > 0 && pixels.height > 0 ? pixels : null;
        }
        return null;
    }

    // ------------------------------------------------------------------------------------------ the document moved under us

    private DocumentChanged(): void {
        if (this.committing || !(this.stroke || this.floating)) {
            return;
        }
        const frame = this.stroke ? this.stroke.frame : this.floating.frame;
        const base = this.stroke ? this.stroke.base : this.floating.base;
        const now = this.doc.Frames[frame];
        if (!now || now.width !== base.width || now.height !== base.height) {
            // The frame it was working on is gone (or resized): nothing sensible to put it back on.
            this.stroke = null;
            this.floating = null;
            this.drag = null;
            this.selection = null;
            this.composite = null;
            this.Changed();
        } else if (this.doc.FrameIndex !== frame) {
            if (this.stroke) {
                this.stroke = null;
                this.drag = null;
                this.Changed();
            } else {
                this.Flush();
            }
        }
    }
}

/** `end` pulled in line with `start` for shift: a square / circle for boxes, a multiple of 45 degrees for lines. */
export function Constrain(start: Point, end: Point, tool: ToolId): Point {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (tool === "line") {
        if (ax > 2 * ay) {
            return { x: end.x, y: start.y };
        }
        if (ay > 2 * ax) {
            return { x: start.x, y: end.y };
        }
    }
    const size = Math.max(ax, ay);
    return { x: start.x + (dx < 0 ? -size : size), y: start.y + (dy < 0 ? -size : size) };
}
