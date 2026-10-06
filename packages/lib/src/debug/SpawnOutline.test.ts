import { describe, expect, it } from "vitest";
import { BuildSpawnOutline, CircleSides, MaxRays, RayLength, Rotate } from "./SpawnOutline";

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe("Rotate", () => {
    it("turns a point by degrees, the way the emitter's rotatePoint does: x' = x cos - y sin, y' = x sin + y cos", () => {
        const quarter = Rotate({ x: 1, y: 0 }, 90);
        close(quarter.x, 0);
        close(quarter.y, 1);

        const half = Rotate({ x: 3, y: 2 }, 180);
        close(half.x, -3);
        close(half.y, -2);

        const eighth = Rotate({ x: 1, y: 0 }, 45);
        close(eighth.x, Math.SQRT1_2);
        close(eighth.y, Math.SQRT1_2);
    });

    it("gives a copy, unchanged, for no turn", () => {
        const point = { x: 5, y: 6 };

        const same = Rotate(point, 0);

        expect(same).toEqual(point);
        expect(same).not.toBe(point);
    });
});

describe("the origin", () => {
    it("is the owner's position plus the config's pos", () => {
        expect(BuildSpawnOutline({ pos: { x: 10, y: 20 } }, 100, 200, 0).origin).toEqual({ x: 110, y: 220 });
    });

    it("is the owner's position alone when the config has no pos, or an odd one", () => {
        expect(BuildSpawnOutline({}, 7, 8, 0).origin).toEqual({ x: 7, y: 8 });
        expect(BuildSpawnOutline({ pos: { x: "far", y: null } }, 7, 8, 0).origin).toEqual({ x: 7, y: 8 });
        expect(BuildSpawnOutline({ pos: { x: "5", y: 1 } }, 0, 0, 0).origin).toEqual({ x: 5, y: 1 });
    });

    it("has the config's pos turned about the owner with the emitter, as Emitter.rotate turns spawnPos", () => {
        const { origin } = BuildSpawnOutline({ pos: { x: 10, y: 20 } }, 100, 200, 90);

        // (10,20) turned a quarter becomes (-20,10)
        close(origin.x, 80);
        close(origin.y, 210);
    });

    it("is the owner's position, however the emitter is turned, when pos is (0, 0)", () => {
        expect(BuildSpawnOutline({ pos: { x: 0, y: 0 } }, 100, 200, 137).origin).toEqual({ x: 100, y: 200 });
    });
});

describe("a point", () => {
    it("has no shape, only its origin", () => {
        expect(BuildSpawnOutline({ spawnType: "point" }, 0, 0, 0).shapes).toEqual([]);
        expect(BuildSpawnOutline({}, 0, 0, 0).shapes).toEqual([]);
    });

    it("is what an unknown spawn type is taken for", () => {
        expect(BuildSpawnOutline({ spawnType: "spiral" }, 0, 0, 0).shapes).toEqual([]);
    });
});

describe("a rectangle", () => {
    const config = { spawnType: "rect", spawnRect: { x: -10, y: -5, w: 20, h: 10 }, pos: { x: 100, y: 50 } };

    it("is a closed line round the rectangle, offset from the origin", () => {
        const [shape] = BuildSpawnOutline(config, 0, 0, 0).shapes;

        expect(shape.closed).toBe(true);
        expect(shape.points).toEqual([{ x: 90, y: 45 }, { x: 110, y: 45 }, { x: 110, y: 55 }, { x: 90, y: 55 }]);
    });

    it("is turned about the origin with the emitter", () => {
        const [shape] = BuildSpawnOutline({ spawnType: "rect", spawnRect: { x: 10, y: 0, w: 10, h: 4 } }, 0, 0, 90).shapes;

        // (10,0) -> (0,10); (20,0) -> (0,20); (20,4) -> (-4,20); (10,4) -> (-4,10)
        const expected = [{ x: 0, y: 10 }, { x: 0, y: 20 }, { x: -4, y: 20 }, { x: -4, y: 10 }];
        shape.points.forEach((p, i) => {
            close(p.x, expected[i].x);
            close(p.y, expected[i].y);
        });
    });

    it("moves with the owner", () => {
        const [shape] = BuildSpawnOutline(config, 1000, 2000, 0).shapes;

        expect(shape.points[0]).toEqual({ x: 1090, y: 2045 });
    });

    it("is left out when the config has no rectangle, rather than failing", () => {
        expect(BuildSpawnOutline({ spawnType: "rect" }, 0, 0, 0).shapes).toEqual([]);
    });
});

