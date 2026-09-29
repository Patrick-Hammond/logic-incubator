import { describe, expect, it } from "vitest";
import { AddGold, CreateGold } from "./Gold";

describe("Gold", () => {
    it("starts at 0", () => {
        expect(CreateGold()).toEqual({ amount: 0 });
    });

    it("adds", () => {
        const gold = CreateGold();
        AddGold(gold, 10);
        AddGold(gold, 5);
        expect(gold.amount).toBe(15);
    });

    it("spends (a negative amount), never below 0", () => {
        const gold = CreateGold();
        AddGold(gold, 10);
        AddGold(gold, -4);
        expect(gold.amount).toBe(6);
        AddGold(gold, -100);
        expect(gold.amount).toBe(0);
    });
});
