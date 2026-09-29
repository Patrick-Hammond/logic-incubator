import { describe, expect, it } from "vitest";
import { AddItem, CreateInventory, InventorySize } from "./Inventory";

describe("Inventory", () => {
    it("starts with every slot empty", () => {
        const inventory = CreateInventory();
        expect(inventory.slots).toHaveLength(InventorySize);
        expect(inventory.slots.every(slot => slot === null)).toBe(true);
    });

    it("adds to the first empty slot", () => {
        const inventory = CreateInventory();
        AddItem(inventory, "flask_blue");
        AddItem(inventory, "flask_red");
        expect(inventory.slots[0]).toBe("flask_blue");
        expect(inventory.slots[1]).toBe("flask_red");
    });

    it("refuses once every slot is full", () => {
        const inventory = CreateInventory();
        for (let i = 0; i < InventorySize; i++) {
            expect(AddItem(inventory, "flask_blue")).toBe(true);
        }
        expect(AddItem(inventory, "flask_red")).toBe(false);
        expect(inventory.slots.indexOf("flask_red")).toBe(-1);
    });
});
