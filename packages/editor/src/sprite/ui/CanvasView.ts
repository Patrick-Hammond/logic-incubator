/**
 * The big canvas the sprite is drawn on: the frame as it will be (with any stroke or floating selection in progress), through
 * the palette, over a checkerboard; the onion skin, grid, mirror guides, selection marquee and brush outline; and the
 * pointer, wheel and pan handling that turns the mouse into pixel coordinates for the `ToolController`. Drawing is on demand
 * (one frame after something changes), not a loop.
 */

import { Bitmap, BrushOffsets, Point } from "../Bitmap";
import { Rgba } from "../Colour";
import { SpriteDocument, ToRgba } from "../SpriteDocument";
import { PointerInfo, ToolController } from "../ToolController";
import { FitView, ImageCell, PanBy, StepZoom, View, ZoomAt } from "../Viewport";
import { El } from "../../ui/dom/Dom";

export type OnionSettings = { enabled: boolean; opacity: number };
export type BackdropKind = "checker" | "dark" | "light" | "magenta";

export type CanvasViewHooks = {
    /** The pixel under the pointer, or null when it leaves. */
    Hover(cell: Point | null): void;
    /** The zoom changed (for the status bar). */
    ViewChanged(view: View): void;
    /** A press on the canvas: the editor takes keyboard focus back. */
    Focus(): void;
};

const PrevTint = [255, 90, 90];
const NextTint = [90, 150, 255];

function CreateCanvas(width: number, height: number): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
}

/** RGBA bytes as a canvas of that size. */
function PaintCanvas(canvas: HTMLCanvasElement, rgba: Uint8Array): void {
    const ctx = canvas.getContext("2d");
    const image = ctx.createImageData(canvas.width, canvas.height);
    image.data.set(rgba);
    ctx.putImageData(image, 0, 0);
}

/** Draws the two-tone checkerboard that shows through transparency, over a rectangle, cells of `cell` pixels. */
export function DrawChecker(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, cell: number, a = "#3a3a40", b = "#2c2c31"): void {
    ctx.fillStyle = a;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = b;
    for (let cy = 0; cy * cell < h; cy++) {
        for (let cx = (cy & 1); cx * cell < w; cx += 2) {
            ctx.fillRect(x + cx * cell, y + cy * cell, Math.min(cell, w - cx * cell), Math.min(cell, h - cy * cell));
        }
    }
}

export default class CanvasView {
    readonly el: HTMLElement;
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private view: View = { zoom: 8, x: 0, y: 0 };
    private box = { w: 1, h: 1 };
    private dpr = 1;
    private laidOut = false;
    /** True once the user has zoomed or panned: from then on a resize leaves the view alone instead of fitting the sprite to the window again. */
    private userView = false;
    private shownSize = "";
    private scheduled = 0;
    private panning: { x: number; y: number; view: View } | null = null;
    private panHeld = false;
    private capture = false;
    private wheel = 0;
    private preview: Rgba[] | null = null;
    private frameCanvas: HTMLCanvasElement | null = null;
    private onionCache: { [key: string]: { bitmap: Bitmap; palette: ReadonlyArray<Rgba>; canvas: HTMLCanvasElement } } = {};
    private checker: CanvasPattern | null = null;
    private observer: ResizeObserver | null = null;
    private unsubscribe: Array<() => void> = [];
    private onion: OnionSettings = { enabled: false, opacity: 0.35 };
    private gridOn = true;
    private backdrop: BackdropKind = "checker";