describe("a circle", () => {
    it("is a closed line of points all one radius from its centre", () => {
        const [shape] = BuildSpawnOutline({ spawnType: "circle", spawnCircle: { x: 0, y: 0, r: 30 }, pos: { x: 100, y: 100 } }, 0, 0, 0).shapes;

        expect(shape.closed).toBe(true);
        expect(shape.points).toHaveLength(CircleSides);
        shape.points.forEach(p => close(distance(p, { x: 100, y: 100 }), 30));
    });

    it("has its centre offset by the circle's own x, y, turned with the emitter", () => {
        const [shape] = BuildSpawnOutline({ spawnType: "circle", spawnCircle: { x: 20, y: 0, r: 5 } }, 0, 0, 90).shapes;

        // the centre (20,0) turns to (0,20); the radius is unchanged
        const centre = { x: 0, y: 20 };
        shape.points.forEach(p => close(distance(p, centre), 5));
    });

    it("is left out when the config has no circle", () => {
        expect(BuildSpawnOutline({ spawnType: "circle" }, 0, 0, 0).shapes).toEqual([]);
    });

    it("never has a negative radius", () => {
        const [shape] = BuildSpawnOutline({ spawnType: "circle", spawnCircle: { x: 0, y: 0, r: -4 } }, 0, 0, 0).shapes;

        shape.points.forEach(p => close(distance(p, { x: 0, y: 0 }), 0));
    });
});

describe("a ring", () => {
    it("is two circles, the outer and the inner", () => {
        const shapes = BuildSpawnOutline({ spawnType: "ring", spawnCircle: { x: 0, y: 0, r: 40, minR: 15 } }, 0, 0, 0).shapes;

        expect(shapes).toHaveLength(2);
        shapes[0].points.forEach(p => close(distance(p, { x: 0, y: 0 }), 40));
        shapes[1].points.forEach(p => close(distance(p, { x: 0, y: 0 }), 15));
    });

    it("is one circle when the inner radius is none, or the same as the outer", () => {
        expect(BuildSpawnOutline({ spawnType: "ring", spawnCircle: { x: 0, y: 0, r: 40, minR: 0 } }, 0, 0, 0).shapes).toHaveLength(1);
        expect(BuildSpawnOutline({ spawnType: "ring", spawnCircle: { x: 0, y: 0, r: 40, minR: 40 } }, 0, 0, 0).shapes).toHaveLength(1);
        expect(BuildSpawnOutline({ spawnType: "ring", spawnCircle: { x: 0, y: 0, r: 40 } }, 0, 0, 0).shapes).toHaveLength(1);
    });

    it("does not draw the inner circle outside the outer one", () => {
        const shapes = BuildSpawnOutline({ spawnType: "ring", spawnCircle: { x: 0, y: 0, r: 10, minR: 30 } }, 0, 0, 0).shapes;

        shapes.forEach(shape => shape.points.forEach(p => expect(distance(p, { x: 0, y: 0 })).toBeLessThanOrEqual(10 + 1e-9)));
    });
});

