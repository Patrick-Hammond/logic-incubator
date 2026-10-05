import { describe, expect, it } from "vitest";
import { FillWidth } from "./BarMath";

describe("FillWidth", () => {
    it("is the fraction of the room, in whole pixels", () => {
        expect(FillWidth(0.5, 80)).toBe(40);
        expect(FillWidth(1, 80)).toBe(80);
        expect(FillWidth(0.333, 80)).toBe(27);
    });

    it("shows nothing only for exactly 0, and a sliver for any fraction above it", () => {
        expect(FillWidth(0, 80)).toBe(0);
        expect(FillWidth(0.001, 80)).toBe(1);
    });

    it("clamps to the room and treats nonsense as empty", () => {
        expect(FillWidth(2, 80)).toBe(80);
        expect(FillWidth(-1, 80)).toBe(0);
        expect(FillWidth(NaN, 80)).toBe(0);
        expect(FillWidth(0.5, 0)).toBe(0);
        expect(FillWidth(0.5, -4)).toBe(0);
    });
});
