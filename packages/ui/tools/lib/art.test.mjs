import { describe, expect, it } from "vitest";
import { ParseSlices } from "./aseprite.mjs";
import { FrameNameProblem } from "./frames.mjs";
import { CompareNames, LayoutPieces, SplitState } from "./layout.mjs";

const sheet = { width: 200, height: 100 };
const slice = (name, bounds, center) => ({ name, color: "#0000ffff", keys: [{ frame: 0, bounds, ...(center ? { center } : {}) }] });
const doc = (...slices) => ({ meta: { slices } });

describe("ParseSlices", () => {
    it("reads a slice's rectangle, and a nine-patch's centre as insets (the centre is relative to the slice)", () => {
        const [plain, nine] = ParseSlices(doc(slice("icon_gear", { x: 8, y: 8, w: 16, h: 16 }), slice("btn_primary_normal", { x: 40, y: 8, w: 14, h: 14 }, { x: 6, y: 5, w: 2, h: 3 })), sheet);
        expect(plain).toEqual({ name: "icon_gear", x: 8, y: 8, w: 16, h: 16, insets: null });
        expect(nine).toEqual({ name: "btn_primary_normal", x: 40, y: 8, w: 14, h: 14, insets: { left: 6, top: 5, right: 6, bottom: 6 } });
    });

    it("uses the first frame's key", () => {
        const s = { name: "a", keys: [{ frame: 2, bounds: { x: 0, y: 0, w: 3, h: 3 } }, { frame: 0, bounds: { x: 5, y: 5, w: 4, h: 4 } }] };
        expect(ParseSlices(doc(s), sheet)[0]).toMatchObject({ x: 5, y: 5, w: 4, h: 4 });
    });

    it("says what to do when the export has no slices", () => {
        expect(() => ParseSlices({ meta: {} }, sheet)).toThrow(/--list-slices/);
        expect(() => ParseSlices(null, sheet)).toThrow(/no meta.slices/);
    });

    it("names the slice that is wrong", () => {
        expect(() => ParseSlices(doc(slice("Bad Name", { x: 0, y: 0, w: 4, h: 4 })), sheet)).toThrow(/Slice "Bad Name" isn't a frame name/);
        expect(() => ParseSlices(doc(slice("walk_f3", { x: 0, y: 0, w: 4, h: 4 })), sheet)).toThrow(/_f and a number/);
        expect(() => ParseSlices(doc(slice("a", { x: 0, y: 0, w: 4, h: 4 }), slice("a", { x: 8, y: 0, w: 4, h: 4 })), sheet)).toThrow(/two slices called "a"/);
        expect(() => ParseSlices(doc(slice("far", { x: 190, y: 0, w: 20, h: 4 })), sheet)).toThrow(/Slice "far".*isn't inside the 200x100 sheet/);
        expect(() => ParseSlices(doc(slice("empty", { x: 0, y: 0, w: 0, h: 4 })), sheet)).toThrow(/isn't inside/);
        expect(() => ParseSlices(doc(slice("nine", { x: 0, y: 0, w: 10, h: 10 }, { x: 8, y: 2, w: 4, h: 4 })), sheet)).toThrow(/nine-patch centre/);
        expect(() => ParseSlices(doc({ name: "nokeys", keys: [] }), sheet)).toThrow(/no bounds/);
    });
});

describe("FrameNameProblem", () => {
    it("accepts the names the asset build accepts", () => {
        ["btn_primary_normal", "icon_arrow_up", "a1", "slider_thumb_hover"].forEach(n => expect(FrameNameProblem(n), n).toBeNull());
    });
    it("refuses the rest", () => {
        ["", "1abc", "Btn", "btn-primary", "btn primary", "walk_f0"].forEach(n => expect(FrameNameProblem(n), n).not.toBeNull());
    });
});

describe("SplitState and CompareNames", () => {
    it("splits a trailing state off a name", () => {
        expect(SplitState("btn_primary_hover")).toEqual({ family: "btn_primary", state: "hover" });
        expect(SplitState("icon_gear")).toEqual({ family: "icon_gear", state: "" });
        expect(SplitState("bar_fill_red")).toEqual({ family: "bar_fill_red", state: "" });
    });

    it("lists a family's states in the order they are used, families alphabetically", () => {
        const names = ["btn_small_disabled", "btn_primary_pressed", "btn_primary_normal", "btn_small_normal", "btn_primary_hover", "btn_primary_disabled"];
        expect(names.sort(CompareNames)).toEqual(["btn_primary_normal", "btn_primary_hover", "btn_primary_pressed", "btn_primary_disabled", "btn_small_normal", "btn_small_disabled"]);
    });
});

describe("LayoutPieces", () => {
    const group = (title, ...sizes) => ({ title, pieces: sizes.map(([width, height], i) => ({ name: `${title}_${i}`, width, height })) });

    it("puts every piece on the 8-pixel grid, inside the sheet, without overlap", () => {
        const { placed, height } = LayoutPieces([group("a", [30, 12], [100, 20], [150, 9], [60, 60]), group("b", [14, 14], [14, 14], [200, 30])], 256);
        placed.forEach(p => {
            expect(p.x % 8, p.name).toBe(0);
            expect(p.y % 8, p.name).toBe(0);
            expect(p.x + p.width).toBeLessThanOrEqual(256);
            expect(p.y + p.height).toBeLessThanOrEqual(height);
        });
        for (let i = 0; i < placed.length; i++) {
            for (let j = i + 1; j < placed.length; j++) {
                const a = placed[i], b = placed[j];
                const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
                expect(overlap, `${a.name} / ${b.name}`).toBe(false);
            }
        }
    });

    it("starts each group on a new row below a heading band, and wraps at the sheet's width", () => {
        const { placed, headings } = LayoutPieces([group("a", [100, 10], [100, 10], [100, 10]), group("b", [20, 20])], 256);
        expect(headings.map(h => h.title)).toEqual(["a", "b"]);
        const a = placed.filter(p => p.group === "a");
        expect(a[0].y).toBe(headings[0].y + 16);
        expect(a[1].y).toBe(a[0].y); // two fit on the first row
        expect(a[2].y).toBeGreaterThan(a[0].y); // the third wraps
        expect(a[2].x).toBe(8);
        expect(placed.find(p => p.group === "b").y).toBeGreaterThan(a[2].y + 10);
    });

    it("gives a piece wider than the sheet a row of its own rather than looping", () => {
        const { placed } = LayoutPieces([group("a", [300, 10], [10, 10])], 256);
        expect(placed[0].x).toBe(8);
        expect(placed[1].y).toBeGreaterThan(placed[0].y);
    });

    it("skips an empty group", () => {
        expect(LayoutPieces([{ title: "none", pieces: [] }], 256).headings).toEqual([]);
    });
});
