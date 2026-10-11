import { BitmapText, Container, Sprite, utils } from "pixi.js";
import { TabSkin } from "../skin/Skin";
import UiTheme from "../UiTheme";
import NineSlice from "./NineSlice";
import UiControl from "./UiControl";
import { CreateText } from "./UiText";

/** What a tab shows: a label, or an icon (a frame of the skin's bundle). */
export type TabContent = string | { icon: string };

export type UiTabsOptions = {
    /** The tab selected at first; the first by default. */
    selected?: number;
    /**
     * Mirrors the tabs' frames left to right (not what is in them): a skin's side tabs hang off a panel's right edge, and mirrored, its left one. The strip is placed with its
     * right edge against the panel then.
     */
    mirror?: boolean;
};

/** One tab: a frame (active, inactive, hovered, disabled) with a label or an icon. A press selects it: it emits `activate`, which `UiTabs` listens for. */
export class UiTab extends UiControl {
    private readonly frames = new Map<string, NineSlice>();
    private readonly label: BitmapText | null;
    private readonly icon: Sprite | null;
    private readonly size: { width: number; height: number };
    private current: NineSlice | null = null;
    private activeValue = false;

    constructor(private readonly theme: UiTheme, private readonly skin: TabSkin, content: TabContent, private readonly mirror = false) {
        super();
        this.label = typeof content === "string" ? CreateText(theme, content, { font: skin.font }) : null;
        this.icon = typeof content === "string" ? null : new Sprite(theme.Texture(content.icon));
        const p = skin.padding;
        const inner = this.label ? Math.ceil(this.label.textWidth) : (this.icon as Sprite).width;
        this.size = { width: skin.width !== undefined ? skin.width : Math.max(skin.minWidth || 0, inner + p.left + p.right), height: skin.height };
        this.addChild((this.label || this.icon) as Container);
        this.SetHitSize(this.size.width, this.size.height);
        this.Redraw();
    }

    get TabWidth(): number {
        return this.size.width;
    }

    get TabHeight(): number {
        return this.size.height;
    }

    /** Whether this is the selected tab. */
    get Active(): boolean {
        return this.activeValue;
    }

    set Active(active: boolean) {
        if (this.activeValue !== active) {
            this.activeValue = active;
            this.Refresh();
        }
    }

    protected Redraw(): void {
        if (!this.size) {
            return;
        }
        const s = this.State;
        const states = this.skin.states;
        // The selected tab looks selected whatever else is going on - unless it is disabled; otherwise hover and disabled have their own frames, and anything else is inactive.
        const key = s === "disabled" ? "disabled" : this.activeValue ? "active" : s === "hover" ? "hover" : "inactive";
        const spec = states[key] || (this.activeValue ? states.active : states.inactive);
        let frame = this.frames.get(spec.frame);
        if (!frame) {
            frame = new NineSlice(this.theme.Texture(spec.frame), spec, this.size.width, this.size.height);
            if (this.mirror) {
                frame.scale.x = -1;
                frame.x = this.size.width;
            }
            this.frames.set(spec.frame, frame);
            this.addChildAt(frame, 0);
        }
        if (this.current && this.current !== frame) this.current.visible = false;
        frame.visible = true;
        this.current = frame;

        const colours = this.skin.textColour;
        const colour = (key === "disabled" ? colours.disabled : key === "hover" ? colours.hover : this.activeValue ? colours.active : colours.inactive) || colours.inactive;
        // Mirrored, the frame's left padding is on the right.
        const p = this.mirror ? { ...this.skin.padding, left: this.skin.padding.right, right: this.skin.padding.left } : this.skin.padding;
        const room = { width: this.size.width - p.left - p.right, height: this.size.height - p.top - p.bottom };
        const content = this.label
            ? { display: this.label as Container, width: this.label.textWidth, height: this.label.textHeight }
            : { display: this.icon as Container, width: (this.icon as Sprite).width, height: (this.icon as Sprite).height };
        if (this.label) this.label.tint = colour;
        if (this.icon) this.icon.tint = colour;
        content.display.position.set(p.left + Math.floor((room.width - content.width) / 2), p.top + Math.floor((room.height - content.height) / 2));
    }

