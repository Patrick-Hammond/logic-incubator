import { describe, expect, it } from "vitest";
import { Bitmap, CreateBitmap, FlipHorizontal, RotateClockwise, SetPixel } from "./Bitmap";
import { IdentityMixer } from "./ChannelMixer";
import { Rgb, Rgba } from "./Colour";
import { DecodedPng } from "./Png";
import { BlankState, CoalesceMs, MaxFrames, MaxHistory, SpriteDocument, SpriteState, StateFromImages, ToRgba } from "./SpriteDocument";

const RED = Rgb(255, 0, 0);
const GREEN = Rgb(0, 255, 0);
const BLUE = Rgb(0, 0, 255);
const CLEAR: Rgba = { r: 0, g: 0, b: 0, a: 0 };

/** A small hand-made state: palette [clear, red, green, blue]. */
function SmallState(width = 3, height = 2, frames = 1): SpriteState {
    const frame = () => CreateBitmap(width, height, 0);
    return { width, height, palette: [CLEAR, RED, GREEN, BLUE], frames: Array.from({ length: frames }, frame) };
}

const Clock = () => {
    let now = 1000;
    const clock = () => now;
    return { clock, advance: (ms: number) => (now += ms) };
};

/** What the sprite actually looks like - the thing that must not change when only the palette's arrangement does. */
const Look = (doc: SpriteDocument) => doc.Frames.map(f => Array.from(ToRgba(doc.Palette, f)));

function Paint(doc: SpriteDocument, x: number, y: number, index: number, label = "Paint"): boolean {
    const draft = doc.CreateDraft();
    SetPixel(draft, x, y, index);
    return doc.ReplaceFrame(draft, label);
}

function Decoded(width: number, height: number, rgba: number[], indexed?: { palette: Rgba[]; indices: number[] }): DecodedPng {
    return { width, height, rgba: Uint8Array.from(rgba), indexed: indexed ? { palette: indexed.palette, indices: Uint8Array.from(indexed.indices) } : undefined } as DecodedPng;
}

describe("BlankState", () => {
    it("is one transparent frame with the 256-colour palette, transparent first", () => {
        const state = BlankState(16, 8);
        expect(state.width).toBe(16);
        expect(state.height).toBe(8);
        expect(state.palette).toHaveLength(256);
        expect(state.palette[0].a).toBe(0);
        expect(state.frames).toHaveLength(1);
        expect(state.frames[0].data.every(v => v === 0)).toBe(true);
    });

    it("refuses sizes the editor can't handle", () => {
        expect(() => BlankState(0, 8)).toThrow(/between 1x1 and 512x512/);
        expect(() => BlankState(8, 513)).toThrow();
        expect(() => BlankState(2.5, 4)).toThrow();
        expect(() => BlankState(NaN, 4)).toThrow();
    });
});

describe("ToRgba", () => {
    it("looks every index up in the palette, and shows a missing entry as transparent", () => {
        const frame: Bitmap = { width: 2, height: 1, data: Uint8Array.from([1, 9]) };
        expect(Array.from(ToRgba([CLEAR, RED], frame))).toEqual([255, 0, 0, 255, 0, 0, 0, 0]);
    });
});

