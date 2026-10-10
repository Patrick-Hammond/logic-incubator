import { describe, expect, it } from "vitest";
import { BakeLights, ComposeLighting, LightBlockers, LightBlockersFor, LightGrid, LightValue, OpenLightBlockers } from "./Lighting";
import SceneLights, { MovingLight } from "./SceneLights";

const WHITE = 0xffffff;
const STEADY: LightValue = { brightness: 0.6, tint: WHITE, range: 5 };
const TORCH: LightValue = { brightness: 0.6, tint: WHITE, range: 5, flicker: 0.3 };

/** Red at corner `(x, y)`. */
function Red(grid: LightGrid, x: number, y: number): number {
    return grid.data[(y * (grid.width + 1) + x) * 3];
}

/** A scene of the given lights on an open `width` x `height` map (or `blockers`), with a grid of its own. */
function Scene(lights: { x: number; y: number; value: LightValue }[], blockers: LightBlockers = OpenLightBlockers(16, 10)): SceneLights {
    const bake = BakeLights(lights, blockers);
    return new SceneLights(bake, ComposeLighting(bake));
}

describe("SceneLights", () => {
    it("shows the baked lights as they were baked when none flicker or move", () => {
        const lights = [{ x: 3, y: 3, value: STEADY }, { x: 10, y: 5, value: STEADY }];
        const scene = Scene(lights);
        const grid = scene.Update(2.5, []);
        expect(grid).toBe(scene.grid);
        expect(Array.from(grid.data)).toEqual(Array.from(ComposeLighting(BakeLights(lights, OpenLightBlockers(16, 10))).data));
        expect(scene.Scale(0)).toBe(1);
    });

    it("flickers a baked light that has flicker, without casting it again", () => {
        const scene = Scene([{ x: 5, y: 5, value: TORCH }]);
        const seen = new Set<number>();
        for (let t = 0; t < 2; t += 0.1) {
            scene.Update(t, []);
            seen.add(Math.round(Red(scene.grid, 5, 5) * 1000));
            expect(scene.Scale(0)).toBeGreaterThanOrEqual(0.7 - 1e-9);
            expect(scene.Scale(0)).toBeLessThanOrEqual(1.3 + 1e-9);
        }
        expect(seen.size).toBeGreaterThan(5);
    });

    it("leaves out a baked light switched off, and brings it back when it's switched on", () => {
        const scene = Scene([{ x: 3, y: 3, value: STEADY }]);
        const lit = Red(scene.Update(0, []), 3, 3);
        scene.SetOn(0, false);
        expect(scene.IsOn(0)).toBe(false);
        const dark = Red(scene.Update(0, []), 3, 3);
        expect(dark).toBeLessThan(lit - 0.3);
        expect(scene.Scale(0)).toBe(0);
        scene.SetOn(0, true);
        expect(Red(scene.Update(0, []), 3, 3)).toBeCloseTo(lit);
    });

    it("ignores switching a light it hasn't got", () => {
        const scene = Scene([{ x: 3, y: 3, value: STEADY }]);
        expect(() => scene.SetOn(5, false)).not.toThrow();
        expect(scene.IsOn(5)).toBe(false);
        expect(scene.BakedCount).toBe(1);
    });

    it("lights the floor where a moving light is now, and forgets it once it's gone", () => {
        const scene = Scene([]);
        const before = Red(scene.Update(0, []), 8, 5);
        const after = Red(scene.Update(0, [{ x: 8, y: 5, value: STEADY }]), 8, 5);
        expect(after).toBeGreaterThan(before + 0.3);
        expect(Red(scene.Update(0, []), 8, 5)).toBeCloseTo(before);
    });

    it("scales a moving light by its scale - a torch burning down", () => {
        const scene = Scene([]);
        const ambient = Red(scene.Update(0, []), 8, 5);
        const full = Red(scene.Update(0, [{ x: 8, y: 5, value: STEADY, key: "torch" }]), 8, 5) - ambient;
        const half = Red(scene.Update(0, [{ x: 8, y: 5, value: STEADY, key: "torch", scale: 0.5 }]), 8, 5) - ambient;
        expect(half).toBeCloseTo(full / 2);
        expect(Red(scene.Update(0, [{ x: 8, y: 5, value: STEADY, scale: 0 }]), 8, 5)).toBeCloseTo(ambient);
    });

    it("keeps a keyed moving light's last cast until it has moved an eighth of a tile", () => {
        const scene = Scene([]);
        const light: MovingLight = { x: 8, y: 5, value: STEADY, key: "shot" };
        const at = Array.from(scene.Update(0, [light]).data);
        light.x += 0.05;
        expect(Array.from(scene.Update(0, [light]).data)).toEqual(at);
        light.x += 0.5;
        expect(Array.from(scene.Update(0, [light]).data)).not.toEqual(at);
    });

    it("casts a keyed moving light again at once when its value changes", () => {
        const scene = Scene([]);
        const dim = Red(scene.Update(0, [{ x: 8, y: 5, value: STEADY, key: "torch" }]), 8, 5);
        const bright = Red(scene.Update(0, [{ x: 8, y: 5, value: { ...STEADY, brightness: 1.2 }, key: "torch" }]), 8, 5);
        expect(bright).toBeGreaterThan(dim + 0.3);
    });

    it("stops a moving light at walls", () => {
        const rows = ["........#.......", "........#.......", "........#.......", "........#......."];
        const blockers = LightBlockersFor(16, 4, (x, y) => rows[y][x] === "#", () => 0, []);
        const scene = Scene([], blockers);
        const ambient = Red(scene.Update(0, []), 11, 2);
        expect(Red(scene.Update(0, [{ x: 6.5, y: 2, value: STEADY }]), 11, 2)).toBeCloseTo(ambient);
    });

    it("tells whoever draws a keyed moving light its colour and its strength this frame", () => {
        const scene = Scene([]);
        const key = {};
        scene.Update(1, [{ x: 8, y: 5, value: { brightness: 0.5, tint: 0xff0000, range: 5 }, key, scale: 0.5 }]);
        expect(scene.MovingScale(key)).toBeCloseTo(0.5);
        expect(scene.MovingColour(key)).toEqual([0.5, 0, 0]);
        scene.Update(1.1, []);
        expect(scene.MovingScale(key)).toBeUndefined();
        expect(scene.MovingColour(key)).toBeUndefined();
    });

    it("gives the baked lights' origins and colours", () => {
        const scene = Scene([{ x: 3, y: 4, value: { brightness: 0.5, tint: 0x00ff00, range: 5 } }]);
        expect(scene.Origin(0)).toEqual({ x: 3.5, y: 4.5 });
        expect(scene.Colour(0)).toEqual([0, 0.5, 0]);
    });
});