    constructor(private doc: SpriteDocument, private tool: ToolController, private hooks: CanvasViewHooks) {
        this.el = El("div", "se-stage");
        this.canvas = this.el.appendChild(document.createElement("canvas"));
        this.canvas.className = "se-canvas";
        this.canvas.tabIndex = -1;
        this.ctx = this.canvas.getContext("2d");

        this.canvas.addEventListener("pointerdown", e => this.OnDown(e));
        this.canvas.addEventListener("pointermove", e => this.OnMove(e));
        this.canvas.addEventListener("pointerup", e => this.OnUp(e));
        this.canvas.addEventListener("pointercancel", e => this.OnUp(e));
        this.canvas.addEventListener("pointerleave", () => {
            if (!this.capture) {
                this.tool.PointerLeave();
                this.hooks.Hover(null);
            }
        });
        this.canvas.addEventListener("wheel", e => this.OnWheel(e), { passive: false });
        this.canvas.addEventListener("contextmenu", e => e.preventDefault());

        this.unsubscribe.push(doc.Subscribe(() => this.Render()), tool.Subscribe(() => this.Render()));
        if (typeof ResizeObserver !== "undefined") {
            this.observer = new ResizeObserver(() => this.Layout());
            this.observer.observe(this.el);
        }
    }

    // ------------------------------------------------------------------------------------------ settings

    get Grid(): boolean {
        return this.gridOn;
    }
    set Grid(on: boolean) {
        this.gridOn = on;
        this.Render();
    }

    get Backdrop(): BackdropKind {
        return this.backdrop;
    }
    set Backdrop(kind: BackdropKind) {
        this.backdrop = kind;
        this.Render();
    }

    get Onion(): OnionSettings {
        return this.onion;
    }
    SetOnion(settings: Partial<OnionSettings>): void {
        this.onion = { ...this.onion, ...settings };
        this.Render();
    }

    get View(): View {
        return this.view;
    }

    /** Draws with these colours instead of the sprite's own - the channel mixer's preview. Null goes back. */
    SetPreviewPalette(palette: Rgba[] | null): void {
        this.preview = palette;
        this.Render();
    }

    /** Space held: dragging pans instead of drawing. */
    SetPanHeld(held: boolean): void {
        this.panHeld = held;
        this.canvas.style.cursor = held ? "grab" : "";
    }

    // ------------------------------------------------------------------------------------------ view

    Fit(): void {
        this.userView = false;
        this.view = FitView(this.doc.Width, this.doc.Height, this.box.w, this.box.h);
        this.shownSize = this.doc.Width + "x" + this.doc.Height;
        this.hooks.ViewChanged(this.view);
        this.Render();
    }

    ZoomStep(direction: 1 | -1): void {
        this.ZoomTo(StepZoom(this.view.zoom, direction), this.box.w / 2, this.box.h / 2);
    }

    /** Zoom to an exact level (1 = one pixel per sprite pixel). */
    SetZoom(zoom: number): void {
        this.ZoomTo(zoom, this.box.w / 2, this.box.h / 2);
    }

    private ZoomTo(zoom: number, sx: number, sy: number): void {
        this.userView = true;
        const next = ZoomAt(this.view, zoom, sx, sy);
        this.view = { zoom: next.zoom, x: Math.round(next.x), y: Math.round(next.y) };
        this.hooks.ViewChanged(this.view);
        this.Render();
    }