    destroy(options?: { children?: boolean; texture?: boolean; baseTexture?: boolean }): void {
        this.frames.clear();
        super.destroy(options);
    }
}

/**
 * A row of tabs with one selected - or, for a skin's side tabs (`vertical`), a column of them down a panel's edge. Selecting (a press on a tab, or `Select`, or `Step` for the tab
 * keys) emits `change` with the index. The page each tab stands for is the screen's to show; this is only the strip.
 */
export default class UiTabs extends Container {
    private readonly events = new utils.EventEmitter();
    private readonly tabs: UiTab[] = [];
    private selected = 0;

    /** `options` may be just the index of the tab selected at first. */
    constructor(theme: UiTheme, variant: string, contents: TabContent[], options: UiTabsOptions | number = {}) {
        super();
        const skin = theme.skin.tabs && theme.skin.tabs[variant];
        if (!skin) {
            throw new Error(`The "${theme.skin.name}" skin has no tabs "${variant}".`);
        }
        const settings = typeof options === "number" ? { selected: options } : options;
        let along = 0;
        let across = 0;
        contents.forEach((content, index) => {
            const tab = new UiTab(theme, skin, content, !!settings.mirror);
            if (skin.vertical) {
                tab.position.set(0, along);
                along += tab.TabHeight + skin.gap;
                across = Math.max(across, tab.TabWidth);
            } else {
                tab.position.set(along, 0);
                along += tab.TabWidth + skin.gap;
                across = Math.max(across, tab.TabHeight);
            }
            tab.on("activate", () => this.Select(index, true));
            this.tabs.push(tab);
            this.addChild(tab);
        });
        if (skin.vertical && settings.mirror) {
            // Mirrored side tabs are as wide as the widest, and sit against a panel's left edge with their right ends.
            this.tabs.forEach(tab => (tab.x = across - tab.TabWidth));
        }
        this.selected = Math.max(0, Math.min(contents.length - 1, settings.selected || 0));
        this.tabs.forEach((tab, i) => (tab.Active = i === this.selected));
        const length = Math.max(0, along - skin.gap);
        this.StripWidth = skin.vertical ? across : length;
        this.StripHeight = skin.vertical ? length : across;
    }

    /** The strip's size (not counting a selected tab that stands out further). */
    readonly StripWidth: number;
    readonly StripHeight: number;

    get Tabs(): ReadonlyArray<UiTab> {
        return this.tabs;
    }

    get Selected(): number {
        return this.selected;
    }

    /** Selects a tab; `change` is emitted when the selection really changes (by the player, or by this call when `notify` is set). */
    Select(index: number, notify = false): void {
        if (index < 0 || index >= this.tabs.length || index === this.selected || !this.tabs[index].Enabled) {
            return;
        }
        this.selected = index;
        this.tabs.forEach((tab, i) => (tab.Active = i === index));
        if (notify) this.events.emit("change", index);
    }

    /** The tab keys: one tab back (-1) or on (1), skipping disabled ones, stopping at the ends. Emits `change`. */
    Step(step: -1 | 1): void {
        for (let i = this.selected + step; i >= 0 && i < this.tabs.length; i += step) {
            if (this.tabs[i].Enabled) {
                this.Select(i, true);
                return;
            }
        }
    }

    /** Listens for `change`. */
    OnChange(listener: (index: number) => void): () => void {
        this.events.on("change", listener);
        return () => this.events.off("change", listener);
    }

    destroy(options?: { children?: boolean; texture?: boolean; baseTexture?: boolean }): void {
        this.events.removeAllListeners();
        super.destroy({ children: true, ...options });
    }
}
