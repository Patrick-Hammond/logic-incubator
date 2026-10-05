import { BitmapText, Sprite, Texture } from "pixi.js";
import { ButtonState, SlotSkin } from "../skin/Skin";
import UiTheme from "../UiTheme";
import { PickState } from "./ButtonLook";
import NineSlice from "./NineSlice";
import UiControl from "./UiControl";
import { CreateText } from "./UiText";

export type SlotItem = {
    /** The item's picture (from the game's art, not the kit's bundle). */
    texture: Texture;
    /** How many; shown in the corner when more than one. */
    count?: number;
};

/**
 * One inventory slot: a frame (empty, hovered, selected, disabled) holding an item's picture and, for a stack, its count in the corner. A press (or accept) emits `activate`;
 * `Selected` is whether the slot is the chosen one (drawn with the selected frame - a hover over a selected slot keeps it).
 */
export default class UiItemSlot extends UiControl {
    private readonly skin: SlotSkin;
    private readonly frames = new Map<string, NineSlice>();
    private readonly icon = new Sprite();
    private readonly badge: BitmapText;
    private current: NineSlice | null = null;
    private item: SlotItem | null = null;
    private selected = false;

    constructor(private readonly theme: UiTheme, variant: string) {
        super();
        const skin = theme.skin.slots && theme.skin.slots[variant];
        if (!skin) {
            throw new Error(`The "${theme.skin.name}" skin has no slot "${variant}".`);
        }
        this.skin = skin;
        this.badge = CreateText(theme, "", { font: skin.countFont, colour: skin.countColour });
        this.addChild(this.icon, this.badge);
        this.SetHitSize(skin.size, skin.size);
        this.Redraw();
    }

    /** The slot's width and height. */
    get SlotSize(): number {
        return this.skin.size;
    }

    get Item(): SlotItem | null {
        return this.item;
    }

    /** Puts an item in the slot, or empties it (null). */
    SetItem(item: SlotItem | null): void {
        this.item = item;
        this.Refresh();
    }

    get Selected(): boolean {
        return this.selected;
    }

    set Selected(selected: boolean) {
        if (this.selected !== selected) {
            this.selected = selected;
            this.Refresh();
        }
    }

    protected Redraw(): void {
        if (!this.badge) {
            return;
        }
        const raw = this.State;
        // Selected beats hover and focus (a hover over the selected slot keeps it looking selected); disabled beats everything.
        const state: ButtonState | "selected" = raw === "disabled" ? "disabled" : this.selected ? "selected" : raw;
        const spec = state === "selected" ? this.skin.states.selected || this.skin.states.hover || this.skin.states.normal : PickState(this.skin.states as never, raw === "pressed" ? "hover" : (state as ButtonState)) as typeof this.skin.states.normal;
        let frame = this.frames.get(spec.frame);
        if (!frame) {
            frame = new NineSlice(this.theme.Texture(spec.frame), spec, this.skin.size, this.skin.size);
            this.frames.set(spec.frame, frame);
            this.addChildAt(frame, 0);
        }
        if (this.current && this.current !== frame) this.current.visible = false;
        frame.visible = true;
        this.current = frame;

        const box = this.skin.size - this.skin.iconInset * 2;
        if (this.item) {
            this.icon.texture = this.item.texture;
            this.icon.visible = true;
            // Whole-number reduction only, so the item stays crisp; most are the size of the box already.
            const fit = Math.max(this.icon.texture.width, this.icon.texture.height) > box ? 1 / Math.ceil(Math.max(this.icon.texture.width, this.icon.texture.height) / box) : 1;
            this.icon.scale.set(fit);
            this.icon.position.set(Math.floor((this.skin.size - this.icon.width) / 2), Math.floor((this.skin.size - this.icon.height) / 2));
            this.icon.alpha = raw === "disabled" ? 0.5 : 1;
        } else {
            this.icon.visible = false;
        }
        const count = this.item && this.item.count !== undefined && this.item.count > 1 ? String(this.item.count) : "";
        this.badge.text = count;
        this.badge.visible = !!count;
        this.badge.position.set(this.skin.size - Math.ceil(this.badge.textWidth) - 2, this.skin.size - Math.ceil(this.badge.textHeight) - 1);
    }

    destroy(options?: { children?: boolean; texture?: boolean; baseTexture?: boolean }): void {
        this.frames.clear();
        super.destroy(options);
    }
}
