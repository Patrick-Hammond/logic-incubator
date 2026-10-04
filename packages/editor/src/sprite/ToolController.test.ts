import { describe, expect, it } from "vitest";
import { Bitmap, CreateBitmap, Point } from "./Bitmap";
import { Rgb, Rgba } from "./Colour";
import { SpriteDocument, SpriteState } from "./SpriteDocument";
import { Constrain, DefaultToolSettings, PlainPointer, PointerInfo, SpriteClipboard, ToolController, ToolId } from "./ToolController";

const CLEAR: Rgba = { r: 0, g: 0, b: 0, a: 0 };
const RED = Rgb(255, 0, 0);
const GREEN = Rgb(0, 255, 0);
const BLUE = Rgb(0, 0, 255);

function Rows(bitmap: Bitmap): string[] {
    const rows: string[] = [];
    for (let y = 0; y < bitmap.height; y++) {
        let row = "";
        for (let x = 0; x < bitmap.width; x++) {
            const v = bitmap.data[y * bitmap.width + x];
            row += v === 0 ? "." : String(v);
        }
        rows.push(row);
    }
    return rows;
}

function Picture(rows: string[]): Bitmap {
    const b = CreateBitmap(rows[0].length, rows.length);
    rows.forEach((row, y) => row.split("").forEach((c, x) => (b.data[y * b.width + x] = c === "." ? 0 : parseInt(c, 10))));
    return b;
}

type Rig = { doc: SpriteDocument; tool: ToolController; clipboard: SpriteClipboard };

/** A document of palette [clear, red, green, blue] and frames of the given pictures, with a controller on it. */
function Make(frames: string[][] = [Array(8).fill("........")], tool: ToolId = "pencil", palette: Rgba[] = [CLEAR, RED, GREEN, BLUE]): Rig {
    const bitmaps = frames.map(Picture);
    const state: SpriteState = { width: bitmaps[0].width, height: bitmaps[0].height, palette, frames: bitmaps };
    const doc = new SpriteDocument(state);
    const clipboard = new SpriteClipboard();
    const settings = DefaultToolSettings();
    settings.tool = tool;
    return { doc, tool: new ToolController(doc, settings, clipboard), clipboard };
}

const P = (x: number, y: number): Point => ({ x, y });
const With = (extra: Partial<PointerInfo>): PointerInfo => ({ ...PlainPointer, ...extra });

/** Presses at the first point, drags through the rest and lets go at the last. */
function Drag(rig: Rig, points: Point[], info: PointerInfo = PlainPointer): void {
    rig.tool.PointerDown(points[0], info);
    points.slice(1).forEach(p => rig.tool.PointerMove(p, info));
    rig.tool.PointerUp(points[points.length - 1]);
}

const Click = (rig: Rig, x: number, y: number, info: PointerInfo = PlainPointer) => Drag(rig, [P(x, y)], info);