describe("StateFromImages", () => {
    const palette = [CLEAR, RED, GREEN, BLUE];

    it("keeps the palette of indexed images that share one, exactly - unused entries too", () => {
        const a = Decoded(2, 1, [], { palette, indices: [1, 2] });
        const b = Decoded(2, 1, [], { palette, indices: [3, 0] });
        const { state, source, reduced } = StateFromImages([a, b]);
        expect(source).toBe("indexed");
        expect(reduced).toBe(false);
        expect(state.palette).toEqual(palette);
        expect(Array.from(state.frames[0].data)).toEqual([1, 2]);
        expect(Array.from(state.frames[1].data)).toEqual([3, 0]);
    });

    it("doesn't share memory with the decoded image", () => {
        const a = Decoded(1, 1, [], { palette, indices: [1] });
        const { state } = StateFromImages([a]);
        a.indexed.indices[0] = 3;
        expect(state.frames[0].data[0]).toBe(1);
    });

    it("extracts one palette from the colours when the images aren't indexed alike", () => {
        const a = Decoded(2, 1, [255, 0, 0, 255, 0, 0, 0, 0]);
        const b = Decoded(2, 1, [0, 255, 0, 255, 255, 0, 0, 255]);
        const { state, source, reduced } = StateFromImages([a, b]);
        expect(source).toBe("rgba");
        expect(reduced).toBe(false);
        expect(state.palette[0].a).toBe(0);
        const doc = new SpriteDocument(state);
        expect(Array.from(ToRgba(doc.Palette, doc.Frames[0]))).toEqual([255, 0, 0, 255, 0, 0, 0, 0]);
        expect(Array.from(ToRgba(doc.Palette, doc.Frames[1]))).toEqual([0, 255, 0, 255, 255, 0, 0, 255]);
    });

    it("treats indexed images with different palettes as plain colours", () => {
        const a = Decoded(1, 1, [255, 0, 0, 255], { palette: [RED], indices: [0] });
        const b = Decoded(1, 1, [0, 255, 0, 255], { palette: [GREEN], indices: [0] });
        expect(StateFromImages([a, b]).source).toBe("rgba");
    });

    it("says when there were too many colours and some had to be merged", () => {
        const rgba: number[] = [];
        for (let i = 0; i < 300; i++) {
            rgba.push(i % 256, Math.floor(i / 256) * 100, 7, 255); // 300 different colours
        }
        const { state, reduced } = StateFromImages([Decoded(300, 1, rgba)]);
        expect(reduced).toBe(true);
        expect(state.palette.length).toBeLessThanOrEqual(256);
    });

    it("refuses no frames, frames of different sizes, too many frames, and silly sizes", () => {
        expect(() => StateFromImages([])).toThrow(/at least one frame/);
        expect(() => StateFromImages([Decoded(1, 1, [0, 0, 0, 0]), Decoded(2, 1, [0, 0, 0, 0, 0, 0, 0, 0])])).toThrow(/Frame 1 is 2x1 but frame 0 is 1x1/);
        const many = Array.from({ length: MaxFrames + 1 }, () => Decoded(1, 1, [0, 0, 0, 0]));
        expect(() => StateFromImages(many)).toThrow(/up to 100/);
        expect(() => StateFromImages([Decoded(600, 1, new Array(2400).fill(0))])).toThrow(/between 1x1/);
    });
});

describe("editing a frame", () => {
    it("replaces the frame, shares the others, and undoes and redoes", () => {
        const doc = new SpriteDocument(SmallState(3, 2, 3));
        const before = doc.Frames;
        expect(Paint(doc, 1, 1, 2)).toBe(true);
        expect(doc.Frame.data[4]).toBe(2);
        expect(doc.Frames[1]).toBe(before[1]);
        expect(doc.Frames[2]).toBe(before[2]);
        expect(doc.Frames[0]).not.toBe(before[0]);
        expect(doc.CanUndo).toBe(true);
        expect(doc.UndoLabel).toBe("Paint");
        expect(doc.Undo()).toBe(true);
        expect(doc.Frames[0]).toBe(before[0]);
        expect(doc.RedoLabel).toBe("Paint");
        expect(doc.Redo()).toBe(true);
        expect(doc.Frame.data[4]).toBe(2);
        expect(doc.CanRedo).toBe(false);
    });

    it("ignores an edit that changes nothing, so it makes no undo step", () => {
        const doc = new SpriteDocument(SmallState());
        expect(Paint(doc, 0, 0, 0)).toBe(false);
        expect(doc.CanUndo).toBe(false);
        expect(doc.Dirty).toBe(false);
    });

    it("refuses a frame of the wrong size or at a missing index", () => {
        const doc = new SpriteDocument(SmallState());
        expect(() => doc.ReplaceFrame(CreateBitmap(1, 1), "x")).toThrow(/same size/);
        expect(() => doc.ReplaceFrame(CreateBitmap(3, 2), "x", 5)).toThrow();
    });

    it("clears the redo stack when you edit after undoing", () => {
        const doc = new SpriteDocument(SmallState());
        Paint(doc, 0, 0, 1);
        doc.Undo();
        Paint(doc, 1, 0, 2);
        expect(doc.CanRedo).toBe(false);
        expect(doc.Redo()).toBe(false);
    });

    it("keeps no more than MaxHistory steps", () => {
        const doc = new SpriteDocument(SmallState(40, 40));
        for (let i = 0; i < MaxHistory + 20; i++) {
            Paint(doc, i % 40, Math.floor(i / 40), (i % 3) + 1);
        }
        let undone = 0;
        while (doc.Undo()) undone++;
        expect(undone).toBe(MaxHistory);
    });

    it("doesn't let a draft write through to the committed frame", () => {
        const doc = new SpriteDocument(SmallState());
        const draft = doc.CreateDraft();
        SetPixel(draft, 0, 0, 3);
        expect(doc.Frame.data[0]).toBe(0);
    });
});

