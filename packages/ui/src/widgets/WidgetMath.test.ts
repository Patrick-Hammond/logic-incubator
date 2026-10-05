import { describe, expect, it } from "vitest";
import { IconStates } from "./IconStates";
import { ClampScroll, MaxScroll, ScrollFromThumb, ScrollToReveal, ThumbLength, ThumbOffset, WheelPixels } from "./ScrollMath";
import { NudgeValue, PositionOf, SnapValue, ValueAt } from "./SliderMath";
import { CaretScroll, CaretX, Sanitise, SameState, SelectionSpan } from "./TextInputModel";
import ToastQueue, { ToastOpacity } from "./ToastQueue";
import { PlaceTooltip } from "./TooltipPlacement";
import { Typewriter, WrapText } from "./Typewriter";

describe("slider arithmetic", () => {
    const range = { min: 0, max: 100, step: 5 };

    it("snaps a value to the nearest step and clamps it", () => {
        expect(SnapValue(12, range)).toBe(10);
        expect(SnapValue(13, range)).toBe(15);
        expect(SnapValue(-20, range)).toBe(0);
        expect(SnapValue(500, range)).toBe(100);
    });

    it("counts steps from the minimum, and doesn't let fractional steps drift", () => {
        expect(SnapValue(0.30000000000000004, { min: 0, max: 1, step: 0.1 })).toBe(0.3);
        expect(SnapValue(2.6, { min: 1, max: 5, step: 0.5 })).toBe(2.5);
        expect(SnapValue(7, { min: 1, max: 10, step: 3 })).toBe(7);
    });

    it("never goes past a maximum that isn't a whole number of steps along, but can always reach it", () => {
        expect(SnapValue(10, { min: 0, max: 10, step: 3 })).toBe(10);
        expect(SnapValue(9.9, { min: 0, max: 10, step: 4 })).toBe(10);
        expect(SnapValue(8.9, { min: 0, max: 10, step: 4 })).toBe(8);
        expect(SnapValue(11, { min: 0, max: 10, step: 4 })).toBe(10);
    });

    it("copes with an empty range and a step of 0", () => {
        expect(SnapValue(5, { min: 3, max: 3, step: 1 })).toBe(3);
        expect(SnapValue(5.5, { min: 0, max: 10, step: 0 })).toBe(5.5);
    });

    it("turns a position along the track into a value and back", () => {
        expect(ValueAt(50, 10, 80, range)).toBe(50);
        expect(ValueAt(10, 10, 80, range)).toBe(0);
        expect(ValueAt(0, 10, 80, range)).toBe(0);
        expect(ValueAt(500, 10, 80, range)).toBe(100);
        expect(PositionOf(50, 10, 80, range)).toBe(50);
        expect(PositionOf(100, 10, 80, range)).toBe(90);
        expect(ValueAt(5, 0, 0, range)).toBe(0);
    });

    it("steps by one, or ten with the large step, and stays in range", () => {
        expect(NudgeValue(50, 1, range)).toBe(55);
        expect(NudgeValue(50, -1, range, true)).toBe(0);
        expect(NudgeValue(98, 1, range)).toBe(100);
        expect(NudgeValue(0, -1, range)).toBe(0);
    });
});

describe("scroll arithmetic", () => {
    it("scrolls as far as the part out of view, and no further", () => {
        expect(MaxScroll(300, 100)).toBe(200);
        expect(MaxScroll(80, 100)).toBe(0);
        expect(ClampScroll(250, 300, 100)).toBe(200);
        expect(ClampScroll(-5, 300, 100)).toBe(0);
    });

    it("sizes the thumb by the share of the content in view, with a minimum, filling the track when everything fits", () => {
        expect(ThumbLength(400, 100, 80, 12)).toBe(20);
        expect(ThumbLength(4000, 100, 80, 12)).toBe(12);
        expect(ThumbLength(100, 100, 80, 12)).toBe(80);
        expect(ThumbLength(50, 100, 80, 12)).toBe(80);
        expect(ThumbLength(400, 100, 0, 12)).toBe(0);
    });

    it("puts the thumb at the top for no scroll and at the bottom for all of it, and reads a dragged position back as a scroll", () => {
        const [content, viewport, track] = [400, 100, 80];
        const thumb = ThumbLength(content, viewport, track, 12);
        expect(ThumbOffset(0, content, viewport, track, thumb)).toBe(0);
        expect(ThumbOffset(300, content, viewport, track, thumb)).toBe(track - thumb);
        expect(ThumbOffset(150, content, viewport, track, thumb)).toBe(30);
        expect(ScrollFromThumb(30, content, viewport, track, thumb)).toBe(150);
        expect(ScrollFromThumb(-10, content, viewport, track, thumb)).toBe(0);
        expect(ScrollFromThumb(999, content, viewport, track, thumb)).toBe(300);
        expect(ScrollFromThumb(10, 100, 100, 80, 80)).toBe(0);
    });

    it("turns a wheel movement into pixels by its mode", () => {
        expect(WheelPixels(100, 0, 10, 100)).toBe(100);
        expect(WheelPixels(3, 1, 10, 100)).toBe(30);
        expect(WheelPixels(1, 2, 10, 100)).toBe(100);
    });

    it("scrolls the least that shows an item", () => {
        expect(ScrollToReveal(50, 100, 60, 80)).toBe(50); // already in view
        expect(ScrollToReveal(50, 100, 20, 40)).toBe(20); // above
        expect(ScrollToReveal(50, 100, 160, 190)).toBe(90); // below: its end at the viewport's bottom
        expect(ScrollToReveal(0, 100, 20, 40, 4)).toBe(0);
        expect(ScrollToReveal(50, 100, 20, 40, 4)).toBe(16);
        expect(ScrollToReveal(0, 100, 80, 300)).toBe(80); // taller than the viewport: its start
    });
});

