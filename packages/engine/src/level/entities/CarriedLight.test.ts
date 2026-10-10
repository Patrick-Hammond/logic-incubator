import { describe, expect, it } from "vitest";
import { CarriedLightScale, CreateCarriedLight, GutterTime, TickCarriedLight } from "./CarriedLight";

const TORCH = { brightness: 1, tint: 0xffc780, range: 7 };

describe("CarriedLight", () => {
    it("burns for its seconds, then goes out", () => {
        const light = CreateCarriedLight(TORCH, 30);
        expect(TickCarriedLight(light, 29)).toBe(true);
        expect(TickCarriedLight(light, 2)).toBe(false);
        expect(light.left).toBe(0);
    });

    it("burns for the rest of the level with no seconds, 0 or a negative number", () => {
        [CreateCarriedLight(TORCH), CreateCarriedLight(TORCH, 0), CreateCarriedLight(TORCH, -4)].forEach(light => {
            expect(TickCarriedLight(light, 10000)).toBe(true);
            expect(CarriedLightScale(light)).toBe(1);
        });
    });

    it("is at full strength until its last GutterTime seconds, then dims to nothing", () => {
        const light = CreateCarriedLight(TORCH, 60);
        TickCarriedLight(light, 60 - GutterTime);
        expect(CarriedLightScale(light)).toBe(1);
        TickCarriedLight(light, GutterTime / 2);
        expect(CarriedLightScale(light)).toBeCloseTo(0.5);
        TickCarriedLight(light, GutterTime);
        expect(CarriedLightScale(light)).toBe(0);
    });

    it("dims over the whole of a burn shorter than GutterTime", () => {
        const light = CreateCarriedLight(TORCH, GutterTime / 2);
        expect(CarriedLightScale(light)).toBe(1);
        TickCarriedLight(light, GutterTime / 4);
        expect(CarriedLightScale(light)).toBeCloseTo(0.5);
    });
});
