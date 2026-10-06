import { describe, expect, it } from "vitest";
import { CurveProgress, IsOutside, Transform2D } from "./KillZone";

const Identity: Transform2D = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
/** 0,0 to 100,50 */
const Area = { x: 0, y: 0, width: 100, height: 50 };

describe("IsOutside", () => {
    it("is false for a point inside the area, true for one outside it on any side", () => {
        expect(IsOutside(Identity, 50, 25, Area)).toBe(false);
        expect(IsOutside(Identity, -1, 25, Area)).toBe(true);   // left
        expect(IsOutside(Identity, 101, 25, Area)).toBe(true);  // right
        expect(IsOutside(Identity, 50, -1, Area)).toBe(true);   // above
        expect(IsOutside(Identity, 50, 51, Area)).toBe(true);   // below
    });

    it("counts the edges as inside", () => {
        expect(IsOutside(Identity, 0, 0, Area)).toBe(false);
        expect(IsOutside(Identity, 100, 50, Area)).toBe(false);
        expect(IsOutside(Identity, 100.001, 50, Area)).toBe(true);
    });

    it("takes the point to the stage through the container's transform: a moved container", () => {
        const moved: Transform2D = { ...Identity, tx: 200, ty: 100 };

        expect(IsOutside(moved, 0, 0, Area)).toBe(true);          // lands at 200,100: outside
        expect(IsOutside(moved, -150, -75, Area)).toBe(false);    // lands at 50,25: inside
    });

    it("takes the point to the stage through the container's transform: a scaled container", () => {
        const half: Transform2D = { ...Identity, a: 0.5, d: 0.5 };

        expect(IsOutside(half, 150, 40, Area)).toBe(false);       // lands at 75,20
        expect(IsOutside(half, 250, 40, Area)).toBe(true);        // lands at 125,20
    });

    it("takes the point to the stage through the container's transform: a rotated container", () => {
        // a quarter turn: local (x, y) lands at (-y, x) in the stage, then is moved by 50,0
        const quarter: Transform2D = { a: 0, b: 1, c: -1, d: 0, tx: 50, ty: 0 };

        expect(IsOutside(quarter, 10, 20, Area)).toBe(false);     // 50-20=30, 10
        expect(IsOutside(quarter, 10, -80, Area)).toBe(true);     // 50+80=130, 10
        expect(IsOutside(quarter, 100, 0, Area)).toBe(true);      // 50, 100: below
    });

    it("gives the same answer for one area from containers placed and scaled differently - what a shared config needs", () => {
        const big: Transform2D = { ...Identity, a: 2, d: 2, tx: 10, ty: 10 };
        const small: Transform2D = { ...Identity, a: 0.5, d: 0.5, tx: 40, ty: 20 };

        // The stage point 60,30 in each container's own space
        expect(IsOutside(big, 25, 10, Area)).toBe(false);
        expect(IsOutside(small, 40, 20, Area)).toBe(false);
        // and 160,30 - off to the right of the area
        expect(IsOutside(big, 75, 10, Area)).toBe(true);
        expect(IsOutside(small, 240, 20, Area)).toBe(true);
    });

    it("works with an area that has a negative origin - bigger than the screen on every side", () => {
        const bigger = { x: -100, y: -100, width: 1480, height: 920 };

        expect(IsOutside(Identity, -50, -50, bigger)).toBe(false);   // off the screen but still inside the area: drifting in
        expect(IsOutside(Identity, 1300, 700, bigger)).toBe(false);
        expect(IsOutside(Identity, -101, 300, bigger)).toBe(true);
        expect(IsOutside(Identity, 1381, 300, bigger)).toBe(true);
    });
});

describe("CurveProgress", () => {
    it("is the age over the lifetime while the particle is young", () => {
        expect(CurveProgress(0, 1 / 2)).toBe(0);
        expect(CurveProgress(1, 1 / 2)).toBe(0.5);
        expect(CurveProgress(2, 1 / 2)).toBe(1);
    });

    it("holds at 1 once the particle is older than its lifetime, so the end values hold", () => {
        expect(CurveProgress(2.5, 1 / 2)).toBe(1);
        expect(CurveProgress(1000, 1 / 2)).toBe(1);
    });
});
