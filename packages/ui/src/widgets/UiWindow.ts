import { Container } from "pixi.js";
import { WindowSkin } from "../skin/Skin";
import UiTheme from "../UiTheme";
import NineSlice from "./NineSlice";
import UiButton from "./UiButton";
import UiPanel from "./UiPanel";
import { CreateText } from "./UiText";

/**
 * A window: a panel with a title on a plate across its top edge and a close button in its corner. What goes in it is added to `content`, which sits inside the panel's padding and
 * below the title. Emits `close` when the close button is pressed - what closing means (destroying it, hiding it, popping a focus scope) is the owner's.
 */
export default class UiWindow extends Container {
    readonly content = new Container();
    private readonly skin: WindowSkin;
    private readonly panel: UiPanel;
    private readonly closeButton: UiButton | null = null;

    constructor(theme: UiTheme, variant: string, readonly WindowWidth: number, readonly WindowHeight: number, title: string) {
        super();
        const skin = theme.skin.windows && theme.skin.windows[variant];
        if (!skin) {
            throw new Error(`The "${theme.skin.name}" skin has no window "${variant}".`);
        }
        this.skin = skin;
        this.panel = new UiPanel(theme, skin.panel, WindowWidth, WindowHeight);
        this.addChild(this.panel);

        const label = CreateText(theme, title, { font: skin.titleFont, colour: skin.titleColour });
        const pillWidth = Math.min(WindowWidth, Math.ceil(label.textWidth) + skin.titlePadding * 2);
        const pill = new NineSlice(theme.Texture(skin.title.frame), skin.title, pillWidth, skin.titleHeight);
        pill.position.set(Math.floor((WindowWidth - pillWidth) / 2), -skin.titleOffset);
        label.position.set(pill.x + Math.floor((pillWidth - label.textWidth) / 2), pill.y + Math.floor((skin.titleHeight - label.textHeight) / 2) - (skin.titleRaise || 0));
        this.addChild(pill, label);

        if (skin.close) {
            this.closeButton = new UiButton(theme, skin.close.button, "", { icon: skin.close.icon });
            this.closeButton.position.set(WindowWidth - this.closeButton.ButtonWidth + skin.close.offset.x, skin.close.offset.y);
            this.closeButton.on("activate", () => this.emit("close", this));
            this.addChild(this.closeButton);
        }

        // Inside the panel's padding, and below the part of the title pill that hangs inside the panel.
        const hanging = Math.max(0, skin.titleHeight - skin.titleOffset);
        const p = theme.skin.panels[skin.panel].padding;
        this.content.position.set(p.left, p.top + hanging);
        this.addChild(this.content);
    }

    /** How tall a window of a skin's variant has to be for `inner` pixels of room for its content (inside the panel's padding and below the title): a window sized to what it holds. */
    static HeightFor(theme: UiTheme, variant: string, inner: number): number {
        const skin = theme.skin.windows && theme.skin.windows[variant];
        if (!skin) {
            throw new Error(`The "${theme.skin.name}" skin has no window "${variant}".`);
        }
        const p = theme.skin.panels[skin.panel].padding;
        return inner + p.top + p.bottom + Math.max(0, skin.titleHeight - skin.titleOffset);
    }

    /** The close button, if the window has one (to register it for focus). */
    get CloseButton(): UiButton | null {
        return this.closeButton;
    }

    /** The room for the content. */
    get InnerWidth(): number {
        return this.panel.InnerWidth;
    }

    get InnerHeight(): number {
        const hanging = Math.max(0, this.skin.titleHeight - this.skin.titleOffset);
        return this.panel.InnerHeight - hanging;
    }

    /** Destroys what is inside too, so the controls in it let go of their focus registrations. */
    destroy(options?: { children?: boolean; texture?: boolean; baseTexture?: boolean }): void {
        super.destroy({ children: true, ...options });
    }
}