describe("a burst", () => {
    it("is one ray from the origin for each particle of the wave, spread by the spacing from the start angle", () => {
        const shapes = BuildSpawnOutline({ spawnType: "burst", particlesPerWave: 4, particleSpacing: 90, angleStart: 0, pos: { x: 10, y: 10 } }, 0, 0, 0).shapes;

        expect(shapes).toHaveLength(4);
        const ends = [{ x: 10 + RayLength, y: 10 }, { x: 10, y: 10 + RayLength }, { x: 10 - RayLength, y: 10 }, { x: 10, y: 10 - RayLength }];
        shapes.forEach((ray, i) => {
            expect(ray.closed).toBe(false);
            expect(ray.points[0]).toEqual({ x: 10, y: 10 });
            close(ray.points[1].x, ends[i].x);
            close(ray.points[1].y, ends[i].y);
        });
    });

    it("starts from the start angle, turned with the emitter", () => {
        const [ray] = BuildSpawnOutline({ spawnType: "burst", particlesPerWave: 1, particleSpacing: 10, angleStart: 30 }, 0, 0, 60).shapes;

        // 30 + 60 = 90 degrees: straight down
        close(ray.points[1].x, 0);
        close(ray.points[1].y, RayLength);
    });

    it("is a ring round the origin when the spacing is 0, since each particle goes in a random direction", () => {
        const shapes = BuildSpawnOutline({ spawnType: "burst", particlesPerWave: 12, particleSpacing: 0 }, 5, 5, 0).shapes;

        expect(shapes).toHaveLength(1);
        expect(shapes[0].closed).toBe(true);
        shapes[0].points.forEach(p => close(distance(p, { x: 5, y: 5 }), RayLength / 2));
    });

    it("draws at least one ray, and not a ray for each of hundreds of particles", () => {
        expect(BuildSpawnOutline({ spawnType: "burst", particleSpacing: 10 }, 0, 0, 0).shapes).toHaveLength(1);
        expect(BuildSpawnOutline({ spawnType: "burst", particlesPerWave: 500, particleSpacing: 1 }, 0, 0, 0).shapes).toHaveLength(MaxRays);
    });
});

describe("a polygon chain", () => {
    it("is an open line through its points, offset by the origin", () => {
        const [chain] = BuildSpawnOutline({ spawnType: "polygonalChain", spawnPolygon: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], pos: { x: 5, y: 5 } }, 0, 0, 0).shapes;

        expect(chain.closed).toBe(false);
        expect(chain.points).toEqual([{ x: 5, y: 5 }, { x: 15, y: 5 }, { x: 15, y: 15 }]);
    });

    it("is several lines for a list of chains", () => {
        const shapes = BuildSpawnOutline({ spawnType: "polygonalChain", spawnPolygon: [[{ x: 0, y: 0 }, { x: 1, y: 1 }], [{ x: 5, y: 5 }, { x: 6, y: 6 }]] }, 0, 0, 0).shapes;

        expect(shapes).toHaveLength(2);
        expect(shapes[1].points[0]).toEqual({ x: 5, y: 5 });
    });

    it("is turned about the origin with the emitter", () => {
        const [chain] = BuildSpawnOutline({ spawnType: "polygonalChain", spawnPolygon: [{ x: 10, y: 0 }, { x: 20, y: 0 }] }, 0, 0, 90).shapes;

        close(chain.points[0].x, 0);
        close(chain.points[0].y, 10);
        close(chain.points[1].y, 20);
    });

    it("is left out for no points, or none at all", () => {
        expect(BuildSpawnOutline({ spawnType: "polygonalChain", spawnPolygon: [] }, 0, 0, 0).shapes).toEqual([]);
        expect(BuildSpawnOutline({ spawnType: "polygonalChain" }, 0, 0, 0).shapes).toEqual([]);
    });
});

describe("odd numbers", () => {
    it("are taken as 0 rather than drawing NaN", () => {
        const [shape] = BuildSpawnOutline({ spawnType: "rect", spawnRect: { x: "far", y: null, w: undefined, h: "7" } }, 0, 0, 0).shapes;

        shape.points.forEach(p => {
            expect(isFinite(p.x)).toBe(true);
            expect(isFinite(p.y)).toBe(true);
        });
        expect(shape.points[2]).toEqual({ x: 0, y: 7 });
    });
});
