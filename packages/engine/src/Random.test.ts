import { describe, expect, it } from "vitest";
import { NewSeed, SeededRandom } from "./Random";

function Take(random: () => number, count: number): number[] {
    const numbers: number[] = [];
    for (let i = 0; i < count; i++) {
        numbers.push(random());
    }
    return numbers;
}

describe("SeededRandom", () => {
    it("gives the same numbers for the same seed", () => {
        expect(Take(SeededRandom(1234), 20)).toEqual(Take(SeededRandom(1234), 20));
    });

    it("gives different numbers for another seed", () => {
        expect(Take(SeededRandom(1234), 20)).not.toEqual(Take(SeededRandom(1235), 20));
    });

    it("stays in [0, 1) and spreads over it", () => {
        const numbers = Take(SeededRandom(NewSeed()), 10000);
        numbers.forEach(n => {
            expect(n).toBeGreaterThanOrEqual(0);
            expect(n).toBeLessThan(1);
        });
        const mean = numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
        expect(mean).toBeGreaterThan(0.45);
        expect(mean).toBeLessThan(0.55);
    });
});

describe("NewSeed", () => {
    it("is a whole number that fits in 32 bits", () => {
        const seed = NewSeed();
        expect(Number.isInteger(seed)).toBe(true);
        expect(seed).toBeGreaterThanOrEqual(0);
        expect(seed).toBeLessThan(4294967296);
    });
});
