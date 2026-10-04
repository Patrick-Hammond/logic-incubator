/**
 * The sprite being edited: one palette (up to 256 colours with alpha) and one or more equally sized frames of palette
 * indices, plus the undo history. The state is immutable - every edit makes a new state that shares whatever it
 * didn't touch, so undo is just keeping the old one (a pixel edit costs one frame's worth of bytes, not a copy of the
 * sprite). Pure - no DOM - so it runs under the plain node test runner (see SpriteDocument.test.ts).
 *
 * A committed frame is never modified: tools paint into a clone ("draft") and hand it to `ReplaceFrame`.
 */

import { Bitmap, ClipRect, CloneBitmap, CountUsage, CreateBitmap, ReadRegion, Rect, ResizeBitmap } from "./Bitmap";
import { Mixer, MixPalette } from "./ChannelMixer";
import { Rgba, SameColour } from "./Colour";
import { ClonePalette, CompactPalette, DefaultPalette, ExtractPalette, IndexImage, MaxPaletteSize, NearestIndex, PaletteSort, RemapIndices, SortPalette, TransparentIndex } from "./Palette";
import { DecodedPng } from "./Png";

export const MaxCanvasSize = 512;
export const MaxFrames = 100;
/** How many edits undo remembers. */
export const MaxHistory = 100;
/** Edits with the same key (dragging a colour slider...) closer together than this undo as one. */
export const CoalesceMs = 800;

export type SpriteState = {
    readonly width: number;
    readonly height: number;
    readonly palette: ReadonlyArray<Rgba>;
    readonly frames: ReadonlyArray<Bitmap>;
};

/** A frame as RGBA bytes (4 per pixel); an index with no palette entry shows as transparent. */
export function ToRgba(palette: ReadonlyArray<Rgba>, bitmap: Bitmap): Uint8Array {
    const out = new Uint8Array(bitmap.width * bitmap.height * 4);
    for (let i = 0; i < bitmap.data.length; i++) {
        const c = palette[bitmap.data[i]];
        if (c) {
            out[i * 4] = c.r;
            out[i * 4 + 1] = c.g;
            out[i * 4 + 2] = c.b;
            out[i * 4 + 3] = c.a;
        }
    }
    return out;
}

function SamePalette(a: ReadonlyArray<Rgba>, b: ReadonlyArray<Rgba>): boolean {
    return a.length === b.length && a.every((c, i) => SameColour(c, b[i]));
}

/** A new sprite: transparent, with the default 256-colour palette. */
export function BlankState(width: number, height: number): SpriteState {
    CheckSize(width, height);
    return { width, height, palette: DefaultPalette(), frames: [CreateBitmap(width, height, 0)] };
}

function CheckSize(width: number, height: number): void {
    if (!(width >= 1 && height >= 1 && width <= MaxCanvasSize && height <= MaxCanvasSize) || width !== Math.floor(width) || height !== Math.floor(height)) {
        throw new Error(`A sprite is between 1x1 and ${MaxCanvasSize}x${MaxCanvasSize} pixels - not ${width}x${height}.`);
    }
}

export type ImportedState = {
    state: SpriteState;
    /** Where the palette came from: the images' own (every one was indexed, with the same palette) or extracted from their colours. */
    source: "indexed" | "rgba";
    /** True if there were more colours than fit, so some were merged. */
    reduced: boolean;
};

/**
 * A sprite from decoded images, one per frame. Indexed PNGs that share a palette keep it exactly (so a saved sprite
 * opens just as it was); anything else has its colours extracted into a new palette.
 */
export function StateFromImages(images: ReadonlyArray<DecodedPng>): ImportedState {
    if (!images.length) {
        throw new Error("A sprite needs at least one frame.");
    }
    const { width, height } = images[0];
    CheckSize(width, height);
    if (images.length > MaxFrames) {
        throw new Error(`That's ${images.length} frames; the editor handles up to ${MaxFrames}.`);
    }
    images.forEach((image, i) => {
        if (image.width !== width || image.height !== height) {
            throw new Error(`Frame ${i} is ${image.width}x${image.height} but frame 0 is ${width}x${height} - every frame has to be the same size.`);
        }
    });
    const first = images[0].indexed;
    if (first && images.every(image => image.indexed && SamePalette(image.indexed.palette, first.palette))) {
        return {
            state: { width, height, palette: ClonePalette(first.palette), frames: images.map(image => ({ width, height, data: image.indexed.indices.slice() })) },
            source: "indexed",
            reduced: false
        };
    }
    const { palette, exact } = ExtractPalette(images.map(image => image.rgba), MaxPaletteSize, "luminance");
    return {
        state: { width, height, palette, frames: images.map(image => ({ width, height, data: IndexImage(image.rgba, palette) })) },
        source: "rgba",
        reduced: !exact
    };
}