describe("pencil", () => {
    it("paints the foreground along the drag, leaving no gaps when the pointer jumps", () => {
        const rig = Make([["........", "........"]]);
        Drag(rig, [P(0, 0), P(7, 0)]);
        expect(Rows(rig.doc.Frame)).toEqual(["11111111", "........"]);
    });

    it("is one undo step per stroke", () => {
        const rig = Make();
        Drag(rig, [P(0, 0), P(3, 3), P(7, 0)]);
        expect(rig.doc.UndoLabel).toBe("Draw");
        rig.doc.Undo();
        expect(rig.doc.Frame.data.every(v => v === 0)).toBe(true);
        expect(rig.doc.CanUndo).toBe(false);
    });

    it("shows the stroke while it's under way, and only changes the document at the end", () => {
        const rig = Make();
        rig.tool.PointerDown(P(0, 0));
        rig.tool.PointerMove(P(4, 0));
        expect(rig.tool.PreviewFrame.data[4]).toBe(1);
        expect(rig.doc.Frame.data[4]).toBe(0);
        expect(rig.tool.Busy).toBe(true);
        rig.tool.PointerUp(P(4, 0));
        expect(rig.doc.Frame.data[4]).toBe(1);
        expect(rig.tool.Busy).toBe(false);
    });

    it("paints the background with the secondary button", () => {
        const rig = Make();
        rig.tool.settings.background = 3;
        Click(rig, 2, 2, With({ button: 2 }));
        expect(rig.doc.Frame.data[2 * 8 + 2]).toBe(3);
    });

    it("uses the brush size and shape", () => {
        const rig = Make([Array(7).fill(".......")]);
        rig.tool.settings.brushSize = 3;
        Click(rig, 3, 3);
        expect(Rows(rig.doc.Frame)).toEqual([".......", ".......", "..111..", "..111..", "..111..", ".......", "......."]);
    });

    it("mirrors across the centre lines", () => {
        const rig = Make([Array(4).fill("....")]);
        rig.tool.settings.mirrorX = true;
        rig.tool.settings.mirrorY = true;
        Click(rig, 0, 0);
        expect(Rows(rig.doc.Frame)).toEqual(["1..1", "....", "....", "1..1"]);
    });

    it("draws a straight line from where the last stroke ended with shift", () => {
        const rig = Make([Array(3).fill("........")]);
        Click(rig, 0, 0);
        Click(rig, 7, 0, With({ shift: true }));
        expect(Rows(rig.doc.Frame)[0]).toBe("11111111");
    });

    it("ignores a second press while a stroke is going", () => {
        const rig = Make();
        rig.tool.PointerDown(P(0, 0));
        rig.tool.PointerDown(P(5, 5));
        rig.tool.PointerUp(P(0, 0));
        expect(rig.doc.Frame.data[5 * 8 + 5]).toBe(0);
        expect(rig.doc.State.frames).toHaveLength(1);
    });

    it("clips to the canvas when the pointer is dragged off it", () => {
        const rig = Make([Array(2).fill("....")]);
        Drag(rig, [P(1, 0), P(9, 0), P(9, 1), P(-5, 1)]);
        expect(Rows(rig.doc.Frame)).toEqual([".111", "1111"]);
    });

    it("Escape cancels a stroke without touching the document", () => {
        const rig = Make();
        rig.tool.PointerDown(P(0, 0));
        rig.tool.PointerMove(P(5, 0));
        expect(rig.tool.Cancel()).toBe(true);
        expect(rig.tool.Busy).toBe(false);
        expect(rig.doc.CanUndo).toBe(false);
        rig.tool.PointerUp(P(5, 0));
        expect(rig.doc.CanUndo).toBe(false);
    });
});

describe("eraser", () => {
    it("paints the transparent entry", () => {
        const rig = Make([["1111"]], "eraser");
        Drag(rig, [P(0, 0), P(1, 0)]);
        expect(Rows(rig.doc.Frame)).toEqual(["..11"]);
        expect(rig.doc.UndoLabel).toBe("Erase");
    });

    it("finds a transparent entry that isn't first", () => {
        const rig = Make([["1111"]], "eraser", [RED, GREEN, CLEAR]);
        Click(rig, 2, 0);
        expect(Array.from(rig.doc.Frame.data)).toEqual([1, 1, 2, 1]);
    });

    it("adds a transparent entry when the sprite has none, as its own undo step", () => {
        const rig = Make([["1111"]], "eraser", [RED, GREEN, BLUE]);
        Click(rig, 1, 0);
        expect(rig.doc.Palette).toHaveLength(4);
        expect(rig.doc.Palette[3].a).toBe(0);
        expect(Array.from(rig.doc.Frame.data)).toEqual([1, 3, 1, 1]);
        rig.doc.Undo();
        rig.doc.Undo();
        expect(rig.doc.Palette).toHaveLength(3);
    });

    it("uses the background colour if the palette is full and has no transparent entry", () => {
        const full: Rgba[] = [];
        for (let i = 0; i < 256; i++) full.push(Rgb(i, 0, 0));
        const rig = Make([["1111"]], "eraser", full);
        rig.tool.settings.background = 7;
        Click(rig, 0, 0);
        expect(rig.doc.Frame.data[0]).toBe(7);
    });
});

