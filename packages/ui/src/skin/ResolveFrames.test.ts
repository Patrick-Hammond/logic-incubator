import { describe, expect, it } from "vitest";
import { ResolveFrames } from "./ResolveFrames";
import { Skin } from "./Skin";

const skin = (): Skin => ({
    name: "t",
    bundle: "ui",
    scale: 2,
    fonts: {},
    colours: {},
    buttons: { primary: { states: { normal: { frame: "btn", insets: undefined as never }, hover: { frame: "btn_hover", insets: { left: 1, top: 1, right: 1, bottom: 1 } } }, padding: { left: 0, top: 0, right: 0, bottom: 0 }, textColour: { normal: 0 }, pressedOffset: { x: 0, y: 0 }, font: "body" } },
    panels: { plain: { frame: { frame: "panel", insets: undefined as never }, padding: { left: 0, top: 0, right: 0, bottom: 0 } } },
    borderStyles: { line: { capLeft: "cap", capRight: "cap" } },
    bars: {}
});

const frames = {
    btn: { width: 14, height: 14, insets: { left: 6, top: 6, right: 6, bottom: 6 } },
    btn_hover: { width: 14, height: 14, insets: { left: 5, top: 5, right: 5, bottom: 5 } },
    panel: { width: 18, height: 18, insets: { left: 8, top: 8, right: 8, bottom: 8 } },
    cap: { width: 6, height: 8 }
};

describe("ResolveFrames", () => {
    it("fills in the insets of every nine-slice that has none, from the frame index", () => {
        const resolved = ResolveFrames(skin(), frames);
        expect(resolved.buttons.primary.states.normal.insets).toEqual({ left: 6, top: 6, right: 6, bottom: 6 });
        expect(resolved.panels.plain.frame.insets).toEqual({ left: 8, top: 8, right: 8, bottom: 8 });
    });

    it("lets insets written in the skin win over the index", () => {
        expect(ResolveFrames(skin(), frames).buttons.primary.states.hover!.insets).toEqual({ left: 1, top: 1, right: 1, bottom: 1 });
    });

    it("leaves a frame that isn't a nine-patch in the index (or isn't in it) without insets, and a plain frame name alone", () => {
        const s = skin();
        s.panels.plain.frame.frame = "cap";
        const resolved = ResolveFrames(s, frames);
        expect(resolved.panels.plain.frame.insets).toBeUndefined();
        expect(resolved.borderStyles.line.capLeft).toBe("cap");
        s.panels.plain.frame.frame = "nowhere";
        expect(ResolveFrames(s, frames).panels.plain.frame.insets).toBeUndefined();
    });

    it("leaves its input alone", () => {
        const s = skin();
        ResolveFrames(s, frames);
        expect(s.buttons.primary.states.normal.insets).toBeUndefined();
    });
});
