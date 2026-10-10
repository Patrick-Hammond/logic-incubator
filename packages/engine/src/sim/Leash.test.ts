import { describe, expect, it } from "vitest";
import { MoveCollider, ResolveMove } from "../view/helpers/PlayerMovement";
import { LeashBoxFor, Leashed } from "./Leash";

/** Open floor everywhere - nothing stops them. */
const OPEN: MoveCollider = {
    TestX: () => null,
    TestY: () => null,
    GapAlignX: () => null,
    GapAlignY: () => null,
    IsHeightBlocked: () => false
};

describe("Leash", () => {
    it("lets a hero go no further than the span from anyone else", () => {
        const box = LeashBoxFor([{ x: 100, y: 50 }, { x: 140, y: 60 }], { width: 200, height: 100 });
        expect(box).toEqual({ minX: -60, maxX: 300, minY: -40, maxY: 150 });
        expect(LeashBoxFor([], { width: 200, height: 100 })).toBeNull();
    });

    it("stops a step at the edge, and slides along it", () => {
        const collider = Leashed(OPEN, { minX: 0, maxX: 100, minY: 0, maxY: 100 });
        const position = { x: 98, y: 50 };
        const velocity = { x: 5, y: 5 };
        ResolveMove(position, velocity, 1, collider, 1);
        expect(position.x).toBe(100);
        expect(position.y).toBeGreaterThan(50);
    });

    it("never pulls back one already past the edge, and lets them come back in", () => {
        const collider = Leashed(OPEN, { minX: 0, maxX: 100, minY: 0, maxY: 100 });
        expect(collider.TestX({ x: 120, y: 50 }, 3)).toBe(120);
        expect(collider.TestX({ x: 120, y: 50 }, -3)).toBeNull();
    });

    it("stops at whichever comes first, a wall or the edge, and only lines up with a gap at a wall", () => {
        const wall: MoveCollider = { ...OPEN, TestX: (from, dir) => (dir > 0 ? 90 : null), GapAlignY: () => 7 };
        const nearWall = Leashed(wall, { minX: 0, maxX: 95, minY: 0, maxY: 100 });
        expect(nearWall.TestX({ x: 88, y: 50 }, 10)).toBe(90);
        expect(nearWall.GapAlignY({ x: 88, y: 50 }, 10)).toBe(7);
        const nearEdge = Leashed(wall, { minX: 0, maxX: 89, minY: 0, maxY: 100 });
        expect(nearEdge.TestX({ x: 88, y: 50 }, 10)).toBe(89);
        expect(nearEdge.GapAlignY({ x: 88, y: 50 }, 10)).toBeNull();
    });
});