describe("shapes", () => {
    it("draws a line, showing it as the pointer moves and committing once", () => {
        const rig = Make([Array(4).fill("....")], "line");
        rig.tool.PointerDown(P(0, 0));
        rig.tool.PointerMove(P(3, 3));
        expect(Rows(rig.tool.PreviewFrame)).toEqual(["1...", ".1..", "..1.", "...1"]);
        rig.tool.PointerMove(P(3, 0));
        expect(Rows(rig.tool.PreviewFrame)).toEqual(["1111", "....", "....", "...."]);
        expect(rig.doc.CanUndo).toBe(false);
        rig.tool.PointerUp(P(3, 0));
        expect(Rows(rig.doc.Frame)).toEqual(["1111", "....", "....", "...."]);
        expect(rig.doc.UndoLabel).toBe("Line");
    });

    it("draws a rectangle outline or filled", () => {
        const rig = Make([Array(4).fill("....")], "rect");
        Drag(rig, [P(0, 0), P(3, 2)]);
        expect(Rows(rig.doc.Frame)).toEqual(["1111", "1..1", "1111", "...."]);
        rig.doc.Undo();
        rig.tool.settings.filled = true;
        Drag(rig, [P(3, 2), P(1, 0)]);
        expect(Rows(rig.doc.Frame)).toEqual([".111", ".111", ".111", "...."]);
        expect(rig.doc.UndoLabel).toBe("Rectangle");
    });

    it("draws an ellipse", () => {
        const rig = Make([Array(7).fill(".......")], "ellipse");
        rig.tool.settings.filled = true;
        Drag(rig, [P(0, 0), P(6, 6)]);
        expect(Rows(rig.doc.Frame)).toEqual(["..111..", ".11111.", "1111111", "1111111", "1111111", ".11111.", "..111.."]);
        expect(rig.doc.UndoLabel).toBe("Ellipse");
    });

    it("redraws from the original on every move, so earlier previews don't linger", () => {
        const rig = Make([Array(6).fill("......")], "rect");
        rig.tool.PointerDown(P(0, 0));
        rig.tool.PointerMove(P(5, 5));
        rig.tool.PointerMove(P(1, 1));
        rig.tool.PointerUp(P(1, 1));
        expect(Rows(rig.doc.Frame)).toEqual(["11....", "11....", "......", "......", "......", "......"]);
    });

    it("draws over what's there and keeps the rest", () => {
        const rig = Make([["2222", "2222", "2222"]], "line");
        Drag(rig, [P(0, 1), P(3, 1)]);
        expect(Rows(rig.doc.Frame)).toEqual(["2222", "1111", "2222"]);
    });

    it("snaps to a square and a circle with shift", () => {
        const rig = Make([Array(6).fill("......")], "rect");
        rig.tool.settings.filled = true;
        Drag(rig, [P(0, 0), P(3, 1)], With({ shift: true }));
        expect(Rows(rig.doc.Frame).slice(0, 5)).toEqual(["1111..", "1111..", "1111..", "1111..", "......"]);
    });

    it("snaps lines to horizontal, vertical or 45 degrees with shift", () => {
        expect(Constrain(P(2, 2), P(9, 3), "line")).toEqual(P(9, 2));
        expect(Constrain(P(2, 2), P(3, 9), "line")).toEqual(P(2, 9));
        expect(Constrain(P(2, 2), P(6, 4), "line")).toEqual(P(6, 6));
        expect(Constrain(P(5, 5), P(2, 3), "line")).toEqual(P(2, 2));
        expect(Constrain(P(5, 5), P(5, 5), "rect")).toEqual(P(5, 5));
        expect(Constrain(P(5, 5), P(1, 4), "ellipse")).toEqual(P(1, 1));
    });

    it("mirrors shapes", () => {
        const rig = Make([Array(3).fill("....")], "line");
        rig.tool.settings.mirrorX = true;
        Drag(rig, [P(0, 0), P(0, 2)]);
        expect(Rows(rig.doc.Frame)).toEqual(["1..1", "1..1", "1..1"]);
    });

    it("draws shape outlines with the brush, filled shapes without", () => {
        const rig = Make([Array(6).fill("......")], "rect");
        rig.tool.settings.brushSize = 2;
        Drag(rig, [P(2, 2), P(4, 4)]);
        const thick = rig.doc.Frame.data.filter(v => v === 1).length;
        expect(thick).toBeGreaterThan(8);
        rig.doc.Undo();
        rig.tool.settings.filled = true;
        Drag(rig, [P(2, 2), P(4, 4)]);
        expect(rig.doc.Frame.data.filter(v => v === 1).length).toBe(9);
    });
});

