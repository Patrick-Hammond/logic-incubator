import { BitmapText, Container, Sprite } from "pixi.js";
import UiTheme from "../UiTheme";
import { PressedGlyph } from "./InputGlyphs";
import { CreateText } from "./UiText";

export type UiInputGlyphOptions = {
    /** Written instead when the skin's bundle has no picture for the glyph (a key the art doesn't draw): "ESC". The skin's font and muted colour. */
    fallback?: string;
};

/**
 * A button prompt: the picture of a key, pad button, stick or mouse button (a frame name - see `InputGlyphs` for the one standing for a key code or pad button), shown pressed while
 * `Pressed` is set, for the prompts that have a pressed look. A glyph the bundle doesn't have is written out as text (`fallback`) rather than missing. `SetGlyph` changes it, for a
 * hint that follows the device in use.
 */
export default class UiInputGlyph extends Container {
    private readonly picture = new Sprite();
    private readonly label: BitmapText;
    private glyph = "";
    private fallback = "";
    private pressed = false;

    constructor(private readonly theme: UiTheme, glyph: string, options: UiInputGlyphOptions = {}) {
        super();
        this.label = CreateText(theme, "", { colour: "muted" });
        this.addChild(this.picture, this.label);
        this.SetGlyph(glyph, options.fallback);
    }

    /** The frame shown (as given, not its pressed look). */
    get Glyph(): string {
        return this.glyph;
    }

    SetGlyph(glyph: string, fallback = ""): void {
        this.glyph = glyph;
        this.fallback = fallback;
        this.Redraw();
    }

    get Pressed(): boolean {
        return this.pressed;
    }

    set Pressed(pressed: boolean) {
        if (this.pressed !== pressed) {
            this.pressed = pressed;
            this.Redraw();
        }
    }

    /** The prompt's size. */
    get GlyphWidth(): number {
        return this.picture.visible ? this.picture.width : Math.ceil(this.label.textWidth);
    }

    get GlyphHeight(): number {
        return this.picture.visible ? this.picture.height : Math.ceil(this.label.textHeight);
    }

    private Redraw(): void {
        const has = !!this.glyph && this.theme.HasTexture(this.glyph);
        this.picture.visible = has;
        this.label.visible = !has;
        if (has) {
            const pressed = PressedGlyph(this.glyph);
            this.picture.texture = this.theme.Texture(this.pressed && this.theme.HasTexture(pressed) ? pressed : this.glyph);
        } else {
            this.label.text = this.fallback || this.glyph;
        }
    }

    destroy(options?: { children?: boolean; texture?: boolean; baseTexture?: boolean }): void {
        super.destroy({ children: true, ...options });
    }
}
