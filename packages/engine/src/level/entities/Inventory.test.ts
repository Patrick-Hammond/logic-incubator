import { describe, expect, it } from "vitest";
import { AddItem, CreateInventory, InventorySize, SlotsUsed, StackSize } from "./Inventory";

describe("Inventory", () => {
    it("starts with every slot empty", () => {
        const inventory = CreateInventory();
        expect(inventory.slots).toHaveLength(InventorySize);
        expect(inventory.slots.every(slot => slot === null)).toBe(true);
        expect(SlotsUsed(inventory)).toBe(0);
    });

    it("adds a new item to the first empty slot", () => {
        const inventory = CreateInventory();
        AddItem(inventory, "flask_blue");
        AddItem(inventory, "flask_red");
        expect(inventory.slots[0]).toEqual({ sprite: "flask_blue", count: 1 });
        expect(inventory.slots[1]).toEqual({ sprite: "flask_red", count: 1 });
        expect(SlotsUsed(inventory)).toBe(2);
    });

    it("stacks another of an item it has", () => {
        const inventory = CreateInventory();
        AddItem(inventory, "flask_red");
        AddItem(inventory, "flask_blue");
        expect(AddItem(inventory, "flask_red")).toBe(true);
        expect(inventory.slots[0]).toEqual({ sprite: "flask_red", count: 2 });
        expect(SlotsUsed(inventory)).toBe(2);
    });

    it("starts a second stack once one is full", () => {
        const inventory = CreateInventory();
        for (let i = 0; i <= StackSize; i++) {
            AddItem(inventory, "flask_red");
        }
        expect(inventory.slots[0]).toEqual({ sprite: "flask_red", count: StackSize });
        expect(inventory.slots[1]).toEqual({ sprite: "flask_red", count: 1 });
    });

    it("refuses a new item once every slot is taken, but still stacks", () => {
        const inventory = CreateInventory();
        for (let i = 0; i < InventorySize; i++) {
            expect(AddItem(inventory, "item_" + i)).toBe(true);
        }
        expect(AddItem(inventory, "flask_red")).toBe(false);
        expect(inventory.slots.some(slot => slot !== null && slot.sprite === "flask_red")).toBe(false);
        expect(AddItem(inventory, "item_0")).toBe(true);
        expect(inventory.slots[0]).toEqual({ sprite: "item_0", count: 2 });
    });
});