describe("fill", () => {
    it("fills the connected area with the foreground, as one undo step", () => {
        const rig = Make([["11.2", "11.2", "11.2"]], "fill");
        rig.tool.settings.foreground = 3;
        Click(rig, 2, 0);
        expect(Rows(rig.doc.Frame)).toEqual(["1132", "1132", "1132"]);
        expect(rig.doc.UndoLabel).toBe("Fill");
    });

    it("can replace the colour everywhere, and fills with the background on the secondary button", () => {
        const rig = Make([["1.1", ".1.", "1.1"]], "fill");
        rig.tool.settings.contiguous = false;
        rig.tool.settings.background = 2;
        Click(rig, 0, 0, With({ button: 2 }));
        expect(Rows(rig.doc.Frame)).toEqual(["2.2", ".2.", "2.2"]);
    });

    it("does nothing off the canvas or onto the same colour", () => {
        const rig = Make([["11"]], "fill");
        Click(rig, 5, 5);
        Click(rig, 0, 0);
        expect(rig.doc.CanUndo).toBe(false);
    });
});

describe("picker", () => {
    it("reports the index under the pointer and which button, and changes nothing", () => {
        const rig = Make([["123."]], "picker");
        const picked: Array<[number, number]> = [];
        rig.tool.SubscribePick((i, b) => picked.push([i, b]));
        Click(rig, 1, 0);
        Click(rig, 2, 0, With({ button: 2 }));
        Click(rig, 3, 0);
        Click(rig, 9, 0);
        expect(picked).toEqual([[2, 0], [3, 2], [0, 0]]);
        expect(rig.doc.CanUndo).toBe(false);
    });

    it("is what alt-click does with any drawing tool", () => {
        const rig = Make([["123."]], "pencil");
        const picked: number[] = [];
        rig.tool.SubscribePick(i => picked.push(i));
        Click(rig, 2, 0, With({ alt: true }));
        expect(picked).toEqual([3]);
        expect(rig.doc.CanUndo).toBe(false);
        expect(rig.tool.Busy).toBe(false);
    });
});

