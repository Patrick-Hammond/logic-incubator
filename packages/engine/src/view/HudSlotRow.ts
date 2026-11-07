import {Container, Graphics} from "pixi.js";
import UiTheme from "@logic-incubator/ui/UiTheme";
import UiItemSlot, {SlotItem} from "@logic-incubator/ui/widgets/UiItemSlot";

/** The skin's slot the HUD's rows are drawn with. */
const SlotVariant = "default";
/** How far in from a slot's edge its recharge shade starts - inside its frame. */
const ShadeInset = 3;
const ShadeAlpha = 0.7;

/**
 * A row of `count` item slots, `size` square, spread evenly across `width` - the HUD's spells, weapons and inventory.
 * One can be picked out (`Select` - the equipped weapon, the spell to hand) and any can be shaded from the top, by how
 * much of a recharge is left (`SetShade`). Only shows things - nothing in it takes the pointer.
 */
export default class HudSlotRow extends Container {
    private readonly slots: UiItemSlot[] = [];
    private readonly shades: Graphics[] = [];
    private readonly shown: string[] = [];
    private readonly shadeFill: number;

    constructor(theme: UiTheme, count: number, size: number, width: number) {
        super();
        this.shadeFill = theme.Colour("ink");
        const gap = count > 1 ? (width - count * size) / (count - 1) : 0;
        for (let i = 0; i < count; i++) {
            const slot = new UiItemSlot(theme, SlotVariant, size);
            slot.position.set(Math.round(i * (size + gap)), 0);
            const shade = new Graphics();
            shade.position.copyFrom(slot.position);
            this.slots.push(slot);
            this.shades.push(shade);
            this.shown.push("");
            this.addChild(slot, shade);
        }
        this.interactiveChildren = false;
    }

    get SlotSize(): number {
        return this.slots.length ? this.slots[0].SlotSize : 0;
    }

    /**
     * Fills the slots from the left with these items - the rest empty - unless they already show them: `keys` names
     * each item (its sprite and count, say), so nothing is redrawn while they stay the same.
     */
    SetItems(items: ReadonlyArray<SlotItem | null>, keys: ReadonlyArray<string>): void {
        this.slots.forEach((slot, i) => {
            const key = i < items.length && items[i] ? keys[i] : "";
            if (key !== this.shown[i]) {
                this.shown[i] = key;
                slot.SetItem(key ? items[i] : null);
            }
        });
    }

    /** Picks out the slot at `index` with the skin's selected frame - none for -1. */
    Select(index: number): void {
        this.slots.forEach((slot, i) => (slot.Selected = i === index));
    }

    /** Shades the top `fraction` (0 to 1) of the slot at `index` - what's left of a recharge, shrinking as it comes back. */
    SetShade(index: number, fraction: number): void {
        const shade = this.shades[index];
        if (!shade) {
            return;
        }
        const box = this.SlotSize - ShadeInset * 2;
        const height = Math.ceil(box * Math.max(0, Math.min(1, fraction)));
        shade.clear();
        if (height > 0) {
            shade.beginFill(this.shadeFill, ShadeAlpha).drawRect(ShadeInset, ShadeInset, box, height).endFill();
        }
    }

    destroy(options?: {children?: boolean; texture?: boolean; baseTexture?: boolean}): void {
        super.destroy({children: true, ...options});
    }
}
