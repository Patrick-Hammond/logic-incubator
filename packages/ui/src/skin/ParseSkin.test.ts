import { describe, expect, it } from "vitest";
import { ParseColour, ParseSkin } from "./ParseSkin";

describe("ParseColour", () => {
    it("reads #rrggbb in either case, with or without the #, and numbers", () => {
        expect(ParseColour("#e6e6fa", "x")).toBe(0xe6e6fa);
        expect(ParseColour("E6E6FA", "x")).toBe(0xe6e6fa);
        expect(ParseColour(0x102030, "x")).toBe(0x102030);
        expect(ParseColour("#000000", "x")).toBe(0);
    });

    it("says where a bad colour is", () => {
        expect(() => ParseColour("#fff", "colours.text")).toThrow('colours.text: "#fff" isn\'t a colour');
        expect(() => ParseColour(-1, "x")).toThrow(/isn't a colour/);
        expect(() => ParseColour(0x1000000, "x")).toThrow(/isn't a colour/);
        expect(() => ParseColour(undefined, "x")).toThrow(/isn't a colour/);
        expect(() => ParseColour(1.5, "x")).toThrow(/isn't a colour/);
    });
});

describe("ParseSkin", () => {
    const data = () => ({
        name: "t",
        bundle: "ui",
        scale: 2,
        fonts: {},
        colours: { text: "#ffffff", dim: "#808080" },
        buttons: { primary: { textColour: { normal: "#ffffff", hover: "#ffff00" }, states: {} } },
        panels: {},
        borderStyles: {},
        bars: {}
    });

    it("turns the skin's colours - named ones and a button's label colours - into numbers", () => {
        const skin = ParseSkin(data());
        expect(skin.colours).toEqual({ text: 0xffffff, dim: 0x808080 });
        expect(skin.buttons.primary.textColour).toEqual({ normal: 0xffffff, hover: 0xffff00 });
    });

    it("leaves its input alone and everything else as it was", () => {
        const input = data();
        const skin = ParseSkin(input);
        expect(input.colours.text).toBe("#ffffff");
        expect(skin.scale).toBe(2);
        expect(skin.bundle).toBe("ui");
    });

    it("names the colour that's wrong", () => {
        const bad = data();
        bad.buttons.primary.textColour.hover = "yellow";
        expect(() => ParseSkin(bad)).toThrow("buttons.primary.textColour.hover");
        expect(() => ParseSkin(null)).toThrow(/must hold an object/);
    });
});