describe("selecting", () => {
    const picture = ["........", ".12.....", ".31.....", "........", "........"];

    it("drags out a marquee, in either direction, clamped to the canvas", () => {
        const rig = Make([picture], "select");
        Drag(rig, [P(1, 1), P(2, 2)]);
        expect(rig.tool.Marquee).toEqual({ x: 1, y: 1, width: 2, height: 2 });
        Drag(rig, [P(6, 4), P(20, 20)]);
        expect(rig.tool.Marquee).toEqual({ x: 6, y: 4, width: 2, height: 1 });
        Drag(rig, [P(3, 3), P(1, 0)]);
        expect(rig.tool.Marquee).toEqual({ x: 1, y: 0, width: 3, height: 4 });
        expect(rig.tool.HasSelection).toBe(true);
        expect(rig.doc.CanUndo).toBe(false);
    });

    it("clears the selection with a click that doesn't drag", () => {
        const rig = Make([picture], "select");
        Drag(rig, [P(1, 1), P(2, 2)]);
        Click(rig, 5, 4);
        expect(rig.tool.Marquee).toBeNull();
        expect(rig.tool.HasSelection).toBe(false);
    });

    it("moves the selected pixels: lifted off the frame while it's dragged, put down on release plus Flush", () => {
        const rig = Make([picture], "select");
        Drag(rig, [P(1, 1), P(2, 2)]);
        rig.tool.PointerDown(P(1, 1));
        rig.tool.PointerMove(P(4, 3));
        expect(Rows(rig.tool.PreviewFrame)).toEqual(["........", "........", "........", "....12..", "....31.."]);
        expect(rig.doc.CanUndo).toBe(false);
        rig.tool.PointerUp(P(4, 3));
        expect(rig.tool.Busy).toBe(true);
        expect(rig.tool.Flush()).toBe(true);
        expect(Rows(rig.doc.Frame)).toEqual(["........", "........", "........", "....12..", "....31.."]);
        expect(rig.doc.UndoLabel).toBe("Move selection");
        expect(rig.tool.Marquee).toEqual({ x: 4, y: 3, width: 2, height: 2 });
        rig.doc.Undo();
        expect(Rows(rig.doc.Frame)).toEqual(picture);
    });

    it("moves by the offset from where it was grabbed, not from its corner", () => {
        const rig = Make([picture], "select");
        Drag(rig, [P(1, 1), P(2, 2)]);
        Drag(rig, [P(2, 2), P(3, 2)]);
        rig.tool.Flush();
        expect(Rows(rig.doc.Frame)[1]).toBe("..12....");
    });

    it("copies instead of moving with ctrl", () => {
        const rig = Make([picture], "select");
        Drag(rig, [P(1, 1), P(2, 2)]);
        Drag(rig, [P(1, 1), P(5, 1)], With({ ctrl: true }));
        rig.tool.Flush();
        expect(Rows(rig.doc.Frame)).toEqual(["........", ".12..12.", ".31..31.", "........", "........"]);
        expect(rig.doc.UndoLabel).toBe("Copy selection");
    });

    it("lets what's under a moved selection show through its transparent pixels", () => {
        const rig = Make([["2222", "1.22", "2222"]], "select");
        Drag(rig, [P(0, 1), P(1, 1)]); // "1." - one solid pixel, one transparent
        Drag(rig, [P(0, 1), P(2, 0)]);
        rig.tool.Flush();
        // Lifting cleared (0,1) and (1,1); dropping at (2,0) writes only the solid pixel.
        expect(Rows(rig.doc.Frame)).toEqual(["2212", "..22", "2222"]);
    });

    it("a click inside the marquee that doesn't move leaves the frame as it was, with no undo step", () => {
        const rig = Make([picture], "select");
        Drag(rig, [P(1, 1), P(2, 2)]);
        Click(rig, 1, 1);
        rig.tool.Flush();
        expect(Rows(rig.doc.Frame)).toEqual(picture);
        expect(rig.doc.CanUndo).toBe(false);
    });

    it("drops floating pixels down when you start a new selection, or draw", () => {
        const rig = Make([picture], "select");
        Drag(rig, [P(1, 1), P(2, 2)]);
        Drag(rig, [P(1, 1), P(5, 1)]);
        Drag(rig, [P(7, 4), P(7, 4)]); // a new marquee elsewhere
        expect(Rows(rig.doc.Frame)[1]).toBe(".....12.");
        rig.tool.settings.tool = "pencil";
        Drag(rig, [P(0, 0), P(0, 0)]);
        expect(rig.doc.Frame.data[0]).toBe(1);
    });

    it("Escape and undo throw floating pixels away and restore the selection", () => {
        const rig = Make([picture], "select");
        Drag(rig, [P(1, 1), P(2, 2)]);
        Drag(rig, [P(1, 1), P(5, 1)]);
        expect(rig.tool.Busy).toBe(true);
        expect(rig.tool.UndoFirst()).toBe(true);
        expect(rig.tool.Busy).toBe(false);
        expect(rig.tool.Marquee).toEqual({ x: 1, y: 1, width: 2, height: 2 });
        expect(Rows(rig.doc.Frame)).toEqual(picture);
        expect(rig.tool.UndoFirst()).toBe(false);
    });

    it("Escape with only a marquee deselects it", () => {
        const rig = Make([picture], "select");
        Drag(rig, [P(1, 1), P(2, 2)]);
        expect(rig.tool.Cancel()).toBe(true);
        expect(rig.tool.Marquee).toBeNull();
        expect(rig.tool.Cancel()).toBe(false);
    });

    it("selects all", () => {
        const rig = Make([picture], "select");
        rig.tool.SelectAll();
        expect(rig.tool.Marquee).toEqual({ x: 0, y: 0, width: 8, height: 5 });
        rig.tool.Deselect();
        expect(rig.tool.Marquee).toBeNull();
    });

    it("can be moved partly off the canvas, losing what falls off", () => {
        const rig = Make([picture], "select");
        Drag(rig, [P(1, 1), P(2, 2)]);
        Drag(rig, [P(1, 1), P(7, 1)]);
        rig.tool.Flush();
        expect(Rows(rig.doc.Frame)[1]).toBe(".......1");
        expect(Rows(rig.doc.Frame)[2]).toBe(".......3");
        expect(rig.tool.Marquee).toEqual({ x: 7, y: 1, width: 1, height: 2 });
    });

    it("drops the selection altogether if everything moved off", () => {
        const rig = Make([picture], "select");
        Drag(rig, [P(1, 1), P(2, 2)]);
        Drag(rig, [P(1, 1), P(40, 1)]);
        rig.tool.Flush();
        expect(rig.tool.Marquee).toBeNull();
    });
});