type HistoryEntry = {
    /** The state to go back to (on the undo stack) or forward to (on the redo stack). */
    state: SpriteState;
    label: string;
    key: string | null;
    time: number;
    frameBefore: number;
    frameAfter: number;
};

export type Anchor = { x: number; y: number };

export class SpriteDocument {
    private state: SpriteState;
    private saved: SpriteState;
    private frame = 0;
    private past: HistoryEntry[] = [];
    private future: HistoryEntry[] = [];
    private listeners: Array<() => void> = [];

    constructor(state: SpriteState, private clock: () => number = () => Date.now()) {
        this.state = state;
        this.saved = state;
    }

    // ------------------------------------------------------------------------------------------ reading

    get State(): SpriteState {
        return this.state;
    }
    get Width(): number {
        return this.state.width;
    }
    get Height(): number {
        return this.state.height;
    }
    get Palette(): ReadonlyArray<Rgba> {
        return this.state.palette;
    }
    get Frames(): ReadonlyArray<Bitmap> {
        return this.state.frames;
    }
    get FrameCount(): number {
        return this.state.frames.length;
    }
    get FrameIndex(): number {
        return this.frame;
    }
    /** The frame being edited. Don't change it - paint into a clone and `ReplaceFrame`. */
    get Frame(): Bitmap {
        return this.state.frames[this.frame];
    }
    /** True if there are edits since the last `MarkSaved` (or since opening). */
    get Dirty(): boolean {
        return this.state !== this.saved;
    }
    get CanUndo(): boolean {
        return this.past.length > 0;
    }
    get CanRedo(): boolean {
        return this.future.length > 0;
    }
    /** What `Undo` would undo, for a menu - or null. */
    get UndoLabel(): string | null {
        return this.past.length ? this.past[this.past.length - 1].label : null;
    }
    get RedoLabel(): string | null {
        return this.future.length ? this.future[this.future.length - 1].label : null;
    }

    /** The palette index the eraser paints (the first transparent entry), or -1 if there isn't one. */
    get TransparentIndex(): number {
        return TransparentIndex(this.state.palette);
    }

    /** How many pixels across all frames use each palette entry. */
    UsageCounts(): number[] {
        return CountUsage(this.state.frames, Math.max(MaxPaletteSize, this.state.palette.length));
    }

    /** A copy of the current frame to paint into. */
    CreateDraft(): Bitmap {
        return CloneBitmap(this.Frame);
    }