describe("text input model", () => {
    it("keeps to the allowed characters and the maximum length, and moves the selection with the edit", () => {
        expect(Sanitise({ value: "ab1c2", start: 5, end: 5 }, { allowed: /[a-z]/ })).toEqual({ value: "abc", start: 3, end: 3 });
        expect(Sanitise({ value: "a1b2c", start: 2, end: 4 }, { allowed: /[a-z]/ })).toEqual({ value: "abc", start: 1, end: 2 });
        expect(Sanitise({ value: "abcdef", start: 6, end: 6 }, { maxLength: 4 })).toEqual({ value: "abcd", start: 4, end: 4 });
        expect(Sanitise({ value: "hello", start: 1, end: 3 }, {})).toEqual({ value: "hello", start: 1, end: 3 });
    });

    it("orders a backwards selection", () => {
        expect(Sanitise({ value: "hello", start: 4, end: 1 }, {})).toEqual({ value: "hello", start: 1, end: 4 });
    });

    it("compares states", () => {
        expect(SameState({ value: "a", start: 0, end: 1 }, { value: "a", start: 0, end: 1 })).toBe(true);
        expect(SameState({ value: "a", start: 0, end: 1 }, { value: "a", start: 1, end: 1 })).toBe(false);
    });

    const measure = (text: string) => text.length * 6;
    it("finds the caret and the selection on screen by measuring the text before them", () => {
        expect(CaretX({ value: "hello", start: 2, end: 2 }, measure)).toBe(12);
        expect(SelectionSpan({ value: "hello", start: 1, end: 4 }, measure)).toEqual({ x0: 6, x1: 24 });
        expect(SelectionSpan({ value: "hello", start: 2, end: 2 }, measure)).toBeNull();
    });

    it("scrolls the text only as far as it must to keep the caret in view", () => {
        expect(CaretScroll(30, 100, 0)).toBe(0);
        expect(CaretScroll(150, 100, 0)).toBe(52);
        expect(CaretScroll(60, 100, 52)).toBe(52);
        expect(CaretScroll(40, 100, 52)).toBe(38);
        expect(CaretScroll(0, 100, 52)).toBe(0);
    });
});

describe("typewriter and wrapping", () => {
    it("reveals characters over time, carrying the fraction between updates", () => {
        const t = new Typewriter(10, 20); // 20 characters a second
        expect(t.Update(25)).toBe(0); // half a character
        expect(t.Update(25)).toBe(1);
        expect(t.Visible).toBe(1);
        expect(t.Update(1000)).toBe(9);
        expect(t.Done).toBe(true);
        expect(t.Update(1000)).toBe(0);
    });

    it("can be skipped to the end, and never reveals with no speed", () => {
        const t = new Typewriter(10, 5);
        t.Skip();
        expect(t.Visible).toBe(10);
        expect(t.Done).toBe(true);
        const none = new Typewriter(10, 0);
        expect(none.Update(5000)).toBe(0);
    });

    const measure = (text: string) => text.length;
    it("wraps on spaces at the width, keeping the text's own line breaks", () => {
        expect(WrapText("the quick brown fox", 10, measure)).toBe("the quick\nbrown fox");
        expect(WrapText("one\ntwo three", 6, measure)).toBe("one\ntwo\nthree");
        expect(WrapText("short", 20, measure)).toBe("short");
    });

    it("gives a word wider than the line a line of its own", () => {
        expect(WrapText("a unbelievably b", 5, measure)).toBe("a\nunbelievably\nb");
        expect(WrapText("", 5, measure)).toBe("");
    });
});

