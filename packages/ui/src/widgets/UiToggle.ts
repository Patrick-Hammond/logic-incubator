import { BitmapText, Sprite } from "pixi.js";
import { ToggleSkin } from "../skin/Skin";
import UiTheme from "../UiTheme";
import { PickState } from "./ButtonLook";
import UiControl from "./UiControl";
import { CreateText } from "./UiText";

/**
 * What a checkbox and a radio button share: a box (or ring) that is off or on, with a label beside it, looking different hovered and disabled. A press changes the value
 * (see `Trigger` in the subclasses) and emits `change` with it; `Checked` sets it from code without that.
 */
export default abstract class UiToggle extends UiControl {
    protected checked = false;
    private readonly box: Sprite;
    private readonly label: BitmapText | null;

    constructor(private readonly theme: UiTheme, private readonly skin: ToggleSkin, text: string, checked: boolean) {
        super();
        this.checked = checked;
        this.box = new Sprite(theme.Texture(skin.off.normal));
        this.label = text ? CreateText(theme, text, { font: skin.font }) : null;
        this.addChild(this.box);
        if (this.label) this.addChild(this.label);
        this.Redraw();
    }

    get Checked(): boolean {
        return this.checked;
    }

    set Checked(checked: boolean) {
        if (this.checked !== checked) {
            this.checked = checked;
            this.Refresh();
        }
    }

    /** The widget's size: the box, the gap and the label. */
    get ToggleWidth(): number {
        return Math.ceil(this.box.width + (this.label ? this.skin.gap + this.label.textWidth : 0));
    }

    get ToggleHeight(): number {
        return Math.ceil(Math.max(this.box.height, this.label ? this.label.textHeight : 0));
    }

    protected Redraw(): void {
        const state = this.State;
        this.box.texture = this.theme.Texture(PickState(this.checked ? this.skin.on : this.skin.off, state));
        const height = Math.max(this.box.height, this.label ? this.label.textHeight : 0);
        this.box.position.set(0, Math.floor((height - this.box.height) / 2));
        if (this.label) {
            this.label.tint = PickState(this.skin.textColour, state);
            this.label.position.set(this.box.width + this.skin.gap, Math.floor((height - this.label.textHeight) / 2));
        }
        this.SetHitSize(this.ToggleWidth, this.ToggleHeight);
    }
}