    /** The point of the canvas under a mouse event, in CSS pixels. */
    private Local(e: MouseEvent): { x: number; y: number } {
        const rect = this.canvas.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    private Info(e: PointerEvent): PointerInfo {
        return { button: e.button === 2 ? 2 : 0, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey };
    }

    // ------------------------------------------------------------------------------------------ pointer

    private OnDown(e: PointerEvent): void {
        e.preventDefault();
        this.hooks.Focus();
        if (this.capture) {
            return;
        }
        const local = this.Local(e);
        try {
            this.canvas.setPointerCapture(e.pointerId);
        } catch {
            // A pointer that's already gone: the stroke goes on, it just can't follow the pointer off the canvas.
        }
        this.capture = true;
        if (e.button === 1 || this.panHeld) {
            this.panning = { x: local.x, y: local.y, view: this.view };
            this.canvas.style.cursor = "grabbing";
            return;
        }
        if (e.button === 0 || e.button === 2) {
            this.tool.PointerDown(ImageCell(this.view, local.x, local.y), this.Info(e));
        }
    }

    private OnMove(e: PointerEvent): void {
        const local = this.Local(e);
        const cell = ImageCell(this.view, local.x, local.y);
        this.hooks.Hover(cell);
        if (this.panning) {
            const p = this.panning;
            this.userView = true;
            this.view = PanBy(p.view, local.x - p.x, local.y - p.y, this.doc.Width, this.doc.Height, this.box.w, this.box.h);
            this.Render();
            return;
        }
        this.tool.PointerMove(cell, this.Info(e));
    }

    private OnUp(e: PointerEvent): void {
        if (!this.capture) {
            return;
        }
        this.capture = false;
        if (this.canvas.hasPointerCapture(e.pointerId)) {
            this.canvas.releasePointerCapture(e.pointerId);
        }
        if (this.panning) {
            this.panning = null;
            this.canvas.style.cursor = this.panHeld ? "grab" : "";
            return;
        }
        const local = this.Local(e);
        this.tool.PointerUp(ImageCell(this.view, local.x, local.y));
    }

    private OnWheel(e: WheelEvent): void {
        e.preventDefault();
        // A trackpad sends many small deltas; a wheel sends one big one. Either way, a notch's worth is one zoom step.
        this.wheel += e.deltaMode === 0 ? e.deltaY : e.deltaY * 40;
        if (Math.abs(this.wheel) < 40) {
            return;
        }
        const direction = this.wheel < 0 ? 1 : -1;
        this.wheel = 0;
        const local = this.Local(e);
        this.ZoomTo(StepZoom(this.view.zoom, direction), local.x, local.y);
    }

    // ------------------------------------------------------------------------------------------ drawing

    Layout(): void {
        const rect = this.el.getBoundingClientRect();
        const w = Math.max(1, Math.round(rect.width));
        const h = Math.max(1, Math.round(rect.height));
        this.dpr = window.devicePixelRatio || 1;
        this.canvas.width = Math.round(w * this.dpr);
        this.canvas.height = Math.round(h * this.dpr);
        this.canvas.style.width = w + "px";
        this.canvas.style.height = h + "px";
        const first = !this.laidOut;
        const resized = w !== this.box.w || h !== this.box.h;
        this.box = { w, h };
        this.laidOut = true;
        // The window settles after it opens (the frames below take their height a moment later), so the first fit can be for the wrong size:
        // until the user takes the view over, a resize fits the sprite to what's there now.
        if (rect.width > 0 && (first || (resized && !this.userView))) {
            this.Fit();
        } else {
            this.Render();
        }
    }

    Render(): void {
        if (!this.scheduled) {
            this.scheduled = requestAnimationFrame(() => {
                this.scheduled = 0;
                this.Draw();
            });
        }
    }

    /** Draws now (the next animation frame otherwise) - for the tests and the first paint. */
    DrawNow(): void {
        if (this.scheduled) {
            cancelAnimationFrame(this.scheduled);
            this.scheduled = 0;
        }
        this.Draw();
    }

    Destroy(): void {
        this.unsubscribe.forEach(off => off());
        this.unsubscribe = [];
        if (this.observer) {
            this.observer.disconnect();
        }
        if (this.scheduled) {
            cancelAnimationFrame(this.scheduled);
        }
        this.el.remove();
    }

    private Draw(): void {
        if (!this.laidOut) {
            return;
        }
        const size = this.doc.Width + "x" + this.doc.Height;
        if (size !== this.shownSize) {
            // The sprite changed shape (resize, rotate): show all of it.
            this.Fit();
            return;
        }
        const { ctx, view, box, dpr } = this;
        const w = this.doc.Width;
        const h = this.doc.Height;
        const z = view.zoom;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = "#17171a";
        ctx.fillRect(0, 0, box.w, box.h);

        const rx = view.x;
        const ry = view.y;
        const rw = w * z;
        const rh = h * z;
        this.DrawBackdrop(rx, ry, rw, rh);

        const palette = this.preview || this.doc.Palette;
        if (this.onion.enabled && this.doc.FrameCount > 1) {
            const index = this.doc.FrameIndex;
            const before = this.doc.Frames[(index - 1 + this.doc.FrameCount) % this.doc.FrameCount];
            const after = this.doc.Frames[(index + 1) % this.doc.FrameCount];
            ctx.globalAlpha = this.onion.opacity;
            ctx.drawImage(this.OnionCanvas("prev", before, palette, PrevTint), rx, ry, rw, rh);
            if (this.doc.FrameCount > 2) {
                ctx.drawImage(this.OnionCanvas("next", after, palette, NextTint), rx, ry, rw, rh);
            }
            ctx.globalAlpha = 1;
        }

        const bitmap = this.tool.PreviewFrame;
        if (!this.frameCanvas || this.frameCanvas.width !== bitmap.width || this.frameCanvas.height !== bitmap.height) {
            this.frameCanvas = CreateCanvas(bitmap.width, bitmap.height);
        }
        PaintCanvas(this.frameCanvas, ToRgba(palette, bitmap));
        ctx.drawImage(this.frameCanvas, rx, ry, rw, rh);

        if (this.gridOn && z >= 6) {
            this.DrawGrid(rx, ry, w, h, z);
        }
        ctx.strokeStyle = "rgba(255,255,255,0.35)";
        ctx.lineWidth = 1;
        ctx.strokeRect(Math.round(rx) - 0.5, Math.round(ry) - 0.5, Math.round(rw) + 1, Math.round(rh) + 1);

        this.DrawGuides(rx, ry, rw, rh);
        this.DrawMarquee(rx, ry, z);
        this.DrawCursor(rx, ry, w, h, z);
    }

    private DrawBackdrop(x: number, y: number, w: number, h: number): void {
        const { ctx } = this;
        switch (this.backdrop) {
            case "dark":
                ctx.fillStyle = "#101012";
                ctx.fillRect(x, y, w, h);
                return;
            case "light":
                ctx.fillStyle = "#e8e8ec";
                ctx.fillRect(x, y, w, h);
                return;
            case "magenta":
                ctx.fillStyle = "#ff00ff";
                ctx.fillRect(x, y, w, h);
                return;
        }
        if (!this.checker) {
            const tile = CreateCanvas(16, 16);
            DrawChecker(tile.getContext("2d"), 0, 0, 16, 16, 8);
            this.checker = ctx.createPattern(tile, "repeat");
        }
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
        ctx.translate(x, y);
        ctx.fillStyle = this.checker;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
    }

    private OnionCanvas(key: string, bitmap: Bitmap, palette: ReadonlyArray<Rgba>, tint: number[]): HTMLCanvasElement {
        const cached = this.onionCache[key];
        if (cached && cached.bitmap === bitmap && cached.palette === palette) {
            return cached.canvas;
        }
        const rgba = ToRgba(palette, bitmap);
        for (let i = 0; i < rgba.length; i += 4) {
            if (rgba[i + 3]) {
                rgba[i] = (rgba[i] + tint[0]) >> 1;
                rgba[i + 1] = (rgba[i + 1] + tint[1]) >> 1;
                rgba[i + 2] = (rgba[i + 2] + tint[2]) >> 1;
            }
        }
        const canvas = cached && cached.canvas.width === bitmap.width && cached.canvas.height === bitmap.height ? cached.canvas : CreateCanvas(bitmap.width, bitmap.height);
        PaintCanvas(canvas, rgba);
        this.onionCache[key] = { bitmap, palette, canvas };
        return canvas;
    }

    private DrawGrid(rx: number, ry: number, w: number, h: number, z: number): void {
        const { ctx, box } = this;
        const x0 = Math.max(1, Math.floor(-rx / z));
        const x1 = Math.min(w - 1, Math.ceil((box.w - rx) / z));
        const y0 = Math.max(1, Math.floor(-ry / z));
        const y1 = Math.min(h - 1, Math.ceil((box.h - ry) / z));
        ctx.lineWidth = 1;
        [false, true].forEach(major => {
            ctx.strokeStyle = major ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.11)";
            ctx.beginPath();
            for (let x = x0; x <= x1; x++) {
                if ((x % 8 === 0) === major) {
                    const sx = Math.round(rx + x * z) + 0.5;
                    ctx.moveTo(sx, Math.max(0, ry));
                    ctx.lineTo(sx, Math.min(box.h, ry + h * z));
                }
            }
            for (let y = y0; y <= y1; y++) {
                if ((y % 8 === 0) === major) {
                    const sy = Math.round(ry + y * z) + 0.5;
                    ctx.moveTo(Math.max(0, rx), sy);
                    ctx.lineTo(Math.min(box.w, rx + w * z), sy);
                }
            }
            ctx.stroke();
        });
    }

