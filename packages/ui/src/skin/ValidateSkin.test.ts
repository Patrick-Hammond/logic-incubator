import { describe, expect, it } from "vitest";
import { Skin } from "./Skin";
import { SkinLookup, ValidateSkin } from "./ValidateSkin";

const frames: Record<string, { width: number; height: number }> = {
    btn: { width: 20, height: 12 },
    panel: { width: 24, height: 24 },
    cap_l: { width: 6, height: 8 },
    cap_r: { width: 6, height: 8 },
    mid: { width: 4, height: 8 },
    tall: { width: 4, height: 9 },
    track: { width: 10, height: 10 },
    fill: { width: 2, height: 6 }
};
const lookup: SkinLookup = { FrameSize: name => frames[name], HasFont: id => id === "body" };
const slice = (frame: string, n = 3) => ({ frame, insets: { left: n, top: n, right: n, bottom: n } });

const skin = (): Skin => ({
    name: "test",
    bundle: "ui",
    scale: 2,
    fonts: { body: { id: "body", size: 8 } },
    colours: {},
    buttons: { primary: { states: { normal: slice("btn") }, padding: { left: 2, top: 2, right: 2, bottom: 2 }, textColour: { normal: 1 }, pressedOffset: { x: 0, y: 1 }, font: "body" } },
    panels: { plain: { frame: slice("panel", 6), padding: { left: 4, top: 4, right: 4, bottom: 4 }, borderTop: "line" } },
    borderStyles: { line: { capLeft: "cap_l", capRight: "cap_r", mid: "mid" } },
    bars: { hp: { track: slice("track", 2), height: 11, fill: "fill", fillPadding: { left: 2, top: 2, right: 2, bottom: 2 } } }
});

