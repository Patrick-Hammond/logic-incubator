import { describe, expect, it } from "vitest";
import { DATA_ICON_FIT, DATA_SWATCH_SIZE, FitIcon } from "./SpriteCanvas";

// Visible (trimmed) rects of the data brush icons, from frames.json's spriteSourceSize.
const SKULL = { x: 5, y: 7, width: 6, height: 6 };
const KNIGHT_IDLE_F0 = { x: 0, y: 8, width: 16, height: 20 };
const TORCH_F0 = { x: 0, y: 0, width: 8, height: 16 };
const WALL_MID = { x: 0, y: 0, width: 16, height: 16 };

describe("FitIcon on a data brush swatch", () => {
    it("leaves an icon that already fits at 1x, centring its visible pixels", () => {
        expect(FitIcon(SKULL, DATA_SWATCH_SIZE, DATA_ICON_FIT)).toEqual({ scale: 1, x: 0, y: -2 });
    });

    it("shrinks a tall icon in quarter steps, offsetting for its trim", () => {
        expect(FitIcon(KNIGHT_IDLE_F0, DATA_SWATCH_SIZE, DATA_ICON_FIT)).toEqual({ scale: 0.5, x: 4, y: -1 });
        expect(FitIcon(TORCH_F0, DATA_SWATCH_SIZE, DATA_ICON_FIT)).toEqual({ scale: 0.75, x: 5, y: 2 });
    });

    it("keeps a full-tile icon off the swatch's edge so its colour still shows", () => {
        expect(FitIcon(WALL_MID, DATA_SWATCH_SIZE, DATA_ICON_FIT)).toEqual({ scale: 0.75, x: 2, y: 2 });
    });

    it("never enlarges by default", () => {
        expect(FitIcon({ x: 0, y: 0, width: 4, height: 4 }, 16)).toEqual({ scale: 1, x: 6, y: 6 });
    });
});

describe("FitIcon for previews", () => {
    it("enlarges to the biggest whole-number scale that fits", () => {
        expect(FitIcon(WALL_MID, 64, { maxScale: Infinity })).toEqual({ scale: 4, x: 0, y: 0 });
        expect(FitIcon({ x: 0, y: 0, width: 16, height: 28 }, 64, { maxScale: Infinity })).toEqual({ scale: 2, x: 16, y: 4 });
    });

    it("falls back to an exact fit when even 1x is too big", () => {
        expect(FitIcon({ x: 0, y: 0, width: 100, height: 50 }, 64, { maxScale: Infinity })).toEqual({ scale: 0.64, x: 0, y: 16 });
    });
});