    Subscribe(listener: () => void): () => void {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    // ------------------------------------------------------------------------------------------ history

    /** Starts over from `state`: nothing to undo, nothing unsaved, frame 0 - "revert to what's on disk". */
    Reset(state: SpriteState): void {
        this.state = state;
        this.saved = state;
        this.past = [];
        this.future = [];
        this.frame = 0;
        this.Notify();
    }

    /** Counts the sprite as having edits that aren't saved, whatever its history says - for one put back after a reload. */
    MarkUnsaved(): void {
        this.saved = { ...this.state };
        this.Notify();
    }

    MarkSaved(): void {
        this.saved = this.state;
        // Whatever comes next is a new edit, not a continuation of one that's now on disk.
        if (this.past.length) {
            this.past[this.past.length - 1].key = null;
        }
        this.Notify();
    }

    Undo(): boolean {
        const entry = this.past.pop();
        if (!entry) {
            return false;
        }
        this.future.push({ ...entry, state: this.state });
        this.state = entry.state;
        this.frame = Math.min(entry.frameBefore, this.state.frames.length - 1);
        this.Notify();
        return true;
    }

    Redo(): boolean {
        const entry = this.future.pop();
        if (!entry) {
            return false;
        }
        this.past.push({ ...entry, state: this.state, key: null });
        this.state = entry.state;
        this.frame = Math.min(entry.frameAfter, this.state.frames.length - 1);
        this.Notify();
        return true;
    }

    private Commit(next: SpriteState, label: string, key: string | null = null, frameAfter: number = this.frame): void {
        const now = this.clock();
        const top = this.past.length ? this.past[this.past.length - 1] : null;
        if (key && top && top.key === key && now - top.time < CoalesceMs && !this.future.length) {
            top.time = now;
            top.frameAfter = frameAfter;
        } else {
            this.past.push({ state: this.state, label, key, time: now, frameBefore: this.frame, frameAfter });
            if (this.past.length > MaxHistory) {
                this.past.shift();
            }
        }
        this.future = [];
        this.state = next;
        this.frame = frameAfter;
        this.Notify();
    }

    private Notify(): void {
        this.listeners.slice().forEach(listener => listener());
    }

    // ------------------------------------------------------------------------------------------ frames

    /** Chooses the frame to edit - no history; out of range is clamped. */
    SetFrameIndex(index: number): void {
        const next = Math.max(0, Math.min(this.state.frames.length - 1, Math.round(index)));
        if (next !== this.frame) {
            this.frame = next;
            this.Notify();
        }
    }

    /** Puts `bitmap` in as frame `index` (default: the current one). False if it's the same picture already. */
    ReplaceFrame(bitmap: Bitmap, label: string, index: number = this.frame): boolean {
        const old = this.state.frames[index];
        if (!old || bitmap.width !== old.width || bitmap.height !== old.height) {
            throw new Error("A frame has to be the same size as the sprite.");
        }
        if (SameData(old.data, bitmap.data)) {
            return false;
        }
        const frames = this.state.frames.slice();
        frames[index] = bitmap;
        this.Commit({ ...this.state, frames }, label, null, index);
        return true;
    }

    /** Adds a frame after `after` (default: the current one) - blank, or a copy of it - and selects it. False at the frame limit. */
    AddFrame(copy: boolean, after: number = this.frame): boolean {
        if (this.state.frames.length >= MaxFrames) {
            return false;
        }
        const source = this.state.frames[after];
        const fresh = copy ? CloneBitmap(source) : CreateBitmap(this.state.width, this.state.height, this.BlankIndex());
        const frames = this.state.frames.slice();
        frames.splice(after + 1, 0, fresh);
        this.Commit({ ...this.state, frames }, copy ? "Duplicate frame" : "Add frame", null, after + 1);
        return true;
    }

    /** Removes frame `index`; a sprite always keeps at least one. */
    RemoveFrame(index: number = this.frame): boolean {
        if (this.state.frames.length <= 1 || index < 0 || index >= this.state.frames.length) {
            return false;
        }
        const frames = this.state.frames.slice();
        frames.splice(index, 1);
        this.Commit({ ...this.state, frames }, "Delete frame", null, Math.min(index, frames.length - 1));
        return true;
    }

    /** Moves a frame to a new position (the others close up around it), keeping it selected. */
    MoveFrame(from: number, to: number): boolean {
        const count = this.state.frames.length;
        if (from < 0 || from >= count || to < 0 || to >= count || from === to) {
            return false;
        }
        const frames = this.state.frames.slice();
        frames.splice(to, 0, frames.splice(from, 1)[0]);
        this.Commit({ ...this.state, frames }, "Move frame", null, to);
        return true;
    }

    ReverseFrames(): boolean {
        if (this.state.frames.length < 2) {
            return false;
        }
        const frames = this.state.frames.slice().reverse();
        this.Commit({ ...this.state, frames }, "Reverse frames", null, frames.length - 1 - this.frame);
        return true;
    }

    /** What a new frame, or the new area of a bigger canvas, is filled with: the transparent entry, else entry 0. */
    private BlankIndex(): number {
        return Math.max(0, TransparentIndex(this.state.palette));
    }

    // ------------------------------------------------------------------------------------------ the whole picture

    /** Changes the canvas size of every frame; the picture sits at `anchor` (0 = left/top .. 1 = right/bottom). */
    Resize(width: number, height: number, anchor: Anchor = { x: 0.5, y: 0.5 }): boolean {
        CheckSize(width, height);
        if (width === this.state.width && height === this.state.height) {
            return false;
        }
        const fill = this.BlankIndex();
        const frames = this.state.frames.map(f => ResizeBitmap(f, width, height, anchor.x, anchor.y, fill));
        this.Commit({ ...this.state, width, height, frames }, "Resize canvas");
        return true;
    }

    /**
     * Cuts every frame down to `rect` (clipped to the picture), which becomes the new canvas. False if nothing of it is on the picture,
     * or it's the whole picture already.
     */
    Crop(rect: Rect): boolean {
        const r = ClipRect(this.state.frames[0], rect);
        if (r.width < 1 || r.height < 1 || (r.width === this.state.width && r.height === this.state.height)) {
            return false;
        }
        const frames = this.state.frames.map(f => ReadRegion(f, r));
        this.Commit({ ...this.state, width: r.width, height: r.height, frames }, "Crop to selection");
        return true;
    }

    /** Runs a transform (flip, rotate, shift...) over every frame; the results must agree on the new size. */
    TransformFrames(transform: (frame: Bitmap) => Bitmap, label: string): boolean {
        const frames = this.state.frames.map(f => transform(f));
        const { width, height } = frames[0];
        if (frames.some(f => f.width !== width || f.height !== height)) {
            throw new Error("A transform has to give every frame the same size.");
        }
        if (width === this.state.width && height === this.state.height && frames.every((f, i) => SameData(f.data, this.state.frames[i].data))) {
            return false;
        }
        CheckSize(width, height);
        this.Commit({ ...this.state, width, height, frames }, label);
        return true;
    }

    // ------------------------------------------------------------------------------------------ the palette

    /**
     * Changes one colour. Give a `key` (like "colour:7") while a slider is dragging so a drag undoes in one go.
     */
    SetColour(index: number, colour: Rgba, key: string | null = null): boolean {
        const old = this.state.palette[index];
        if (!old || SameColour(old, colour)) {
            return false;
        }
        const palette = this.state.palette.slice();
        palette[index] = { r: colour.r, g: colour.g, b: colour.b, a: colour.a };
        this.Commit({ ...this.state, palette }, "Edit colour", key);
        return true;
    }

    /**
     * Appends a colour and returns its index - or the existing entry's, if it's already there (unless `duplicate`, for a button
     * that has to make a new slot) - or -1 if the palette is full.
     */
    AddColour(colour: Rgba, duplicate = false): number {
        const existing = duplicate ? -1 : this.state.palette.findIndex(c => SameColour(c, colour));
        if (existing >= 0) {
            return existing;
        }
        if (this.state.palette.length >= MaxPaletteSize) {
            return -1;
        }
        const palette = this.state.palette.concat([{ r: colour.r, g: colour.g, b: colour.b, a: colour.a }]);
        this.Commit({ ...this.state, palette }, "Add colour");
        return palette.length - 1;
    }

    /** Swaps two palette entries, along with every pixel that uses them (so the picture doesn't change). */
    SwapColours(a: number, b: number): boolean {
        const size = this.state.palette.length;
        if (a === b || a < 0 || b < 0 || a >= size || b >= size) {
            return false;
        }
        const mapping = IdentityMapping();
        mapping[a] = b;
        mapping[b] = a;
        const palette = this.state.palette.slice();
        palette[a] = this.state.palette[b];
        palette[b] = this.state.palette[a];
        this.CommitRemap(palette, mapping, "Move colour");
        return true;
    }

    /**
     * Removes entries; pixels that used one take the nearest colour that's left, and the entries after close up. Always leaves
     * at least one entry.
     */
    RemoveColours(indices: ReadonlyArray<number>): boolean {
        const doomed = new Set(indices.filter(i => i >= 0 && i < this.state.palette.length));
        if (!doomed.size || doomed.size >= this.state.palette.length) {
            return false;
        }
        const survivors: number[] = [];
        this.state.palette.forEach((c, i) => {
            if (!doomed.has(i)) {
                survivors.push(i);
            }
        });
        const kept = survivors.map(i => this.state.palette[i]);
        const mapping = new Uint8Array(256);
        this.state.palette.forEach((c, i) => {
            mapping[i] = doomed.has(i) ? NearestIndex(kept, c) : survivors.indexOf(i);
        });
        this.CommitRemap(kept, mapping, "Remove colours");
        return true;
    }

    /** Sorts the palette (transparent first), moving the pixels with their colours. */
    SortColours(sort: PaletteSort): boolean {
        const { palette, mapping } = SortPalette(this.state.palette, sort, sort === "frequency" ? this.UsageCounts() : undefined);
        return this.CommitRemap(palette, mapping, "Sort palette");
    }

    /** Drops every entry no pixel uses (keeping a transparent one). */
    RemoveUnusedColours(): boolean {
        const counts = this.UsageCounts();
        const { palette, mapping } = CompactPalette(this.state.palette, counts.map(n => n > 0));
        return this.CommitRemap(palette, mapping, "Remove unused colours");
    }

    /**
     * Extracts a fresh palette from the colours the sprite shows: exactly those, if they fit in `max`, else merged down to
     * `max`. The picture is kept as close as the palette allows.
     */
    ExtractPaletteFromSprite(max: number, sort: PaletteSort): { reduced: boolean } {
        const rendered = this.state.frames.map(f => ToRgba(this.state.palette, f));
        const { palette, exact } = ExtractPalette(rendered, Math.max(1, Math.min(MaxPaletteSize, max)), sort);
        this.CommitFromRgba(rendered, palette, exact ? "Extract palette" : "Extract palette (reduced)");
        return { reduced: !exact };
    }

    /** Takes a palette from elsewhere and re-matches the sprite to it, keeping the look as near as it can. */
    RemapToPalette(colours: ReadonlyArray<Rgba>): boolean {
        const palette = ClonePalette(colours).slice(0, MaxPaletteSize);
        if (!palette.length) {
            return false;
        }
        const rendered = this.state.frames.map(f => ToRgba(this.state.palette, f));
        return this.CommitFromRgba(rendered, palette, "Match palette");
    }

    /** Takes a palette from elsewhere into the first entries, leaving the pixels' indices alone - so the sprite changes colour. */
    LoadColours(colours: ReadonlyArray<Rgba>): boolean {
        const loaded = ClonePalette(colours).slice(0, MaxPaletteSize);
        if (!loaded.length) {
            return false;
        }
        const palette = loaded.concat(ClonePalette(this.state.palette.slice(loaded.length)));
        if (SamePalette(palette, this.state.palette)) {
            return false;
        }
        this.Commit({ ...this.state, palette }, "Load palette");
        return true;
    }

    /** Runs the channel mixer over the palette (or just `indices` of it): the sprite recolours with it. */
    ApplyMixer(mixer: Mixer, indices?: ReadonlyArray<number>): boolean {
        const palette = MixPalette(this.state.palette, mixer, indices);
        if (SamePalette(palette, this.state.palette)) {
            return false;
        }
        this.Commit({ ...this.state, palette }, "Mix colours");
        return true;
    }

    private CommitRemap(palette: ReadonlyArray<Rgba>, mapping: ArrayLike<number>, label: string): boolean {
        const frames = this.state.frames.map(f => ({ width: f.width, height: f.height, data: RemapIndices(f.data, mapping) }));
        if (SamePalette(palette, this.state.palette) && frames.every((f, i) => SameData(f.data, this.state.frames[i].data))) {
            return false;
        }
        this.Commit({ ...this.state, palette, frames }, label);
        return true;
    }

    private CommitFromRgba(rendered: ReadonlyArray<Uint8Array>, palette: Rgba[], label: string): boolean {
        const frames = rendered.map(rgba => ({ width: this.state.width, height: this.state.height, data: IndexImage(rgba, palette) }));
        if (SamePalette(palette, this.state.palette) && frames.every((f, i) => SameData(f.data, this.state.frames[i].data))) {
            return false;
        }
        this.Commit({ ...this.state, palette, frames }, label);
        return true;
    }
}

function IdentityMapping(): Uint8Array {
    const mapping = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
        mapping[i] = i;
    }
    return mapping;
}

function SameData(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) {
        return false;
    }
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
}
