import { Container } from "pixi.js";
import { PanelSkin } from "../skin/Skin";
import UiTheme from "../UiTheme";
import NineSlice from "./NineSlice";
import UiBorder from "./UiBorder";

/**
 * A framed panel at any size, with an optional ornamental border along its top edge (the same art as a divider). What goes in it is added to `content`, which
 * sits inside the skin's padding; `InnerWidth` and `InnerHeight` are the room it has.
 */
export default class UiPanel extends Container {
    /** Where a panel's contents go: its top-left is the inside of the padding. */
    readonly content = new Container();
    private readonly skin: PanelSkin;
    private readonly frame: NineSlice;
    private readonly border?: UiBorder;

    constructor(theme: UiTheme, variant: string, width: number, height: number) {
        super();
        const skin = theme.skin.panels[variant];
        if (!skin) {
            throw new Error(`The "${theme.skin.name}" skin has no panel "${variant}".`);
        }
        this.skin = skin;
        this.frame = new NineSlice(theme.Texture(skin.frame.frame), skin.frame, width, height);
        this.addChild(this.frame);
        if (skin.borderTop) {
            this.border = new UiBorder(theme, skin.borderTop, 0);
            this.addChild(this.border);
        }
        this.content.position.set(skin.padding.left, skin.padding.top);
        this.addChild(this.content);
        this.Resize(width, height);
    }

    get PanelWidth(): number {
        return this.frame.SliceWidth;
    }

    get PanelHeight(): number {
        return this.frame.SliceHeight;
    }

    get InnerWidth(): number {
        return this.PanelWidth - this.skin.padding.left - this.skin.padding.right;
    }

    get InnerHeight(): number {
        return this.PanelHeight - this.skin.padding.top - this.skin.padding.bottom;
    }

    Resize(width: number, height: number): void {
        this.frame.Resize(width, height);
        if (this.border) {
            const insets = this.skin.frame.insets;
            this.border.Resize(this.PanelWidth - insets.left - insets.right);
            this.border.position.set(insets.left, this.skin.borderOffset === undefined ? insets.top : this.skin.borderOffset);
        }
    }

    /** Destroys what is inside too, so the controls in it let go of their focus registrations. */
    destroy(options?: { children?: boolean; texture?: boolean; baseTexture?: boolean }): void {
        super.destroy({ children: true, ...options });
    }
}
