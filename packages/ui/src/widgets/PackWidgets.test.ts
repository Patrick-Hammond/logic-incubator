import { describe, expect, it } from "vitest";
import { CursorCss, CursorScale } from "../UiCursor";
import { DpadGlyph, KeyGlyph, MouseGlyph, PadButtonGlyph, PressedGlyph, StickGlyph } from "./InputGlyphs";
import { StepChoice } from "./SelectorMath";
import { LinkRect, NodeRect, TreeSize, TreeSizes } from "./SkillTreeLayout";

describe("StepChoice", () => {
    it("goes round past either end when wrapping", () => {
        expect(StepChoice(2, 1, 3, true)).toBe(0);
        expect(StepChoice(0, -1, 3, true)).toBe(2);
        expect(StepChoice(1, 1, 3, true)).toBe(2);
    });

    it("stops at the ends otherwise, and has nowhere to go without choices", () => {
        expect(StepChoice(2, 1, 3, false)).toBe(2);
        expect(StepChoice(0, -1, 3, false)).toBe(0);
        expect(StepChoice(0, 1, 0, true)).toBe(-1);
    });
});

describe("input glyphs", () => {
    it("names the prompt for letters, digits (the number pad's too) and the named keys the art draws", () => {
        expect(KeyGlyph(69)).toBe("key_e");
        expect(KeyGlyph(50)).toBe("key_2");
        expect(KeyGlyph(98)).toBe("key_2");
        expect(KeyGlyph(32)).toBe("key_space");
        expect(KeyGlyph(13)).toBe("key_enter");
        expect(KeyGlyph(27)).toBeNull();
    });

    it("names pad buttons by the standard layout, and sticks, the d-pad and the mouse", () => {
        expect(PadButtonGlyph(0)).toBe("pad_a");
        expect(PadButtonGlyph(7)).toBe("pad_r2");
        expect(PadButtonGlyph(14)).toBe("pad_dpad_l");
        expect(PadButtonGlyph(9)).toBeNull();
        expect(DpadGlyph()).toBe("pad_dpad");
        expect(DpadGlyph("up")).toBe("pad_dpad_u");
        expect(StickGlyph("right", "down")).toBe("stick_r_d");
        expect(MouseGlyph(0)).toBe("mouse_left");
        expect(MouseGlyph("wheel")).toBe("mouse_wheel");
        expect(MouseGlyph(1)).toBeNull();
        expect(PressedGlyph("pad_a")).toBe("pad_a_pressed");
    });
});

describe("pointer sizing", () => {
    it("matches the UI's pixels, however the page enlarges the canvas, in whole steps", () => {
        expect(CursorScale(2, 1280, 1280)).toBe(2);
        expect(CursorScale(2, 1920, 1280)).toBe(3);
        expect(CursorScale(2, 320, 1280)).toBe(1);
        expect(CursorScale(2, 0, 1280)).toBe(2);
    });

    it("scales the hot spot with the picture", () => {
        expect(CursorCss("data:x", { frame: "f", x: 2, y: 1 }, 3)).toBe("url(data:x) 6 3, auto");
    });
});

describe("skill tree layout", () => {
    const sizes: TreeSizes = { cell: 8, nodeSize: 24, ringSize: 8, ringGap: 1, thickness: 4 };
    const skill = (id: string, x: number, y: number) => ({ id, x, y });
    const ring = (id: string, x: number, y: number) => ({ id, x, y, ring: true });

    it("centres skills and rings in their cells", () => {
        expect(NodeRect(skill("a", 3, 3), sizes)).toEqual({ x: 16, y: 16, width: 24, height: 24 });
        expect(NodeRect(ring("r", 6, 3), sizes)).toEqual({ x: 48, y: 24, width: 8, height: 8 });
    });

    it("runs a link from a skill's edge to a pixel short of a ring, either way round", () => {
        const across = LinkRect(skill("a", 3, 3), ring("r", 6, 3), sizes);
        expect(across).toEqual({ x: 40, y: 26, width: 7, height: 4 });
        expect(LinkRect(ring("r", 6, 3), skill("a", 3, 3), sizes)).toEqual(across);
        expect(LinkRect(skill("a", 3, 3), skill("b", 3, 7), sizes)).toEqual({ x: 26, y: 40, width: 4, height: 8 });
    });

    it("refuses a link that isn't straight, saying to turn through a ring", () => {
        expect(() => LinkRect(skill("a", 3, 3), skill("b", 6, 6), sizes)).toThrow(/put a ring at the corner/);
    });

    it("is as big as the furthest node", () => {
        expect(TreeSize([skill("a", 3, 3), ring("r", 9, 1)], sizes)).toEqual({ width: 80, height: 40 });
    });
});
