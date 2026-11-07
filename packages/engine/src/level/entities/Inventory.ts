/**
 * The player's carried items - a fixed number of slots, each empty or holding a
 * stack of one item (a sprite name) - picking up another of an item adds to its
 * stack. Pure - no pixi - so it runs under the plain node test runner, same as
 * Health.ts.
 */

/** Slots a hero has - the HUD's inventory row shows them all (see `Hud`). */
export const InventorySize = 5;
/** The most of one item a slot holds; one more starts a second stack. */
export const StackSize = 99;

/** One slot's worth: an item, by its sprite name, and how many. */
export type ItemStack = { sprite: string; count: number };

export type Inventory = {
    slots: Array<ItemStack | null>;
};

export function CreateInventory(): Inventory {
    return { slots: new Array(InventorySize).fill(null) };
}

/** Adds one to the item's stack if it has room, else to the first empty slot; returns whether there was room. */
export function AddItem(inventory: Inventory, sprite: string): boolean {
    const stack = inventory.slots.filter(slot => slot !== null && slot.sprite === sprite && slot.count < StackSize)[0];
    if (stack) {
        stack.count++;
        return true;
    }
    const index = inventory.slots.indexOf(null);
    if (index === -1) {
        return false;
    }
    inventory.slots[index] = { sprite, count: 1 };
    return true;
}

/** Slots with something in. */
export function SlotsUsed(inventory: Inventory): number {
    return inventory.slots.filter(slot => slot !== null).length;
}