describe("dirty", () => {
    it("is clean until an edit, clean again after saving or undoing back to the saved picture", () => {
        const doc = new SpriteDocument(SmallState());
        expect(doc.Dirty).toBe(false);
        Paint(doc, 0, 0, 1);
        expect(doc.Dirty).toBe(true);
        doc.MarkSaved();
        expect(doc.Dirty).toBe(false);
        Paint(doc, 1, 0, 1);
        expect(doc.Dirty).toBe(true);
        doc.Undo();
        expect(doc.Dirty).toBe(false);
        doc.Undo();
        expect(doc.Dirty).toBe(true);
        doc.Redo();
        expect(doc.Dirty).toBe(false);
    });
});

describe("MarkUnsaved", () => {
    it("makes a clean sprite dirty without touching its pictures, and saving makes it clean again", () => {
        const doc = new SpriteDocument(SmallState());
        const before = doc.State;
        doc.MarkUnsaved();
        expect(doc.Dirty).toBe(true);
        expect(doc.State).toBe(before);
        expect(doc.CanUndo).toBe(false);
        doc.MarkSaved();
        expect(doc.Dirty).toBe(false);
    });
});

describe("Reset", () => {
    it("starts over from a new state: clean, no history, on the first frame", () => {
        const doc = new SpriteDocument(SmallState(3, 2, 3));
        doc.SetFrameIndex(2);
        Paint(doc, 0, 0, 1);
        doc.Undo();
        const fresh = SmallState(2, 2, 1);
        let calls = 0;
        doc.Subscribe(() => calls++);
        doc.Reset(fresh);
        expect(doc.State).toBe(fresh);
        expect(doc.Dirty).toBe(false);
        expect(doc.CanUndo).toBe(false);
        expect(doc.CanRedo).toBe(false);
        expect(doc.FrameIndex).toBe(0);
        expect(doc.Width).toBe(2);
        expect(calls).toBe(1);
    });
});

describe("subscribing", () => {
    it("tells listeners about every change, until they unsubscribe", () => {
        const doc = new SpriteDocument(SmallState(3, 2, 2));
        let calls = 0;
        const off = doc.Subscribe(() => calls++);
        Paint(doc, 0, 0, 1);
        doc.SetFrameIndex(1);
        doc.Undo();
        expect(calls).toBe(3);
        off();
        Paint(doc, 0, 0, 2);
        expect(calls).toBe(3);
    });

    it("lets a listener unsubscribe itself mid-notification", () => {
        const doc = new SpriteDocument(SmallState());
        let calls = 0;
        const off = doc.Subscribe(() => {
            calls++;
            off();
        });
        let others = 0;
        doc.Subscribe(() => others++);
        Paint(doc, 0, 0, 1);
        Paint(doc, 1, 0, 1);
        expect(calls).toBe(1);
        expect(others).toBe(2);
    });
});