describe("clipboard", () => {
    const picture = ["........", ".12.....", ".31.....", "........"];

    it("copies without changing the frame, then pastes floating at the top-left in the select tool", () => {
        const rig = Make([picture], "select");
        Drag(rig, [P(1, 1), P(2, 2)]);
        expect(rig.tool.Copy()).toBe(true);
        expect(rig.doc.CanUndo).toBe(false);
        rig.tool.settings.tool = "pencil";
        expect(rig.tool.Paste()).toBe(true);
        expect(rig.tool.settings.tool).toBe("select");
        // The 2x2 lands over the top-left corner of the picture.
        expect(Rows(rig.tool.PreviewFrame)).toEqual(["12......", "312.....", ".31.....", "........"]);
        expect(rig.doc.CanUndo).toBe(false);
    });

    it("pastes what was copied, ready to move, and puts it down with Flush", () => {
        const rig = Make([picture], "select");
        Drag(rig, [P(1, 1), P(2, 2)]);
        rig.tool.Copy();
        rig.tool.Paste();
        expect(rig.tool.Marquee).toEqual({ x: 0, y: 0, width: 2, height: 2 });
        Drag(rig, [P(0, 0), P(5, 2)]);
        rig.tool.Flush();
        expect(Rows(rig.doc.Frame)).toEqual(["........", ".12.....", ".31..12.", ".....31."]);
    });

    it("cuts: copies, clears the selection to transparent and keeps the marquee", () => {
        const rig = Make([picture], "select");
        Drag(rig, [P(1, 1), P(2, 2)]);
        expect(rig.tool.Cut()).toBe(true);
        expect(Rows(rig.doc.Frame)).toEqual(["........", "........", "........", "........"]);
        expect(rig.doc.UndoLabel).toBe("Cut");
        expect(rig.tool.Marquee).toEqual({ x: 1, y: 1, width: 2, height: 2 });
        rig.tool.Paste();
        rig.tool.Flush();
        expect(Rows(rig.doc.Frame)[0]).toBe("12......");
    });

    it("deletes the selection", () => {
        const rig = Make([picture], "select");
        Drag(rig, [P(1, 1), P(2, 2)]);
        expect(rig.tool.Delete()).toBe(true);
        expect(rig.doc.Frame.data.every(v => v === 0)).toBe(true);
        expect(rig.doc.UndoLabel).toBe("Delete selection");
    });

    it("deletes floating pixels without leaving the hole filled back in", () => {
        const rig = Make([picture], "select");
        Drag(rig, [P(1, 1), P(2, 2)]);
        Drag(rig, [P(1, 1), P(5, 1)]);
        expect(rig.tool.Delete()).toBe(true);
        expect(rig.doc.Frame.data.every(v => v === 0)).toBe(true);
        expect(rig.tool.Busy).toBe(false);
    });

    it("says no with nothing selected or nothing copied", () => {
        const rig = Make([picture], "select");
        expect(rig.tool.Copy()).toBe(false);
        expect(rig.tool.Cut()).toBe(false);
        expect(rig.tool.Delete()).toBe(false);
        expect(rig.tool.Paste()).toBe(false);
        expect(rig.tool.CanPaste).toBe(false);
        expect(rig.tool.FlipSelection(true)).toBe(false);
        expect(rig.tool.RotateSelection(true)).toBe(false);
    });

    it("pastes across palettes by matching colours, not indices", () => {
        const from = Make([["1"]], "select", [CLEAR, RED, GREEN]);
        const shared = from.clipboard;
        from.tool.SelectAll();
        from.tool.Copy();
        const doc = new SpriteDocument({ width: 2, height: 1, palette: [CLEAR, GREEN, BLUE, RED], frames: [CreateBitmap(2, 1)] });
        const settings = DefaultToolSettings();
        const other = new ToolController(doc, settings, shared);
        other.Paste();
        other.Flush();
        expect(doc.Frame.data[0]).toBe(3);
    });

    it("pastes transparent pixels as see-through", () => {
        const from = Make([["1."]], "select");
        from.tool.SelectAll();
        from.tool.Copy();
        const target = Make([["22", "22"]], "select");
        target.clipboard.image = from.clipboard.image;
        target.tool.Paste();
        target.tool.Flush();
        expect(Rows(target.doc.Frame)).toEqual(["12", "22"]);
        expect(target.doc.UndoLabel).toBe("Paste");
    });

    it("shares one clipboard between controllers by default", () => {
        const a = new ToolController(new SpriteDocument({ width: 1, height: 1, palette: [CLEAR, RED], frames: [Picture(["1"])] }));
        a.SelectAll();
        a.Copy();
        const b = new ToolController(new SpriteDocument({ width: 1, height: 1, palette: [CLEAR, RED], frames: [Picture(["."])] }));
        expect(b.CanPaste).toBe(true);
    });
});