    /** The mirror axes, while mirroring is on. */
    private DrawGuides(rx: number, ry: number, rw: number, rh: number): void {
        const { ctx } = this;
        const { mirrorX, mirrorY } = this.tool.settings;
        if (!mirrorX && !mirrorY) {
            return;
        }
        ctx.save();
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = "rgba(255, 200, 60, 0.9)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (mirrorX) {
            ctx.moveTo(Math.round(rx + rw / 2) + 0.5, ry - 6);
            ctx.lineTo(Math.round(rx + rw / 2) + 0.5, ry + rh + 6);
        }
        if (mirrorY) {
            ctx.moveTo(rx - 6, Math.round(ry + rh / 2) + 0.5);
            ctx.lineTo(rx + rw + 6, Math.round(ry + rh / 2) + 0.5);
        }
        ctx.stroke();
        ctx.restore();
    }

    private DrawMarquee(rx: number, ry: number, z: number): void {
        const marquee = this.tool.Marquee;
        if (!marquee) {
            return;
        }
        const { ctx } = this;
        const x = Math.round(rx + marquee.x * z) + 0.5;
        const y = Math.round(ry + marquee.y * z) + 0.5;
        const w = Math.round(marquee.width * z) - 1;
        const h = Math.round(marquee.height * z) - 1;
        ctx.save();
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = "#000";
        ctx.strokeRect(x, y, w, h);
        ctx.lineDashOffset = 4;
        ctx.strokeStyle = "#fff";
        ctx.strokeRect(x, y, w, h);
        ctx.restore();
    }

    /** The brush's footprint under the pointer (and its mirror images). */
    private DrawCursor(rx: number, ry: number, w: number, h: number, z: number): void {
        const hover = this.tool.Hover;
        if (!hover || this.panning || this.panHeld) {
            return;
        }
        const { ctx } = this;
        const { tool, mirrorX, mirrorY, brushSize, brushShape } = this.tool.settings;
        const brush = tool === "pencil" || tool === "eraser" || tool === "line" || tool === "rect" || tool === "ellipse" ? BrushOffsets(brushSize, brushShape) : [{ x: 0, y: 0 }];
        const centres: Point[] = [hover];
        if (mirrorX) {
            centres.push({ x: w - 1 - hover.x, y: hover.y });
        }
        if (mirrorY) {
            centres.push({ x: hover.x, y: h - 1 - hover.y });
        }
        if (mirrorX && mirrorY) {
            centres.push({ x: w - 1 - hover.x, y: h - 1 - hover.y });
        }
        ctx.save();
        ctx.lineWidth = 1;
        centres.forEach((c, i) => {
            ctx.strokeStyle = i === 0 ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.5)";
            ctx.beginPath();
            brush.forEach(o => {
                const cx = c.x + o.x;
                const cy = c.y + o.y;
                if (cx >= 0 && cy >= 0 && cx < w && cy < h) {
                    ctx.rect(Math.round(rx + cx * z) + 0.5, Math.round(ry + cy * z) + 0.5, Math.max(1, Math.round(z) - 1), Math.max(1, Math.round(z) - 1));
                }
            });
            ctx.stroke();
        });
        ctx.restore();
    }
}
