import { describe, expect, it } from "vitest";
import { ArtBounds, ContactBox, CreateProjectile, FigureBox, Overlaps, ProjectileBox, ShotSetup, SpriteBox, StepProjectile } from "./Projectiles";

const TILE = 16;
const ARROW: ShotSetup = { sprite: "weapon_arrow", speed: 6, damage: 1, range: 10 };

describe("StepProjectile", () => {
    it("flies at its speed along its direction, whatever length that's given as", () => {
        const p = CreateProjectile({ x: 8, y: 8 }, { x: 0, y: -5 }, ARROW, "player", TILE);
        expect(StepProjectile(p, 1, () => false, TILE)).toBeNull();
        expect(p.x).toBeCloseTo(8);
        expect(p.y).toBeCloseTo(2);
        expect(p.dead).toBe(false);
    });

    it("remembers where it was before each step, starting where it was fired from", () => {
        const p = CreateProjectile({ x: 8, y: 8 }, { x: 1, y: 0 }, ARROW, "player", TILE, 7);
        expect(p.id).toBe(7);
        expect([p.px, p.py]).toEqual([8, 8]);
        StepProjectile(p, 1, () => false, TILE);
        expect([p.px, p.py]).toEqual([8, 8]);
        StepProjectile(p, 1, () => false, TILE);
        expect(p.px).toBeCloseTo(14);
        expect(p.x).toBeCloseTo(20);
    });

    it("stops at the first blocked cell - and says which - even when fast enough to skip it in one frame", () => {
        const fast = CreateProjectile({ x: 8, y: 8 }, { x: 1, y: 0 }, { ...ARROW, speed: 40 }, "player", TILE);
        const hit = StepProjectile(fast, 1, x => x === 2, TILE);
        expect(fast.dead).toBe(true);
        expect(hit).toEqual({ x: 2, y: 0 });
    });

    it("fizzles out at the end of its range", () => {
        const p = CreateProjectile({ x: 8, y: 8 }, { x: 1, y: 0 }, { ...ARROW, range: 1 }, "player", TILE);
        StepProjectile(p, 1, () => false, TILE);
        expect(p.dead).toBe(false);
        expect(StepProjectile(p, 2, () => false, TILE)).toBeNull();
        expect(p.dead).toBe(true);
    });
});

describe("CreateProjectile", () => {
    it("carries its shot's light, if it has one", () => {
        const light = { brightness: 0.8, tint: 0x7dff70, range: 4 };
        expect(CreateProjectile({ x: 8, y: 8 }, { x: 1, y: 0 }, { ...ARROW, light }, "monster", TILE).light).toBe(light);
        expect(CreateProjectile({ x: 8, y: 8 }, { x: 1, y: 0 }, ARROW, "player", TILE).light).toBeUndefined();
    });
});

describe("hit boxes", () => {
    it("touch only on a real overlap", () => {
        expect(Overlaps({ x: 0, y: 0, width: 10, height: 10 }, { x: 9, y: 9, width: 10, height: 10 })).toBe(true);
        expect(Overlaps({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 0, width: 10, height: 10 })).toBe(false);
    });

    it("give two neighbours standing a tile apart no contact", () => {
        expect(Overlaps(ContactBox({ x: 0, y: 0 }, TILE), ContactBox({ x: TILE, y: 0 }, TILE))).toBe(false);
        expect(Overlaps(ContactBox({ x: 0, y: 0 }, TILE), ContactBox({ x: 8, y: 0 }, TILE))).toBe(true);
    });

    it("let a shot hit a tall monster in the head, above its feet box", () => {
        const feet = { x: 5 * TILE, y: 5 * TILE };
        const head = CreateProjectile({ x: 5 * TILE + 8, y: 5 * TILE - 10 }, { x: 1, y: 0 }, ARROW, "player", TILE);
        expect(Overlaps(ProjectileBox(head), ContactBox(feet, TILE))).toBe(false);
        expect(Overlaps(ProjectileBox(head), SpriteBox(feet, { width: 32, height: 36 }, TILE))).toBe(true);
    });

    it("centre a wide sprite's box over its tile", () => {
        const box = SpriteBox({ x: 100, y: 100 }, { width: 32, height: 36 }, TILE);
        expect(box.x + box.width / 2).toBe(100 + TILE / 2);
        expect(box.y + box.height).toBeLessThanOrEqual(100 + TILE);
    });

});

describe("A figure's box", () => {
    it("is the frame, feet on the bottom of its tile and centred across it, when where its art is isn't known", () => {
        expect(FigureBox({ x: 100, y: 100 }, { width: 16, height: 28 }, TILE)).toEqual({ x: 100, y: 88, width: 16, height: 28 });
        expect(FigureBox({ x: 100, y: 100 }, { width: 32, height: 36 }, TILE)).toEqual({ x: 92, y: 80, width: 32, height: 36 });
        expect(FigureBox({ x: 100, y: 100 }, { width: TILE, height: TILE }, TILE)).toEqual({ x: 100, y: 100, width: TILE, height: TILE });
    });

    it("leaves out what's see-through round the art - a wizard's frame is ten pixels of air over their hat", () => {
        const wizard = { width: 16, height: 28, trim: { x: 1, y: 10, width: 15, height: 18 } };
        expect(FigureBox({ x: 100, y: 100 }, wizard, TILE)).toEqual({ x: 101, y: 98, width: 15, height: 18 });
    });

    it("covers every frame of an animation, the art of each", () => {
        const run = ArtBounds([
            { width: 16, height: 28, trim: { x: 1, y: 10, width: 15, height: 18 } },
            { width: 16, height: 28, trim: { x: 0, y: 11, width: 15, height: 17 } }
        ]);
        expect(run).toEqual({ width: 16, height: 28, trim: { x: 0, y: 10, width: 16, height: 18 } });
    });

    it("counts a frame with no trim whole, and gives no trim when the art fills the frame", () => {
        expect(ArtBounds([{ width: 6, height: 7 }, { width: 6, height: 7, trim: null }])).toEqual({ width: 6, height: 7 });
        expect(ArtBounds([{ width: 16, height: 16, trim: { x: 4, y: 3, width: 8, height: 11 } }, { width: 16, height: 16 }])).toEqual({ width: 16, height: 16 });
        expect(ArtBounds([])).toBeUndefined();
    });
});
