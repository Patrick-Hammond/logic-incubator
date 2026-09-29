/**
 * The player's carried items - a fixed number of slots, each empty or holding
 * one sprite name. Pure - no pixi - so it runs under the plain node test
 * runner, same as Health.ts.
 */

/** Slots the HUD's inventory grid shows - see `Hud`. */
export const InventorySize = 8;

export type Inventory = {
    slots: Array<string | null>;
};

export function CreateInventory(): Inventory {
    return { slots: new Array(InventorySize).fill(null) };
}

/** Adds to the first empty slot; returns whether there was room. */
export function AddItem(inventory: Inventory, sprite: string): boolean {
    const index = inventory.slots.indexOf(null);
    if (index === -1) {
        return false;
    }
    inventory.slots[index] = sprite;
    return true;
}