describe("PlaceTooltip", () => {
    const bounds = { x: 0, y: 0, width: 640, height: 360 };
    const size = { width: 100, height: 40 };

    it("goes above the target, centred, with the tail at the target's middle", () => {
        const place = PlaceTooltip({ x: 300, y: 200, width: 40, height: 20 }, size, bounds, 2, 6);
        expect(place).toEqual({ x: 270, y: 152, below: false, tailX: 50 });
    });

    it("goes below when there is no room above", () => {
        const place = PlaceTooltip({ x: 300, y: 10, width: 40, height: 20 }, size, bounds, 2, 6);
        expect(place.below).toBe(true);
        expect(place.y).toBe(38);
    });

    it("stays inside the bounds and keeps the tail pointing at the target", () => {
        const left = PlaceTooltip({ x: 0, y: 200, width: 20, height: 20 }, size, bounds, 2, 6);
        expect(left.x).toBe(0);
        expect(left.tailX).toBe(10);
        const right = PlaceTooltip({ x: 630, y: 200, width: 10, height: 20 }, size, bounds, 2, 6);
        expect(right.x).toBe(540);
        expect(right.tailX).toBe(94);
    });

    it("keeps the tail away from the corners", () => {
        const place = PlaceTooltip({ x: 0, y: 200, width: 2, height: 20 }, size, bounds, 2, 6);
        expect(place.tailX).toBe(6);
    });

    it("picks the side with more room when it fits on neither", () => {
        const tall = { width: 100, height: 300 };
        expect(PlaceTooltip({ x: 100, y: 100, width: 20, height: 20 }, tall, bounds, 2, 6).below).toBe(true);
        expect(PlaceTooltip({ x: 100, y: 240, width: 20, height: 20 }, tall, bounds, 2, 6).below).toBe(false);
    });
});

describe("ToastQueue", () => {
    const timing = { showMs: 1000, fadeMs: 200, max: 2 };

    it("slides a toast in, holds it, fades it out and says when it has gone", () => {
        const q = new ToastQueue<string>(timing);
        q.Push("a");
        expect(q.Active.map(t => [t.item, t.phase])).toEqual([["a", "in"]]);
        q.Update(100);
        expect(q.Active[0]).toMatchObject({ phase: "in", progress: 0.5 });
        q.Update(100);
        expect(q.Active[0].phase).toBe("show");
        q.Update(1000);
        expect(q.Active[0]).toMatchObject({ phase: "out", progress: 0 });
        q.Update(100);
        expect(q.Active[0]).toMatchObject({ phase: "out", progress: 0.5 });
        expect(q.Update(100)).toEqual(["a"]);
        expect(q.Active).toEqual([]);
    });

    it("shows only `max` at once and starts the next as room opens", () => {
        const q = new ToastQueue<string>(timing);
        ["a", "b", "c"].forEach(t => q.Push(t));
        expect(q.Active.map(t => t.item)).toEqual(["a", "b"]);
        expect(q.Waiting).toBe(1);
        q.Update(1400);
        expect(q.Active.map(t => t.item)).toEqual(["c"]);
        expect(q.Waiting).toBe(0);
    });

    it("dismisses a showing toast (it fades out from now) and drops a waiting one", () => {
        const q = new ToastQueue<string>(timing);
        const ids = ["a", "b", "c"].map(t => q.Push(t));
        expect(q.Dismiss(ids[2])).toBe(true);
        expect(q.Waiting).toBe(0);
        expect(q.Dismiss(ids[0])).toBe(true);
        expect(q.Active[0].phase).toBe("out");
        expect(q.Update(200)).toEqual(["a"]);
        expect(q.Dismiss(ids[0])).toBe(false);
    });

    it("keeps a toast with no time limit until it is dismissed, and lets one toast have its own time", () => {
        const q = new ToastQueue<string>(timing);
        const stay = q.Push("stay", 0);
        q.Update(60000);
        expect(q.Active[0]).toMatchObject({ item: "stay", phase: "show" });
        q.Dismiss(stay);
        expect(q.Update(200)).toEqual(["stay"]);
        q.Push("quick", 100);
        q.Update(200 + 100 + 200);
        expect(q.Active).toEqual([]);
    });

    it("fades with an eased opacity", () => {
        expect(ToastOpacity("in", 0)).toBe(0);
        expect(ToastOpacity("in", 1)).toBe(1);
        expect(ToastOpacity("in", 0.5)).toBe(0.5);
        expect(ToastOpacity("show", 0.3)).toBe(1);
        expect(ToastOpacity("out", 1)).toBe(0);
    });
});

describe("IconStates", () => {
    it("fills icons from the left, using halves where there are some", () => {
        expect(IconStates(5, 6, 3, true)).toEqual(["full", "full", "half"]);
        expect(IconStates(6, 6, 3, true)).toEqual(["full", "full", "full"]);
        expect(IconStates(0, 6, 3, true)).toEqual(["empty", "empty", "empty"]);
        expect(IconStates(1, 6, 3, true)).toEqual(["half", "empty", "empty"]);
    });

    it("rounds a partly filled icon to full or empty without halves", () => {
        expect(IconStates(3, 6, 3, false)).toEqual(["full", "empty", "empty"]);
        expect(IconStates(2.4, 6, 3, false)).toEqual(["full", "empty", "empty"]);
    });

    it("clamps the value and copes with no icons", () => {
        expect(IconStates(99, 4, 2, true)).toEqual(["full", "full"]);
        expect(IconStates(-3, 4, 2, true)).toEqual(["empty", "empty"]);
        expect(IconStates(2, 4, 0, true)).toEqual([]);
    });
});