describe("nudging a selection", () => {
    it("moves the selected pixels a pixel at a time and puts them down on Flush", () => {
        const rig = Make([["........", ".12.....", "........"]], "select");
        Drag(rig, [P(1, 1), P(2, 1)]);
        expect(rig.tool.NudgeSelection(1, 0)).toBe(true);
        expect(rig.tool.NudgeSelection(0, 1)).toBe(true);
        expect(rig.tool.Marquee).toEqual({ x: 2, y: 2, width: 2, height: 1 });
        rig.tool.Flush();
        expect(Rows(rig.doc.Frame)).toEqual(["........", "........", "..12...."]);
        expect(rig.doc.UndoLabel).toBe("Move selection");
    });

    it("says no with nothing selected", () => {
        const rig = Make([["12"]], "select");
        expect(rig.tool.NudgeSelection(1, 0)).toBe(false);
        expect(rig.doc.CanUndo).toBe(false);
    });

    it("can be undone as one pending move by Escape", () => {
        const rig = Make([["12.."]], "select");
        rig.tool.SelectAll();
        rig.tool.NudgeSelection(1, 0);
        rig.tool.NudgeSelection(1, 0);
        expect(rig.tool.UndoFirst()).toBe(true);
        expect(Rows(rig.doc.Frame)).toEqual(["12.."]);
        expect(rig.tool.Marquee).toEqual({ x: 0, y: 0, width: 4, height: 1 });
    });
});

describe("the area to crop to", () => {
    it("is the marquee", () => {
        const rig = Make([["........", ".12.....", ".31.....", "........"]], "select");
        Drag(rig, [P(1, 1), P(2, 2)]);
        expect(rig.tool.CropRect()).toEqual({ x: 1, y: 1, width: 2, height: 2 });
        expect(rig.doc.CanUndo).toBe(false);
    });

    it("is where floating pixels are put down, cut to the frame", () => {
        const rig = Make([["12......", "34......", "........"]], "select");
        Drag(rig, [P(0, 0), P(1, 1)]);
        Drag(rig, [P(0, 0), P(7, 1)]);
        expect(rig.tool.CropRect()).toEqual({ x: 7, y: 1, width: 1, height: 2 });
        expect(rig.tool.Busy).toBe(false);
    });

    it("is null with nothing selected, or a selection that has left the frame", () => {
        const rig = Make([["12.."]], "select");
        expect(rig.tool.CropRect()).toBeNull();
        rig.tool.SelectAll();
        rig.tool.NudgeSelection(40, 0);
        expect(rig.tool.CropRect()).toBeNull();
    });
});

