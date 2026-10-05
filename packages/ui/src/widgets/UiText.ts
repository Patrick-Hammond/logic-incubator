import { BitmapText } from "pixi.js";
import UiTheme from "../UiTheme";

export type UiTextOptions = {
    /** The skin's font key (`body`, `heading`); `body` by default. */
    font?: string;
    /** 0xRRGGBB, or the name of one of the skin's colours; white by default. */
    colour?: number | string;
    align?: "left" | "center" | "right";
    /** Wraps lines wider than this many UI pixels. */
    maxWidth?: number;
};

/** The colour an option asks for: a number as it is, a name looked up in the skin, white if none. */
export function ResolveColour(theme: UiTheme, colour: number | string | undefined): number {
    if (colour === undefined) {
        return 0xffffff;
    }
    return typeof colour === "number" ? colour : theme.Colour(colour);
}

/**
 * A function giving the width in UI pixels of a string in one of the skin's fonts, for wrapping text and placing a caret. `BitmapText` leaves a trailing space out of its width, so
 * the string is measured with a letter after it and the letter's own width taken off.
 */
export function CreateMeasure(theme: UiTheme, font = "body"): (text: string) => number {
    const probe = CreateText(theme, "");
    probe.font = { name: theme.FontName(font), size: theme.FontSize(font) };
    const width = (text: string) => {
        probe.text = text;
        return probe.textWidth;
    };
    const marker = width("x");
    return text => (text ? width(text + "x") - marker : 0);
}

/**
 * Text in one of the skin's bitmap fonts, at the size the font was made at: a bitmap font is drawn on whole pixels and not scaled, so it stays crisp at the
 * UI layer's integer scale. The glyphs are white and `tint` colours them.
 */
export function CreateText(theme: UiTheme, text: string, options: UiTextOptions = {}): BitmapText {
    const key = options.font || "body";
    const label = new BitmapText(text, {
        font: { name: theme.FontName(key), size: theme.FontSize(key) },
        align: options.align || "left",
        tint: ResolveColour(theme, options.colour)
    });
    label.maxWidth = options.maxWidth || 0;
    label.roundPixels = true;
    return label;
}
