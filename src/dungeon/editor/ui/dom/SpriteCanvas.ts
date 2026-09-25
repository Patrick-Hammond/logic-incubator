/**
 * Draws sprite-sheet textures into plain `<canvas>` elements for the editor's
 * DOM UI - straight from the sheet's image via each texture's frame/trim
 * rects, so there's no GPU readback per thumbnail. Only type imports from
 * pixi, so `FitIcon` runs under the plain node test runner.
 */

import type { Texture } from "pixi.js";

export type RectLike = { x: number; y: number; width: number; height: number };

export type IconFit = { scale: number; x: number; y: number };

export type FitOptions = {
    /** Room left clear on every side of the box. */
    inset?: number;
    /** Largest scale allowed - 1 (the default) only ever shrinks. */
    maxScale?: number;
    /** Snap the scale (below 1) and position to 1/`steps` units; scales of 1 and above snap to whole numbers. Default 1. */
    steps?: number;
};

/**
 * Where to draw an icon so its `visible` pixels (a trimmed frame's offset and
 * size, relative to the icon's own origin) sit centred in a `box`-sized
 * square. Returns the scale and where to put the icon's origin. Snapping keeps
 * pixel art even: a scale of 1/4 steps drawn at 4x lands on whole pixels.
 */
export function FitIcon(visible: RectLike, box: number, options: FitOptions = {}): IconFit {
    const inset = options.inset || 0;
    const maxScale = options.maxScale != null ? options.maxScale : 1;
    const steps = options.steps || 1;
    const room = box - inset * 2;

    let scale = Math.min(maxScale, room / visible.width, room / visible.height);
    if (scale >= 1) {
        scale = Math.floor(scale);
    } else {
        // Too small to snap (e.g. whole-pixel steps below 1x) - keep the exact fit rather than 0.
        scale = Math.floor(scale * steps) / steps || scale;
    }
    const snap = (n: number) => Math.round(n * steps) / steps;
    return {
        scale,
        x: snap((box - visible.width * scale) / 2 - visible.x * scale),
        y: snap((box - visible.height * scale) / 2 - visible.y * scale)
    };
}

/** The drawn part of `texture` relative to its untrimmed origin. */
export function VisibleBounds(texture: Texture): RectLike {
    const trim = texture.trim;
    return trim
        ? { x: trim.x, y: trim.y, width: trim.width, height: trim.height }
        : { x: 0, y: 0, width: texture.frame.width, height: texture.frame.height };
}

/** Draws `texture` with its untrimmed origin at (`x`, `y`), scaled. */
export function DrawTexture(ctx: CanvasRenderingContext2D, texture: Texture, x: number, y: number, scale: number): void {
    const source = (texture.baseTexture.resource as unknown as { source?: CanvasImageSource }).source;
    if (!source) {
        return;
    }
    const res = texture.baseTexture.resolution || 1;
    const frame = texture.frame;
    const visible = VisibleBounds(texture);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
        source,
        frame.x * res,
        frame.y * res,
        frame.width * res,
        frame.height * res,
        x + visible.x * scale,
        y + visible.y * scale,
        visible.width * scale,
        visible.height * scale
    );
}

/** Data brushes are drawn as a tile-sized square of their colour, with their icon (if any) shrunk to fit inside. */
export const DATA_SWATCH_SIZE = 16;
/** How the icon sits on a data brush's swatch: a pixel of colour left showing round it, and quarter-pixel scales so it stays even at 4x. */
export const DATA_ICON_FIT: FitOptions = { inset: 1, steps: 4 };

/**
 * A data brush's look, the same as its sprite on the map (see `Palette`):
 * its colour at half opacity, with its icon's first frame fitted on top.
 */
export function DrawDataBrushSwatch(ctx: CanvasRenderingContext2D, colour: number, icon: Texture | null, scale: number): void {
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "#" + colour.toString(16).padStart(6, "0");
    ctx.fillRect(0, 0, DATA_SWATCH_SIZE * scale, DATA_SWATCH_SIZE * scale);
    ctx.globalAlpha = 1;
    if (icon) {
        const fit = FitIcon(VisibleBounds(icon), DATA_SWATCH_SIZE, DATA_ICON_FIT);
        DrawTexture(ctx, icon, fit.x * scale, fit.y * scale, fit.scale * scale);
    }
}

/** A `<canvas>` showing one brush - a sprite, an animation stepped with `SetFrame`, or a data brush's swatch. */
export default class SpriteCanvas {
    public readonly canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private frames: Texture[] = [];
    private frame = -1;
    private fit: IconFit = { scale: 1, x: 0, y: 0 };

    constructor(className?: string) {
        this.canvas = document.createElement("canvas");
        if (className) {
            this.canvas.className = className;
        }
        this.ctx = this.canvas.getContext("2d");
        this.Resize(0, 0);
    }

    get Animated(): boolean {
        return this.frames.length > 1;
    }

    /** Shows `frames` (one per animation frame) at `scale`, the canvas sized to their untrimmed size. */
    Show(frames: Texture[], scale: number): void {
        const orig = frames[0].orig;
        this.Resize(orig.width * scale, orig.height * scale);
        this.SetFrames(frames, { scale, x: 0, y: 0 });
    }

    /** Shows `frames` centred in a `box`-sized square canvas, at the largest whole-number scale their untrimmed size fits. */
    ShowFitted(frames: Texture[], box: number): void {
        const orig = frames[0].orig;
        this.Resize(box, box);
        this.SetFrames(frames, FitIcon({ x: 0, y: 0, width: orig.width, height: orig.height }, box, { maxScale: Infinity }));
    }

    ShowSwatch(colour: number, icon: Texture | null, scale: number): void {
        this.Resize(DATA_SWATCH_SIZE * scale, DATA_SWATCH_SIZE * scale);
        this.frames = [];
        this.frame = -1;
        DrawDataBrushSwatch(this.ctx, colour, icon, scale);
    }

    Clear(): void {
        this.frames = [];
        this.frame = -1;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    /** Draws animation frame `frame` (wrapping round), if it isn't the one already showing. */
    SetFrame(frame: number): void {
        if (!this.frames.length) {
            return;
        }
        const index = frame % this.frames.length;
        if (index !== this.frame) {
            this.frame = index;
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            DrawTexture(this.ctx, this.frames[index], this.fit.x, this.fit.y, this.fit.scale);
        }
    }

    private SetFrames(frames: Texture[], fit: IconFit): void {
        this.frames = frames;
        this.fit = fit;
        this.frame = -1;
        this.SetFrame(0);
    }

    /** Resizing a canvas wipes it (and its context settings), so only when the size actually changes. */
    private Resize(width: number, height: number): void {
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
        } else {
            this.ctx.clearRect(0, 0, width, height);
        }
    }
}