describe("flip and rotate selection", () => {
    const picture = ["........", ".123....", ".....1..", "........"];

    it("flips the selected pixels in place", () => {
        const rig = Make([picture], "select");
        Drag(rig, [P(1, 1), P(3, 1)]);
        expect(rig.tool.FlipSelection(true)).toBe(true);
        rig.tool.Flush();
        expect(Rows(rig.doc.Frame)[1]).toBe(".321....");
        expect(rig.doc.UndoLabel).toBe("Flip selection");
    });

    it("flips vertically", () => {
        const rig = Make([["12", "34"]], "select");
        rig.tool.SelectAll();
        rig.tool.FlipSelection(false);
        rig.tool.Flush();
        expect(Rows(rig.doc.Frame)).toEqual(["34", "12"]);
    });

    it("rotates about the middle of the selection, so it stays put", () => {
        const rig = Make([["........", "..123...", "........", "........", "........"]], "select");
        Drag(rig, [P(2, 1), P(4, 1)]);
        expect(rig.tool.RotateSelection(true)).toBe(true);
        expect(rig.tool.Marquee).toEqual({ x: 3, y: 0, width: 1, height: 3 });
        rig.tool.Flush();
        expect(Rows(rig.doc.Frame)).toEqual(["...1....", "...2....", "...3....", "........", "........"]);
        rig.doc.Undo();
        rig.tool.Deselect();
        Drag(rig, [P(2, 1), P(4, 1)]);
        rig.tool.RotateSelection(false);
        rig.tool.Flush();
        expect(Rows(rig.doc.Frame)).toEqual(["...3....", "...2....", "...1....", "........", "........"]);
    });

    it("keeps flipping the same floating pixels without committing in between", () => {
        const rig = Make([["12"]], "select");
        rig.tool.SelectAll();
        rig.tool.FlipSelection(true);
        rig.tool.FlipSelection(true);
        rig.tool.Flush();
        expect(rig.doc.CanUndo).toBe(false);
        expect(Rows(rig.doc.Frame)).toEqual(["12"]);
    });
});

describe("when the document changes underneath", () => {
    it("drops pending work if its frame disappears", () => {
        const rig = Make([["....", "...."], ["....", "...."]], "pencil");
        rig.doc.SetFrameIndex(1);
        rig.tool.PointerDown(P(0, 0));
        expect(rig.tool.Busy).toBe(true);
        rig.doc.RemoveFrame(1);
        expect(rig.tool.Busy).toBe(false);
    });

    it("abandons a stroke if the frame is changed mid-stroke", () => {
        const rig = Make([["....", "...."], ["....", "...."]], "pencil");
        rig.tool.PointerDown(P(0, 0));
        rig.doc.SetFrameIndex(1);
        expect(rig.tool.Busy).toBe(false);
        rig.tool.PointerUp(P(0, 0));
        expect(rig.doc.Frames.every(f => f.data.every(v => v === 0))).toBe(true);
    });

    it("commits floating pixels to the frame they came from if the frame is changed", () => {
        const rig = Make([["12..", "...."], ["....", "...."]], "select");
        rig.tool.SelectAll();
        rig.tool.PointerDown(P(0, 0));
        rig.tool.PointerMove(P(1, 1));
        rig.tool.PointerUp(P(1, 1));
        rig.doc.SetFrameIndex(1);
        expect(rig.tool.Busy).toBe(false);
        expect(rig.doc.Frames[1].data.every(v => v === 0)).toBe(true);
    });
});

describe("choosing a tool", () => {
    it("changes the tool and tells listeners, once", () => {
        const rig = Make();
        let calls = 0;
        rig.tool.Subscribe(() => calls++);
        rig.tool.SetTool("line");
        rig.tool.SetTool("line");
        expect(rig.tool.settings.tool).toBe("line");
        expect(calls).toBe(1);
    });

    it("puts floating pixels down first", () => {
        const rig = Make([["12.."]], "select");
        rig.tool.SelectAll();
        rig.tool.NudgeSelection(1, 0);
        rig.tool.SetTool("pencil");
        expect(Rows(rig.doc.Frame)).toEqual([".12."]);
        expect(rig.tool.Busy).toBe(false);
    });

    it("tells listeners when settings are changed from outside", () => {
        const rig = Make();
        let calls = 0;
        rig.tool.Subscribe(() => calls++);
        rig.tool.settings.mirrorX = true;
        rig.tool.SettingsChanged();
        expect(calls).toBe(1);
    });
});

describe("hover and change events", () => {
    it("tracks the pointer and clears it on leave", () => {
        const rig = Make();
        rig.tool.PointerMove(P(3, 2));
        expect(rig.tool.Hover).toEqual(P(3, 2));
        rig.tool.PointerLeave();
        expect(rig.tool.Hover).toBeNull();
    });

    it("tells subscribers as things change, until they unsubscribe", () => {
        const rig = Make();
        let calls = 0;
        const off = rig.tool.Subscribe(() => calls++);
        rig.tool.PointerMove(P(1, 1));
        Click(rig, 2, 2);
        expect(calls).toBeGreaterThanOrEqual(3);
        const seen = calls;
        off();
        rig.tool.PointerMove(P(1, 1));
        expect(calls).toBe(seen);
    });
});
