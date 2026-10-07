import { Container } from "pixi.js";
import UiTheme from "../UiTheme";
import UiItemSlot, { SlotItem } from "./UiItemSlot";

/**
 * A grid of item slots, `columns` by `rows`, with one selected. Pressing a slot (or accept on it) selects it and emits `select` with its index, and the slot's own `activate` still
 * fires for whoever wants it. `SetItems` fills the slots from the front (the rest empty). Register `Slots` with a `UiSystem` for the arrows and pad to move between them.
 */
export default class UiInventoryGrid extends Container {
    private readonly slots: UiItemSlot[] = [];
    private selected = -1;
    readonly GridWidth: number;
    readonly GridHeight: number;

    constructor(theme: UiTheme, variant: string, readonly Columns: number, readonly Rows: number, gap?: number) {
        super();
        const between = gap === undefined ? theme.Metric("slotGap", 4) : gap;
        for (let i = 0; i < Columns * Rows; i++) {
            const slot = new UiItemSlot(theme, variant);
            const size = slot.SlotSize;
            slot.position.set((i % Columns) * (size + between), Math.floor(i / Columns) * (size + between));
            slot.on("activate", () => this.Choose(i, true));
            this.slots.push(slot);
            this.addChild(slot);
        }
        const size = this.slots.length ? this.slots[0].SlotSize : 0;
        this.GridWidth = Columns * size + (Columns - 1) * between;
        this.GridHeight = Rows * size + (Rows - 1) * between;
    }

    get Slots(): ReadonlyArray<UiItemSlot> {
        return this.slots;
    }

    get Selected(): number {
        return this.selected;
    }

    /** Chooses a slot (or none, for -1) without emitting `select`. */
    Select(index: number): void {
        this.Choose(index, false);
    }

    /** Fills the slots with these items from the first; the rest are emptied. */
    SetItems(items: Array<SlotItem | null>): void {
        this.slots.forEach((slot, i) => slot.SetItem(items[i] || null));
    }

    private Choose(index: number, notify: boolean): void {
        this.selected = index;
        this.slots.forEach((slot, i) => (slot.Selected = i === index));
        if (notify) this.emit("select", index);
    }

    /** Destroys what is inside too, so the controls in it let go of their focus registrations. */
    destroy(options?: { children?: boolean; texture?: boolean; baseTexture?: boolean }): void {
        super.destroy({ children: true, ...options });
    }
}
