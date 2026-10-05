import { BitmapText, Sprite } from "pixi.js";
import { ButtonSkin } from "../skin/Skin";
import UiTheme from "../UiTheme";
import { ButtonFrameFor, ButtonTextColourFor } from "./ButtonLook";
import NineSlice from "./NineSlice";
import UiControl from "./UiControl";
import { CreateText } from "./UiText";

export type UiButtonOptions = {
    /** A fixed size in UI pixels; by default the content's size plus the skin's padding (and at least its minimum). */
    width?: number;
    height?: number;
    /** A picture (a frame of the skin's bundle) drawn in the button, before the label - or alone, for an icon button. */
    icon?: string;
};

/** Between an icon and the label beside it. */
const ICON_GAP = 3;

/**
 * A button in one of the skin's variants: a framed label (and/or icon) that looks different hovered, pressed and disabled, and emits `activate` when a press and release both
 * land on it, or when accept is pressed on it (see `UiControl`). The content is centred and drops by the skin's `pressedOffset` while pressed.
 */
export default class UiButton extends UiControl {
    private readonly skin: ButtonSkin;
    private readonly frames = new Map<string, NineSlice>();
    private readonly label: BitmapText | null;
    private readonly icon: Sprite | null;
    private readonly size: { width: number; height: number };
    private current: NineSlice | null = null;

    constructor(private readonly theme: UiTheme, variant: string, text: string, options: UiButtonOptions = {}) {
        super();
        const skin = theme.skin.buttons[variant];
        if (!skin) {
            throw new Error(`The "${theme.skin.name}" skin has no button "${variant}".`);
        }
        this.skin = skin;
        this.label = text ? CreateText(theme, text, { font: skin.font }) : null;
        this.icon = options.icon ? new Sprite(theme.Texture(options.icon)) : null;
        const padding = skin.padding;
        const content = this.ContentSize();
        this.size = {
            width: options.width !== undefined ? options.width : Math.max(skin.minWidth || 0, content.width + padding.left + padding.right),
            height: options.height !== undefined ? options.height : Math.max(skin.minHeight || 0, content.height + padding.top + padding.bottom)
        };
        if (this.icon) this.addChild(this.icon);
        if (this.label) this.addChild(this.label);
        this.SetHitSize(this.size.width, this.size.height);
        this.Redraw();
    }

    get ButtonWidth(): number {
        return this.size.width;
    }

    get ButtonHeight(): number {
        return this.size.height;
    }

    SetLabel(text: string): void {
        if (this.label) {
            this.label.text = text;
            this.Redraw();
        }
    }

    private ContentSize(): { width: number; height: number } {
        const label = this.label ? { width: this.label.textWidth, height: this.label.textHeight } : { width: 0, height: 0 };
        const icon = this.icon ? { width: this.icon.width, height: this.icon.height } : { width: 0, height: 0 };
        return { width: icon.width + (icon.width && label.width ? ICON_GAP : 0) + label.width, height: Math.max(icon.height, label.height) };
    }

    protected Redraw(): void {
        const state = this.State;
        const spec = ButtonFrameFor(this.skin, state);
        let frame = this.frames.get(spec.frame);
        if (!frame) {
            frame = new NineSlice(this.theme.Texture(spec.frame), spec, this.size.width, this.size.height);
            this.frames.set(spec.frame, frame);
            this.addChildAt(frame, 0);
        }
        if (this.current && this.current !== frame) {
            this.current.visible = false;
        }
        frame.visible = true;
        this.current = frame;

        const colour = ButtonTextColourFor(this.skin, state);
        const offset = state === "pressed" ? this.skin.pressedOffset : { x: 0, y: 0 };
        // The icon and label are centred as a group on whole pixels, inside the padding.
        const p = this.skin.padding;
        const room = { width: this.size.width - p.left - p.right, height: this.size.height - p.top - p.bottom };
        const content = this.ContentSize();
        let x = p.left + Math.floor((room.width - content.width) / 2) + offset.x;
        const y = (height: number) => p.top + Math.floor((room.height - height) / 2) + offset.y;
        if (this.icon) {
            this.icon.tint = colour;
            this.icon.position.set(x, y(this.icon.height));
            x += this.icon.width + ICON_GAP;
        }
        if (this.label) {
            this.label.tint = colour;
            this.label.position.set(x, y(this.label.textHeight));
        }
    }

    destroy(options?: { children?: boolean; texture?: boolean; baseTexture?: boolean }): void {
        this.frames.clear();
        super.destroy(options);
    }
}
