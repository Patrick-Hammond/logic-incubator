import { describe, expect, it } from "vitest";
import { BoxOnCell, CanMove, Pushable, PushTarget, SlideEase } from "./Pushables";

const TILE = 16;

describe("PushTarget", () => {
    /** A crate on 5,2 and on 2,4. */
    const crates = (x: number, y: number) => (x === 5 && y === 2) || (x === 2 && y === 4);

    it("finds what a hero is walking into, flush against it, and the way that pushes it", () => {
        expect(PushTarget({ x: 4 * TILE, y: 2 * TILE }, { x: 1, y: 0 }, TILE, crates)).toEqual({ x: 5, y: 2, dx: 1, dy: 0 });
        expect(PushTarget({ x: 6 * TILE, y: 2 * TILE }, { x: -1, y: 0 }, TILE, crates)).toEqual({ x: 5, y: 2, dx: -1, dy: 0 });
        expect(PushTarget({ x: 5 * TILE, y: 3 * TILE }, { x: 0, y: -1 }, TILE, crates)).toEqual({ x: 5, y: 2, dx: 0, dy: -1 });
        expect(PushTarget({ x: 2 * TILE, y: 3 * TILE }, { x: 0, y: 1 }, TILE, crates)).toEqual({ x: 2, y: 4, dx: 0, dy: 1 });
    });

    it("finds nothing a few pixels short of it, walking away from it, or barely pushing the stick", () => {
        expect(PushTarget({ x: 4 * TILE - 3, y: 2 * TILE }, { x: 1, y: 0 }, TILE, crates)).toBeNull();
        expect(PushTarget({ x: 4 * TILE, y: 2 * TILE }, { x: -1, y: 0 }, TILE, crates)).toBeNull();
        expect(PushTarget({ x: 4 * TILE, y: 2 * TILE }, { x: 0.2, y: 0 }, TILE, crates)).toBeNull();
    });

    it("counts only the cell straight ahead of a hero's middle - they must be more than half in line with it", () => {
        expect(PushTarget({ x: 4 * TILE, y: 2.4 * TILE }, { x: 1, y: 0 }, TILE, crates)).toEqual({ x: 5, y: 2, dx: 1, dy: 0 });
        expect(PushTarget({ x: 4 * TILE, y: 2.6 * TILE }, { x: 1, y: 0 }, TILE, crates)).toBeNull();
    });

    it("pushes along one axis: the one walked the more along first, then the other", () => {
        expect(PushTarget({ x: 4 * TILE, y: 2 * TILE }, { x: 1, y: 0.5 }, TILE, crates)).toEqual({ x: 5, y: 2, dx: 1, dy: 0 });
        expect(PushTarget({ x: 4 * TILE, y: 2 * TILE }, { x: 0.5, y: 1 }, TILE, crates)).toEqual({ x: 5, y: 2, dx: 1, dy: 0 });
        expect(PushTarget({ x: 5 * TILE, y: 3 * TILE }, { x: 0.5, y: -1 }, TILE, crates)).toEqual({ x: 5, y: 2, dx: 0, dy: -1 });
    });
});

describe("CanMove", () => {
    const tall: Pushable = { x: 3, y: 3, cells: [{ x: 3, y: 2 }, { x: 3, y: 3 }], sprite: "statue" };
    const flat = () => false;

    it("needs only the cells it moves onto to be open - not the ones it's leaving, or already on", () => {
        const open = (x: number, y: number) => !(x === 3 && y === 1);
        expect(CanMove(tall, 0, 1, open, flat)).toBe(true);
        expect(CanMove(tall, 0, -1, open, flat)).toBe(false);
        expect(CanMove(tall, 1, 0, (x, y) => x === 4 && (y === 2 || y === 3), flat)).toBe(true);
        expect(CanMove(tall, 1, 0, (x, y) => x === 4 && y === 3, flat)).toBe(false);
    });

    it("won't take any of its cells up or down a step too high", () => {
        const open = () => true;
        expect(CanMove(tall, 1, 0, open, (from, to) => from.y === 2 && to.x === 4)).toBe(false);
        expect(CanMove(tall, 1, 0, open, flat)).toBe(true);
    });
});

describe("BoxOnCell", () => {
    it("covers the cells a one-tile box overlaps, by a pixel or more", () => {
        expect(BoxOnCell({ x: 32, y: 16 }, 2, 1, TILE)).toBe(true);
        expect(BoxOnCell({ x: 32, y: 16 }, 3, 1, TILE)).toBe(false);
        expect(BoxOnCell({ x: 33, y: 16 }, 3, 1, TILE)).toBe(true);
        expect(BoxOnCell({ x: 33, y: 16 }, 1, 1, TILE)).toBe(false);
        expect(BoxOnCell({ x: 32, y: 8 }, 2, 0, TILE)).toBe(true);
    });
});

describe("SlideEase", () => {
    it("goes from 0 to 1, fastest at first, and stays there", () => {
        expect(SlideEase(0)).toBe(0);
        expect(SlideEase(0.5)).toBeGreaterThan(0.5);
        expect(SlideEase(1)).toBe(1);
        expect(SlideEase(2)).toBe(1);
        expect(SlideEase(-1)).toBe(0);
    });
});