describe("ValidateSkin", () => {
    it("has nothing to say about a good skin", () => {
        expect(ValidateSkin(skin(), lookup)).toEqual([]);
    });

    it("names a frame that isn't there, and where it was asked for", () => {
        const s = skin();
        s.buttons.primary.states.hover = slice("missing");
        s.bars.hp.fill = "nope";
        expect(ValidateSkin(s, lookup)).toEqual([
            'buttons.primary.states.hover: there is no frame "missing" in the "ui" bundle',
            'bars.hp.fill: there is no frame "nope" in the "ui" bundle'
        ]);
    });

    it("checks the insets leave something of the frame, and are whole numbers", () => {
        const s = skin();
        s.panels.plain.frame = slice("panel", 12);
        s.buttons.primary.states.normal = { frame: "btn", insets: { left: 1.5, top: 1, right: 1, bottom: 1 } };
        const problems = ValidateSkin(s, lookup);
        expect(problems.find(p => p.startsWith("panels.plain.frame"))).toMatch(/leave nothing of the 24x24 frame "panel"/);
        expect(problems.find(p => p.startsWith("buttons.primary.states.normal"))).toMatch(/whole numbers/);
    });

    it("checks fonts exist, both the skin's and the ones its widgets ask for", () => {
        const s = skin();
        s.fonts.heading = { id: "gone", size: 16 };
        s.buttons.primary.font = "fancy";
        expect(ValidateSkin(s, lookup)).toEqual(['fonts.heading: there is no font "gone" in the "ui" bundle', 'buttons.primary: there is no font "fancy" in the skin\'s fonts']);
    });

    it("wants a font to be drawn at some size", () => {
        const s = skin();
        s.fonts.body.size = 0;
        expect(ValidateSkin(s, lookup)).toEqual(["fonts.body: size must be more than 0, not 0"]);
    });

    it("checks a panel's border style exists, and that a border style's pieces are the same height", () => {
        const s = skin();
        s.panels.plain.borderTop = "chain";
        s.borderStyles.line.mid = "tall";
        const problems = ValidateSkin(s, lookup);
        expect(problems).toContain('panels.plain.borderTop: there is no border style "chain"');
        expect(problems.find(p => p.startsWith("borderStyles.line"))).toMatch(/aren't all the same height \(8, 8, 9\)/);
    });

    it("checks a bar is tall enough for its fill", () => {
        const s = skin();
        s.bars.hp.height = 8;
        expect(ValidateSkin(s, lookup)).toEqual(["bars.hp: height 8 leaves no room for the fill inside the track"]);
    });

    it("wants a whole-number scale", () => {
        const s = skin();
        s.scale = 2.5;
        expect(ValidateSkin(s, lookup)[0]).toMatch(/scale must be a whole number/);
        s.scale = 0;
        expect(ValidateSkin(s, lookup)[0]).toMatch(/scale must be a whole number/);
    });

    it("checks a tooltip has both tails or neither", () => {
        const s = skin();
        const tip = { frame: slice("panel", 6), padding: { left: 1, top: 1, right: 1, bottom: 1 }, gap: 1, maxWidth: 50, titleFont: "body", titleColour: 1, textFont: "body", textColour: 1, delay: 1 };
        s.tooltips = { plain: tip, half: { ...tip, tailDown: "fill" } };
        expect(ValidateSkin(s, lookup)).toEqual(["tooltips.half: give both tails (tailDown and tailUp) or neither"]);
    });

    it("checks the art of a vertical slider and a horizontal scrollbar, when the skin has it", () => {
        const s = skin();
        s.sliders = { default: { track: slice("track", 2), thickness: 4, thumb: { normal: "fill" }, vertical: { track: slice("track", 2), thickness: 4, thumb: { normal: "gone" } } } };
        s.scrollbars = { default: { thickness: 4, track: slice("track", 2), thumb: { normal: slice("track", 2) }, minThumb: 4, horizontal: { track: slice("lost", 2), thumb: { normal: slice("track", 2) } } } };
        expect(ValidateSkin(s, lookup)).toEqual([
            'sliders.default.vertical.thumb.normal: there is no frame "gone" in the "ui" bundle',
            'scrollbars.default.horizontal.track: there is no frame "lost" in the "ui" bundle'
        ]);
    });

    it("checks a pointer's hot spot is inside its picture", () => {
        const s = skin();
        s.cursors = { default: { frame: "fill", x: 0, y: 0 }, pointer: { frame: "fill", x: 2, y: 1 } };
        expect(ValidateSkin(s, lookup)).toEqual(["cursors.pointer: the hot spot 2,1 is outside the 2x6 picture"]);
    });

    it("checks the HUD pieces' frames, an ability's room for its icon, a skill tree's grid and a tile marker's frames", () => {
        const s = skin();
        s.playerFrames = { default: { frame: "panel", portrait: { x: 0, y: 0, width: 4, height: 4 }, health: { fill: "fill", x: 0, y: 0 }, energy: { fill: "nope", x: 0, y: 0 }, statuses: { x: 0, y: 0, gap: 1 } } };
        s.abilities = { default: { frame: "track", iconInset: 5, glyphGap: 1, cooldownColour: 0, cooldownAlpha: 0.5 } };
        s.skillTrees = { default: { cell: 0, nodeSize: 4, selected: "panel", selectedOutset: 1, rings: { locked: "fill", unlocked: "fill" }, links: { locked: "fill", unlocked: "fill" }, linkThickness: 2, ringGap: 1, tierPrefix: "t_", tierInset: 1 } };
        s.tileMarkers = { default: { frames: [], frameMs: 100, tileX: 0, tileY: 0 } };
        expect(ValidateSkin(s, lookup)).toEqual([
            'playerFrames.default.energy.fill: there is no frame "nope" in the "ui" bundle',
            "abilities.default: iconInset 5 leaves no room for the icon in the 10x10 frame",
            "skillTrees.default: cell must be more than 0, not 0",
            "tileMarkers.default: it has no frames"
        ]);
    });
});