describe("frames", () => {
    it("adds a blank frame after the current one and selects it", () => {
        const doc = new SpriteDocument(SmallState(3, 2, 2));
        Paint(doc, 0, 0, 1);
        expect(doc.AddFrame(false)).toBe(true);
        expect(doc.FrameCount).toBe(3);
        expect(doc.FrameIndex).toBe(1);
        expect(doc.Frame.data.every(v => v === 0)).toBe(true);
        expect(doc.Frames[0].data[0]).toBe(1);
    });

    it("fills a new frame with the transparent entry, wherever it is", () => {
        const state: SpriteState = { width: 2, height: 1, palette: [RED, GREEN, CLEAR], frames: [CreateBitmap(2, 1, 0)] };
        const doc = new SpriteDocument(state);
        doc.AddFrame(false);
        expect(Array.from(doc.Frame.data)).toEqual([2, 2]);
    });

    it("duplicates the current frame without sharing its pixels", () => {
        const doc = new SpriteDocument(SmallState());
        Paint(doc, 2, 1, 3);
        doc.AddFrame(true);
        expect(doc.Frame.data[5]).toBe(3);
        expect(doc.Frame).not.toBe(doc.Frames[0]);
        expect(doc.UndoLabel).toBe("Duplicate frame");
    });

    it("won't go past the frame limit", () => {
        const doc = new SpriteDocument(SmallState(1, 1, MaxFrames));
        expect(doc.AddFrame(false)).toBe(false);
        expect(doc.FrameCount).toBe(MaxFrames);
    });

    it("deletes a frame but never the last, and keeps the selection in range", () => {
        const doc = new SpriteDocument(SmallState(3, 2, 3));
        doc.SetFrameIndex(2);
        expect(doc.RemoveFrame()).toBe(true);
        expect(doc.FrameCount).toBe(2);
        expect(doc.FrameIndex).toBe(1);
        expect(doc.RemoveFrame(0)).toBe(true);
        expect(doc.RemoveFrame()).toBe(false);
        expect(doc.FrameCount).toBe(1);
        expect(doc.RemoveFrame(7)).toBe(false);
    });

    it("moves a frame and keeps it selected", () => {
        const doc = new SpriteDocument(SmallState(3, 2, 3));
        doc.SetFrameIndex(0);
        Paint(doc, 0, 0, 1);
        doc.SetFrameIndex(1);
        Paint(doc, 0, 0, 2);
        doc.SetFrameIndex(2);
        Paint(doc, 0, 0, 3);
        expect(doc.MoveFrame(0, 2)).toBe(true);
        expect(doc.Frames.map(f => f.data[0])).toEqual([2, 3, 1]);
        expect(doc.FrameIndex).toBe(2);
        expect(doc.MoveFrame(2, 2)).toBe(false);
        expect(doc.MoveFrame(0, 9)).toBe(false);
    });

    it("reverses the order, the selected frame going with its picture", () => {
        const doc = new SpriteDocument(SmallState(3, 2, 3));
        [1, 2, 3].forEach((v, i) => {
            doc.SetFrameIndex(i);
            Paint(doc, 0, 0, v);
        });
        doc.SetFrameIndex(0);
        doc.ReverseFrames();
        expect(doc.Frames.map(f => f.data[0])).toEqual([3, 2, 1]);
        expect(doc.FrameIndex).toBe(2);
        expect(new SpriteDocument(SmallState()).ReverseFrames()).toBe(false);
    });

    it("undoing a frame operation brings back the frame you were on", () => {
        const doc = new SpriteDocument(SmallState(3, 2, 3));
        doc.SetFrameIndex(1);
        doc.RemoveFrame();
        doc.SetFrameIndex(0);
        doc.Undo();
        expect(doc.FrameCount).toBe(3);
        expect(doc.FrameIndex).toBe(1);
        doc.Redo();
        expect(doc.FrameCount).toBe(2);
    });

    it("undoing a paint goes back to the frame it was painted on", () => {
        const doc = new SpriteDocument(SmallState(3, 2, 3));
        doc.SetFrameIndex(2);
        Paint(doc, 0, 0, 1);
        doc.SetFrameIndex(0);
        doc.Undo();
        expect(doc.FrameIndex).toBe(2);
        doc.SetFrameIndex(0);
        doc.Redo();
        expect(doc.FrameIndex).toBe(2);
    });

    it("clamps the selected frame", () => {
        const doc = new SpriteDocument(SmallState(3, 2, 3));
        doc.SetFrameIndex(10);
        expect(doc.FrameIndex).toBe(2);
        doc.SetFrameIndex(-4);
        expect(doc.FrameIndex).toBe(0);
    });
});

