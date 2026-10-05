import { describe, expect, it } from "vitest";
import { Skin } from "./skin/Skin";
import UiTheme, { UiAssets, ValidateLoadedSkin } from "./UiTheme";

const slice = (frame: string) => ({ frame, insets: { left: 2, top: 2, right: 2, bottom: 2 } });

const skin: Skin = {
    name: "test",
    bundle: "ui",
    scale: 2,
    fonts: { body: { id: "body", size: 7 }, heading: { id: "head", size: 14 } },
    colours: { text: 0xe8e8ff },
    buttons: { primary: { states: { normal: slice("btn") }, padding: { left: 1, top: 1, right: 1, bottom: 1 }, textColour: { normal: 1 }, pressedOffset: { x: 0, y: 1 }, font: "body" } },
    panels: {},
    borderStyles: {},
    bars: {}
};

/** Assets as the asset system has them: a frame's texture or an error for one that isn't there. */
const assets = (frames: Record<string, { width: number; height: number }>, fonts: string[]): UiAssets => ({
    Texture: frame => {
        if (!frames[frame]) throw new Error(`"ui.${frame}" is not a loaded sprite.`);
        return frames[frame] as never;
    },
    FontName: id => {
        if (fonts.indexOf(id) < 0) throw new Error(`"ui.${id}" is not a loaded font.`);
        return "ui_" + id;
    }
});

describe("UiTheme", () => {
    const theme = new UiTheme(skin, assets({}, ["body", "head"]));

    it("gives the skin's scale, colours and fonts", () => {
        expect(theme.Scale).toBe(2);
        expect(theme.Colour("text")).toBe(0xe8e8ff);
        expect(theme.FontName("heading")).toBe("ui_head");
        expect(theme.FontSize("heading")).toBe(14);
    });

    it("says which skin lacks a colour or font it was asked for", () => {
        expect(() => theme.Colour("nope")).toThrow('The "test" skin has no colour "nope".');
        expect(() => theme.FontName("fancy")).toThrow('The "test" skin has no font "fancy".');
        expect(() => theme.FontSize("fancy")).toThrow('The "test" skin has no font "fancy".');
    });
});

describe("ValidateLoadedSkin", () => {
    it("finds frames and fonts through the asset system, and reports what it can't", () => {
        expect(ValidateLoadedSkin(skin, assets({ btn: { width: 14, height: 14 } }, ["body", "head"]))).toEqual([]);
        expect(ValidateLoadedSkin(skin, assets({}, ["body"]))).toEqual([
            'fonts.heading: there is no font "head" in the "ui" bundle',
            'buttons.primary.states.normal: there is no frame "btn" in the "ui" bundle'
        ]);
    });
});
