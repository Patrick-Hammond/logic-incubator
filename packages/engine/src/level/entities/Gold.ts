/**
 * The player's gold count. Pure - no pixi - so it runs under the plain node
 * test runner, same as Health.ts.
 */

export type Gold = {
    amount: number;
};

export function CreateGold(): Gold {
    return { amount: 0 };
}

/** Adds (or, with a negative amount, spends) gold - never below 0. */
export function AddGold(gold: Gold, amount: number): void {
    gold.amount = Math.max(0, gold.amount + amount);
}