describe("the whole picture", () => {
    it("resizes every frame around an anchor, filling new space with transparency", () => {
        const doc = new SpriteDocument(SmallState(2, 2, 2));
        Paint(doc, 0, 0, 1);
        expect(doc.Resize(4, 4, { x: 0, y: 0 })).toBe(true);
        expect(doc.Width).toBe(4);
        expect(doc.Frames.every(f => f.width === 4 && f.height === 4)).toBe(true);
        expect(doc.Frames[0].data[0]).toBe(1);
        expect(doc.Resize(4, 4)).toBe(false);
        doc.Undo();
        expect(doc.Width).toBe(2);
    });

    it("refuses an impossible canvas", () => {
        const doc = new SpriteDocument(SmallState());
        expect(() => doc.Resize(0, 3)).toThrow();
        expect(() => doc.Resize(4000, 3)).toThrow();
    });

    it("crops every frame to a rectangle, which becomes the canvas", () => {
        const doc = new SpriteDocument({ width: 4, height: 3, palette: [CLEAR, RED, GREEN, BLUE], frames: [
            { width: 4, height: 3, data: Uint8Array.from([0, 1, 2, 3, 1, 2, 3, 0, 2, 3, 0, 1]) },
            { width: 4, height: 3, data: Uint8Array.from([3, 3, 3, 3, 2, 2, 2, 2, 1, 1, 1, 1]) }
        ] });
        expect(doc.Crop({ x: 1, y: 1, width: 2, height: 2 })).toBe(true);
        expect(doc.Width).toBe(2);
        expect(doc.Height).toBe(2);
        expect(doc.Frames.map(f => Array.from(f.data))).toEqual([[2, 3, 3, 0], [2, 2, 1, 1]]);
        expect(doc.Frames.every(f => f.width === 2 && f.height === 2)).toBe(true);
        expect(doc.UndoLabel).toBe("Crop to selection");
        doc.Undo();
        expect(doc.Width).toBe(4);
        expect(Array.from(doc.Frames[0].data)).toEqual([0, 1, 2, 3, 1, 2, 3, 0, 2, 3, 0, 1]);
    });

    it("crops to the part of the rectangle that's on the picture", () => {
        const doc = new SpriteDocument(SmallState(4, 4));
        expect(doc.Crop({ x: 2, y: -3, width: 10, height: 5 })).toBe(true);
        expect(doc.Width).toBe(2);
        expect(doc.Height).toBe(2);
    });

    it("says no for a rectangle that's off the picture, empty, or all of it", () => {
        const doc = new SpriteDocument(SmallState(4, 4));
        expect(doc.Crop({ x: 9, y: 9, width: 2, height: 2 })).toBe(false);
        expect(doc.Crop({ x: 1, y: 1, width: 0, height: 3 })).toBe(false);
        expect(doc.Crop({ x: 0, y: 0, width: 4, height: 4 })).toBe(false);
        expect(doc.Crop({ x: -2, y: -2, width: 20, height: 20 })).toBe(false);
        expect(doc.CanUndo).toBe(false);
    });

    it("can crop to a single pixel", () => {
        const doc = new SpriteDocument(SmallState(3, 3));
        expect(doc.Crop({ x: 2, y: 1, width: 1, height: 1 })).toBe(true);
        expect(doc.Width + "x" + doc.Height).toBe("1x1");
    });

    it("runs a transform over every frame, even one that swaps the size", () => {
        const doc = new SpriteDocument(SmallState(3, 2, 2));
        Paint(doc, 0, 0, 1);
        expect(doc.TransformFrames(RotateClockwise, "Rotate")).toBe(true);
        expect(doc.Width).toBe(2);
        expect(doc.Height).toBe(3);
        expect(doc.Frames[0].data[1]).toBe(1); // top-left goes to top-right
        expect(doc.Frames[1].width).toBe(2);
        doc.Undo();
        expect(doc.Width).toBe(3);
    });

    it("says no when a transform changes nothing", () => {
        const doc = new SpriteDocument(SmallState(3, 2));
        expect(doc.TransformFrames(FlipHorizontal, "Flip")).toBe(false);
        expect(doc.CanUndo).toBe(false);
    });
});

