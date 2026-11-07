import {BitmapText, Container} from "pixi.js";
import UiTheme from "@logic-incubator/ui/UiTheme";
import UiBorder from "@logic-incubator/ui/widgets/UiBorder";
import UiPanel from "@logic-incubator/ui/widgets/UiPanel";
import {CreateText} from "@logic-incubator/ui/widgets/UiText";

/** The panel the HUD's sections are drawn on - the skin's dark one, its plain one in a skin without it. */
const PanelVariant = "dark";
const FallbackVariant = "plain";
/** The divider under a section's title - the skin's light separator, a plain line in a skin without it. */
const Divider = "separator_light";
/** How far in from the panel's edges its title and contents start: clear of the corner ornaments' sweep. */
export const SectionInset = 16;
/** Room above the title, and between the title, the divider and the contents. */
const TitleTop = 12;
const TitleGap = 2;
const DividerGap = 6;

/** A panel for the HUD: the skin's dark one if it has one. `width` and `height` are its size, in UI pixels. */
export function HudPanel(theme: UiTheme, width: number, height: number): UiPanel {
    return new UiPanel(theme, theme.skin.panels[PanelVariant] ? PanelVariant : FallbackVariant, width, height);
}

/**
 * One of the HUD's sections: a panel with a title in its top-left (in the skin's `muted` colour), a note at the title's
 * right - an inventory's "3 / 5" (`SetNote`) - and a divider under them. What goes in it is added to `content`, whose
 * top-left is under the divider, `SectionInset` in from the left; `InnerWidth` is the room it has across.
 */
export default class HudSection extends Container {
    readonly content = new Container();
    private readonly panel: UiPanel;
    private readonly note: BitmapText;
    private readonly innerWidth: number;

    constructor(theme: UiTheme, title: string, width: number, height: number) {
        super();
        this.panel = HudPanel(theme, width, height);
        this.innerWidth = width - SectionInset * 2;
        const heading = CreateText(theme, title, {font: "heading", colour: "muted"});
        heading.position.set(SectionInset, TitleTop);
        this.note = CreateText(theme, "", {colour: "muted"});
        this.note.y = TitleTop;
        let top = TitleTop + Math.ceil(heading.textHeight) + TitleGap;
        this.addChild(this.panel, heading, this.note);
        if (theme.skin.borderStyles[Divider]) {
            const divider = new UiBorder(theme, Divider, width - SectionInset);
            divider.position.set(Math.round(SectionInset / 2), top);
            this.addChild(divider);
            top += divider.LineHeight;
        }
        this.content.position.set(SectionInset, top + DividerGap);
        this.addChild(this.content);
    }

    /** How far down a section's contents start - the same for every section in a skin. */
    static ContentTop(theme: UiTheme): number {
        const section = new HudSection(theme, "A", 96, 96);
        const top = section.content.y;
        section.destroy();
        return top;
    }

    get InnerWidth(): number {
        return this.innerWidth;
    }

    get SectionHeight(): number {
        return this.panel.PanelHeight;
    }

    /** The text at the title's right, flush with the contents' right edge - "" for none. */
    SetNote(text: string): void {
        if (text === this.note.text) {
            return;
        }
        this.note.text = text;
        this.note.x = Math.round(SectionInset + this.innerWidth - this.note.textWidth);
    }

    destroy(options?: {children?: boolean; texture?: boolean; baseTexture?: boolean}): void {
        super.destroy({children: true, ...options});
    }
}
