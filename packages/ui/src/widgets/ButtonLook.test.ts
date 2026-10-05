import { describe, expect, it } from "vitest";
import { ButtonSkin } from "../skin/Skin";
import { ButtonFrameFor, ButtonStateOf, ButtonTextColourFor } from "./ButtonLook";

const idle = { disabled: false, pressed: false, hover: false, focused: false };

describe("ButtonStateOf", () => {
    it("is normal when nothing is happening", () => {
        expect(ButtonStateOf(idle)).toBe("normal");
    });

    it("shows hover, pressed and focus", () => {
        expect(ButtonStateOf({ ...idle, hover: true })).toBe("hover");
        expect(ButtonStateOf({ ...idle, pressed: true, hover: true })).toBe("pressed");
        expect(ButtonStateOf({ ...idle, focused: true })).toBe("focused");
    });

    it("lets the stronger state win: pressed over hover over focus", () => {
        expect(ButtonStateOf({ ...idle, hover: true, focused: true })).toBe("hover");
        expect(ButtonStateOf({ ...idle, pressed: true, focused: true })).toBe("pressed");
    });

    it("ignores the pointer and focus when disabled", () => {
        expect(ButtonStateOf({ disabled: true, pressed: true, hover: true, focused: true })).toBe("disabled");
    });
});

describe("a button skin's fallbacks", () => {
    const slice = (frame: string) => ({ frame, insets: { left: 1, top: 1, right: 1, bottom: 1 } });
    const skin: ButtonSkin = {
        states: { normal: slice("n"), hover: slice("h") },
        padding: { left: 0, top: 0, right: 0, bottom: 0 },
        textColour: { normal: 0xffffff, disabled: 0x888888 },
        pressedOffset: { x: 0, y: 1 },
        font: "body"
    };

    it("uses normal's frame for a state the skin doesn't draw", () => {
        expect(ButtonFrameFor(skin, "hover").frame).toBe("h");
        expect(ButtonFrameFor(skin, "pressed").frame).toBe("n");
        expect(ButtonFrameFor(skin, "focused").frame).toBe("n");
    });

    it("uses normal's label colour for a state with none of its own - including a colour that is 0 (black)", () => {
        expect(ButtonTextColourFor(skin, "disabled")).toBe(0x888888);
        expect(ButtonTextColourFor(skin, "hover")).toBe(0xffffff);
        expect(ButtonTextColourFor({ ...skin, textColour: { normal: 0xffffff, hover: 0 } }, "hover")).toBe(0);
    });
});