describe("colours", () => {
    it("edits a colour and says no when it's the same", () => {
        const doc = new SpriteDocument(SmallState());
        expect(doc.SetColour(1, Rgb(10, 20, 30, 40))).toBe(true);
        expect(doc.Palette[1]).toEqual(Rgb(10, 20, 30, 40));
        expect(doc.SetColour(1, Rgb(10, 20, 30, 40))).toBe(false);
        expect(doc.SetColour(99, RED)).toBe(false);
        doc.Undo();
        expect(doc.Palette[1]).toEqual(RED);
    });

    it("copies the colour it's given rather than keeping the caller's object", () => {
        const doc = new SpriteDocument(SmallState());
        const c = Rgb(1, 2, 3);
        doc.SetColour(1, c);
        c.r = 99;
        expect(doc.Palette[1].r).toBe(1);
    });

    it("undoes a slider drag as one step, but not edits that are apart in time or on another colour", () => {
        const { clock, advance } = Clock();
        const doc = new SpriteDocument(SmallState(), clock);
        doc.SetColour(1, Rgb(1, 0, 0), "colour:1");
        advance(100);
        doc.SetColour(1, Rgb(2, 0, 0), "colour:1");
        advance(100);
        doc.SetColour(1, Rgb(3, 0, 0), "colour:1");
        doc.Undo();
        expect(doc.Palette[1]).toEqual(RED);
        expect(doc.CanUndo).toBe(false);

        doc.SetColour(1, Rgb(1, 0, 0), "colour:1");
        advance(CoalesceMs + 1);
        doc.SetColour(1, Rgb(2, 0, 0), "colour:1");
        doc.Undo();
        expect(doc.Palette[1]).toEqual(Rgb(1, 0, 0));

        doc.SetColour(2, Rgb(0, 1, 0), "colour:2");
        doc.SetColour(3, Rgb(0, 0, 1), "colour:3");
        doc.Undo();
        expect(doc.Palette[3]).toEqual(BLUE);
        expect(doc.Palette[2]).toEqual(Rgb(0, 1, 0));
    });

    it("keeps drag-coalescing from reaching back across a save, or across an undo", () => {
        const { clock } = Clock();
        const doc = new SpriteDocument(SmallState(), clock);
        doc.SetColour(1, Rgb(1, 0, 0), "k");
        doc.MarkSaved();
        doc.SetColour(1, Rgb(2, 0, 0), "k");
        doc.Undo();
        expect(doc.Palette[1]).toEqual(Rgb(1, 0, 0));
        expect(doc.Dirty).toBe(false);

        doc.Undo();
        doc.SetColour(1, Rgb(5, 0, 0), "k");
        doc.Undo();
        doc.Redo();
        doc.SetColour(1, Rgb(6, 0, 0), "k");
        doc.Undo();
        expect(doc.Palette[1]).toEqual(Rgb(5, 0, 0));
    });

    it("adds a colour, reusing an entry that's already that colour, until it's full", () => {
        const doc = new SpriteDocument(SmallState());
        expect(doc.AddColour(RED)).toBe(1);
        expect(doc.CanUndo).toBe(false);
        expect(doc.AddColour(Rgb(9, 9, 9))).toBe(4);
        expect(doc.Palette).toHaveLength(5);
        const full = new SpriteDocument(BlankState(2, 2));
        expect(full.AddColour(Rgb(1, 2, 3, 77))).toBe(-1);
    });

    it("adds a duplicate colour when asked to, as a new slot", () => {
        const doc = new SpriteDocument(SmallState());
        expect(doc.AddColour(RED, true)).toBe(4);
        expect(doc.Palette).toHaveLength(5);
        expect(doc.Palette[4]).toEqual(RED);
        expect(doc.AddColour(RED)).toBe(1);
    });

    it("swaps two entries without changing the picture", () => {
        const doc = new SpriteDocument(SmallState(3, 1));
        const draft = doc.CreateDraft();
        draft.data.set([1, 2, 3]);
        doc.ReplaceFrame(draft, "Paint");
        const look = Look(doc);
        expect(doc.SwapColours(1, 3)).toBe(true);
        expect(doc.Palette[1]).toEqual(BLUE);
        expect(Array.from(doc.Frame.data)).toEqual([3, 2, 1]);
        expect(Look(doc)).toEqual(look);
        expect(doc.SwapColours(2, 2)).toBe(false);
        expect(doc.SwapColours(0, 9)).toBe(false);
    });

    it("removes colours: their pixels take the nearest survivor and the rest close up", () => {
        const state: SpriteState = {
            width: 4,
            height: 1,
            palette: [CLEAR, Rgb(250, 0, 0), Rgb(0, 255, 0), Rgb(255, 10, 10)],
            frames: [{ width: 4, height: 1, data: Uint8Array.from([0, 1, 2, 3]) }]
        };
        const doc = new SpriteDocument(state);
        expect(doc.RemoveColours([1])).toBe(true);
        expect(doc.Palette).toHaveLength(3);
        // (250,0,0) was removed: its pixel becomes the near-identical (255,10,10), now entry 2; green moved down to 1.
        expect(Array.from(doc.Frame.data)).toEqual([0, 2, 1, 2]);
        expect(doc.Palette[2]).toEqual(Rgb(255, 10, 10));
    });

    it("never removes every colour, and ignores indices that aren't there", () => {
        const doc = new SpriteDocument(SmallState());
        expect(doc.RemoveColours([0, 1, 2, 3])).toBe(false);
        expect(doc.RemoveColours([40, 50])).toBe(false);
        expect(doc.RemoveColours([])).toBe(false);
    });

    it("sorts the palette without changing the picture, and says no when it's already in order", () => {
        const state = BlankState(8, 2);
        const doc = new SpriteDocument({ ...state, frames: [{ width: 8, height: 2, data: Uint8Array.from([5, 200, 17, 99, 255, 3, 0, 61, 5, 5, 5, 200, 200, 17, 0, 0]) }] });
        const look = Look(doc);
        expect(doc.SortColours("hue")).toBe(true);
        expect(Look(doc)).toEqual(look);
        expect(doc.SortColours("hue")).toBe(false);
        expect(doc.SortColours("frequency")).toBe(true);
        expect(Look(doc)).toEqual(look);
        // Most-used first after the transparent entry.
        const counts = doc.UsageCounts();
        const used = counts.slice(1).filter(n => n > 0);
        expect(used).toEqual(used.slice().sort((a, b) => b - a));
    });

    it("removes unused colours without changing the picture, keeping a transparent entry", () => {
        const doc = new SpriteDocument({ ...BlankState(3, 1), frames: [{ width: 3, height: 1, data: Uint8Array.from([16, 40, 16]) }] });
        const look = Look(doc);
        expect(doc.RemoveUnusedColours()).toBe(true);
        expect(doc.Palette).toHaveLength(3);
        expect(doc.Palette[0].a).toBe(0);
        expect(Look(doc)).toEqual(look);
        expect(doc.RemoveUnusedColours()).toBe(false);
    });

    it("counts a colour used in any frame as used", () => {
        const state = SmallState(2, 1, 2);
        const doc = new SpriteDocument({ ...state, frames: [state.frames[0], { width: 2, height: 1, data: Uint8Array.from([3, 3]) }] });
        doc.RemoveUnusedColours();
        expect(doc.Palette).toEqual([CLEAR, BLUE]);
        expect(Array.from(doc.Frames[1].data)).toEqual([1, 1]);
    });

    it("extracts the sprite's colours as a new compact palette, the picture unchanged", () => {
        const doc = new SpriteDocument({ ...BlankState(4, 1), frames: [{ width: 4, height: 1, data: Uint8Array.from([0, 16, 100, 16]) }] });
        const look = Look(doc);
        const { reduced } = doc.ExtractPaletteFromSprite(256, "luminance");
        expect(reduced).toBe(false);
        expect(doc.Palette).toHaveLength(3);
        expect(Look(doc)).toEqual(look);
        expect(doc.UndoLabel).toBe("Extract palette");
    });

    it("extracts a smaller palette by merging colours, and says so", () => {
        const data = new Uint8Array(64);
        for (let i = 0; i < 64; i++) data[i] = 16 + i;
        const doc = new SpriteDocument({ ...BlankState(8, 8), frames: [{ width: 8, height: 8, data }] });
        const { reduced } = doc.ExtractPaletteFromSprite(8, "luminance");
        expect(reduced).toBe(true);
        expect(doc.Palette.length).toBeLessThanOrEqual(8);
        expect(doc.UndoLabel).toBe("Extract palette (reduced)");
        expect(doc.Frame.data.every(v => v < doc.Palette.length)).toBe(true);
    });

    it("makes no undo step when the palette is already what extraction gives", () => {
        const state: SpriteState = { width: 2, height: 1, palette: [CLEAR, RED], frames: [{ width: 2, height: 1, data: Uint8Array.from([0, 1]) }] };
        const doc = new SpriteDocument(state);
        expect(doc.ExtractPaletteFromSprite(256, "luminance")).toEqual({ reduced: false });
        expect(doc.CanUndo).toBe(false);
        expect(doc.State).toBe(state);
    });

    it("re-matches the sprite to another palette, nearest colour for each", () => {
        const doc = new SpriteDocument(SmallState(3, 1));
        const draft = doc.CreateDraft();
        draft.data.set([1, 2, 3]);
        doc.ReplaceFrame(draft, "Paint");
        expect(doc.RemapToPalette([CLEAR, Rgb(200, 30, 30), Rgb(30, 30, 200)])).toBe(true);
        expect(doc.Palette).toHaveLength(3);
        expect(Array.from(ToRgba(doc.Palette, doc.Frame)).filter((v, i) => i % 4 === 3)).toEqual([255, 255, 255]);
        expect(Array.from(doc.Frame.data)[0]).toBe(1);
        expect(Array.from(doc.Frame.data)[2]).toBe(2);
        expect(doc.RemapToPalette([])).toBe(false);
    });

    it("loads a palette over the first entries and leaves the pixels' indices: the sprite recolours", () => {
        const doc = new SpriteDocument(SmallState(3, 1));
        const draft = doc.CreateDraft();
        draft.data.set([1, 2, 3]);
        doc.ReplaceFrame(draft, "Paint");
        expect(doc.LoadColours([CLEAR, Rgb(1, 1, 1)])).toBe(true);
        expect(Array.from(doc.Frame.data)).toEqual([1, 2, 3]);
        expect(doc.Palette[1]).toEqual(Rgb(1, 1, 1));
        expect(doc.Palette[2]).toEqual(GREEN);
        expect(doc.Palette).toHaveLength(4);
        expect(doc.LoadColours([CLEAR, Rgb(1, 1, 1)])).toBe(false);
        expect(doc.LoadColours([])).toBe(false);
    });

    it("applies the channel mixer to the palette, or to chosen entries", () => {
        const doc = new SpriteDocument(SmallState());
        const swap = IdentityMixer();
        swap.red = { r: 0, g: 0, b: 1, constant: 0 };
        swap.blue = { r: 1, g: 0, b: 0, constant: 0 };
        expect(doc.ApplyMixer(swap, [1])).toBe(true);
        expect(doc.Palette[1]).toEqual(BLUE);
        expect(doc.Palette[3]).toEqual(BLUE);
        expect(doc.ApplyMixer(IdentityMixer())).toBe(false);
        expect(doc.UndoLabel).toBe("Mix colours");
        doc.Undo();
        expect(doc.Palette[1]).toEqual(RED);
    });
});
