import { Container, Graphics, Sprite, Texture } from "pixi.js";
import { AbilitySkin } from "../skin/Skin";
import UiTheme from "../UiTheme";
import UiInputGlyph from "./UiInputGlyph";

/**
 * An ability on the HUD: its icon in a frame, the button that uses it shown above (a prompt - see `InputGlyphs`), and a shade over the icon while it recharges that shrinks from the
 * top as it comes back. `Cooldown` is how much recharging is left, 1 (just used) to 0 (ready). The icon is the game's own picture, centred in the frame at its own size, or a whole
 * step smaller if it is too big. Only shows things - nothing in it takes the pointer.
 */
export default class UiAbilitySlot extends Container {
    private readonly skin: AbilitySkin;
    private readonly frame: Sprite;
    private readonly icon = new Sprite();
    private readonly shade = new Graphics();
    private readonly glyph: UiInputGlyph;
    private cooldown = 0;

    constructor(theme: UiTheme, variant: string, icon: Texture | null = null, glyph = "") {
        super();
        const skin = theme.skin.abilities && theme.skin.abilities[variant];
        if (!skin) {
            throw new Error(`The "${theme.skin.name}" skin has no ability "${variant}".`);
        }
        this.skin = skin;
        this.frame = new Sprite(theme.Texture(skin.frame));
        this.glyph = new UiInputGlyph(theme, glyph);
        this.addChild(this.icon, this.shade, this.frame, this.glyph);
        this.interactiveChildren = false;
        this.SetIcon(icon);
        this.SetGlyph(glyph);
    }

    /** The frame's size (the prompt stands above it). */
    get SlotWidth(): number {
        return this.frame.width;
    }

    get SlotHeight(): number {
        return this.frame.height;
    }

    SetIcon(texture: Texture | null): void {
        this.icon.visible = !!texture;
        if (!texture) return;
        const box = this.frame.width - this.skin.iconInset * 2;
        this.icon.texture = texture;
        const longest = Math.max(texture.width, texture.height);
        this.icon.scale.set(longest > box ? 1 / Math.ceil(longest / box) : 1);
        this.icon.position.set(Math.floor((this.frame.width - this.icon.width) / 2), Math.floor((this.frame.height - this.icon.height) / 2));
        this.DrawShade();
    }

    /** The prompt above the frame (a frame name, `pad_a`), or none (""). */
    SetGlyph(glyph: string, fallback = ""): void {
        this.glyph.SetGlyph(glyph, fallback);
        this.glyph.visible = !!glyph;
        this.glyph.position.set(Math.floor((this.frame.width - this.glyph.GlyphWidth) / 2), -this.skin.glyphGap - this.glyph.GlyphHeight);
    }

    /** Shows the prompt pressed (while its button is held). */
    set GlyphPressed(pressed: boolean) {
        this.glyph.Pressed = pressed;
    }

    get GlyphPressed(): boolean {
        return this.glyph.Pressed;
    }

    get Cooldown(): number {
        return this.cooldown;
    }

    set Cooldown(left: number) {
        const value = Math.max(0, Math.min(1, left || 0));
        if (value !== this.cooldown) {
            this.cooldown = value;
            this.DrawShade();
        }
    }

    /** The shade covers the bottom `cooldown` of the icon's box, in whole pixels. */
    private DrawShade(): void {
        const inset = this.skin.iconInset;
        const box = { width: this.frame.width - inset * 2, height: this.frame.height - inset * 2 };
        const height = Math.ceil(box.height * this.cooldown);
        this.shade.clear();
        if (height > 0) {
            this.shade.beginFill(this.skin.cooldownColour, this.skin.cooldownAlpha).drawRect(inset, inset + box.height - height, box.width, height).endFill();
        }
    }

    destroy(options?: { children?: boolean; texture?: boolean; baseTexture?: boolean }): void {
        super.destroy({ children: true, ...options });
    }
}
