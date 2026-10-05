import { BitmapText, Container, utils } from "pixi.js";
import { TabSkin } from "../skin/Skin";
import UiTheme from "../UiTheme";
import NineSlice from "./NineSlice";
import UiControl from "./UiControl";
import { CreateText } from "./UiText";

/** One tab: a frame (active, inactive, hovered, disabled) with a label. A press selects it: it emits `activate`, which `UiTabs` listens for. */
export class UiTab extends UiControl {
    private readonly frames = new Map<string, NineSlice>();
    private readonly label: BitmapText;
    private readonly size: { width: number; height: number };
    private current: NineSlice | null = null;
    private activeValue = false;

    constructor(private readonly theme: UiTheme, private readonly skin: TabSkin, text: string) {
        super();
        this.label = CreateText(theme, text, { font: skin.font });
        const p = skin.padding;
        this.size = { width: Math.max(skin.minWidth || 0, Math.ceil(this.label.textWidth) + p.left + p.right), height: skin.height };
        this.addChild(this.label);
        this.SetHitSize(this.size.width, this.size.height);
        this.Redraw();
    }

    get TabWidth(): number {
        return this.size.width;
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
            this.frames.set(spec.frame, frame);
            this.addChildAt(frame, 0);
        }
        if (this.current && this.current !== frame) this.current.visible = false;
        frame.visible = true;
        this.current = frame;

        const colours = this.skin.textColour;
        this.label.tint = (key === "disabled" ? colours.disabled : key === "hover" ? colours.hover : this.activeValue ? colours.active : colours.inactive) || colours.inactive;
        const p = this.skin.padding;
        const room = { width: this.size.width - p.left - p.right, height: this.size.height - p.top - p.bottom };
        this.label.position.set(p.left + Math.floor((room.width - this.label.textWidth) / 2), p.top + Math.floor((room.height - this.label.textHeight) / 2));
    }

    destroy(options?: { children?: boolean; texture?: boolean; baseTexture?: boolean }): void {
        this.frames.clear();
        super.destroy(options);
    }
}

/**
 * A row of tabs with one selected. Selecting (a press on a tab, or `Select`, or `Step` for the tab keys) emits `change` with the index. The page each tab stands for is the
 * screen's to show; this is only the strip.
 */
export default class UiTabs extends Container {
    private readonly events = new utils.EventEmitter();
    private readonly tabs: UiTab[] = [];
    private selected = 0;

    constructor(theme: UiTheme, variant: string, labels: string[], selected = 0) {
        super();
        const skin = theme.skin.tabs && theme.skin.tabs[variant];
        if (!skin) {
            throw new Error(`The "${theme.skin.name}" skin has no tabs "${variant}".`);
        }
        let x = 0;
        labels.forEach((text, index) => {
            const tab = new UiTab(theme, skin, text);
            tab.position.set(x, 0);
            x += tab.TabWidth + skin.gap;
            tab.on("activate", () => this.Select(index, true));
            this.tabs.push(tab);
            this.addChild(tab);
        });
        this.selected = Math.max(0, Math.min(labels.length - 1, selected));
        this.tabs.forEach((tab, i) => (tab.Active = i === this.selected));
        this.StripWidth = Math.max(0, x - skin.gap);
        this.StripHeight = skin.height;
    }

    /** The strip's size. */
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

    /** The tab keys: one tab left (-1) or right (1), skipping disabled ones, stopping at the ends. Emits `change`. */
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
