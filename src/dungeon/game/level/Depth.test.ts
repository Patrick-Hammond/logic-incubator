import { describe, expect, it } from "vitest";
import { BaseZScale, CameraZoom, CameraZoomRatio, HeightAt, MaxCameraZoom, MinCameraZoom, MinZFade, StepZoom, ZBandAlpha, ZFadeStep, ZoomSettleDelay, ZoomSettleSpeed, ZoomState, ZScale, ZScaleRatio } from "./Depth";

describe("ZScale", () => {
    it("is BaseZScale at z 0", () => {
        expect(ZScale(0)).toBe(BaseZScale);
    });

    it("multiplies by ZScaleRatio per step", () => {
        expect(ZScale(1) / ZScale(0)).toBeCloseTo(ZScaleRatio, 10);
        expect(ZScale(4) / ZScale(3)).toBeCloseTo(ZScaleRatio, 10);
    });

    it("is strictly increasing in z", () => {
        for (let z = 0; z < 8; z++) {
            expect(ZScale(z + 1)).toBeGreaterThan(ZScale(z));
        }
    });
});

describe("ZBandAlpha", () => {
    it("is 1 for the player's own band", () => {
        expect(ZBandAlpha(0, 0)).toBe(1);
        expect(ZBandAlpha(3, 3)).toBe(1);
    });

    it("loses ZFadeStep per step away, symmetrically", () => {
        expect(ZBandAlpha(1, 0)).toBeCloseTo(1 - ZFadeStep, 10);
        expect(ZBandAlpha(0, 1)).toBeCloseTo(1 - ZFadeStep, 10);
        expect(ZBandAlpha(3, 1)).toBeCloseTo(1 - 2 * ZFadeStep, 10);
    });

    it("is floored to MinZFade for distant bands", () => {
        expect(ZBandAlpha(0, 10)).toBe(MinZFade);
        expect(ZBandAlpha(20, 2)).toBe(MinZFade);
        for (let z = -2; z < 12; z++) {
            expect(ZBandAlpha(z, 4)).toBeGreaterThanOrEqual(MinZFade);
        }
    });
});

describe("CameraZoom", () => {
    it("is 1 at z 0", () => {
        expect(CameraZoom(0)).toBe(1);
    });

    it("multiplies by CameraZoomRatio per step while inside the caps", () => {
        expect(CameraZoom(1) / CameraZoom(0)).toBeCloseTo(CameraZoomRatio, 10);
        expect(CameraZoom(4) / CameraZoom(3)).toBeCloseTo(CameraZoomRatio, 10);
    });

    it("grows with z but never past MaxCameraZoom", () => {
        expect(CameraZoom(5)).toBeGreaterThan(CameraZoom(0));
        expect(CameraZoom(50)).toBe(MaxCameraZoom);
        expect(CameraZoom(1000)).toBe(MaxCameraZoom);
    });

    it("shrinks with negative z but never past MinCameraZoom", () => {
        expect(CameraZoom(-5)).toBeLessThan(CameraZoom(0));
        expect(CameraZoom(-50)).toBe(MinCameraZoom);
        expect(CameraZoom(-1000)).toBe(MinCameraZoom);
    });
});

describe("StepZoom", () => {
    it("matches CameraZoom(z) while held, starting from a fully-settled state", () => {
        const state: ZoomState = { value: 1, z: 0 };
        const next = StepZoom(state, 5, 0, 1);
        expect(next.value).toBe(CameraZoom(5));
        expect(next.z).toBe(5);
    });

    it("steps incrementally from the current value, not from an absolute CameraZoom(z)", () => {
        // value doesn't reflect CameraZoom(2) here (e.g. it's mid-ease) - the
        // step must scale THIS value by the z 2->5 ratio, not discard it
        const state: ZoomState = { value: 1.2, z: 2 };
        const next = StepZoom(state, 5, 0, 1);
        expect(next.value).toBeCloseTo(1.2 * Math.pow(CameraZoomRatio, 3), 10);
        expect(next.z).toBe(5);
    });

    it("eases value toward 1 at ZoomSettleSpeed once heldTime reaches ZoomSettleDelay, leaving z untouched", () => {
        const from = CameraZoom(3);
        const dt = 0.001; // small enough that ZoomSettleSpeed * dt can't overshoot the remaining distance to 1
        const next = StepZoom({ value: from, z: 3 }, 3, ZoomSettleDelay, dt);
        expect(next.value).toBeCloseTo(from - ZoomSettleSpeed * dt, 10);
        expect(next.z).toBe(3);
    });

    it("eases upward toward 1 when value is below 1", () => {
        const from = CameraZoom(-3);
        const dt = 0.001;
        const next = StepZoom({ value: from, z: -3 }, -3, ZoomSettleDelay, dt);
        expect(next.value).toBeCloseTo(from + ZoomSettleSpeed * dt, 10);
    });

    it("clamps to exactly 1 instead of overshooting on a large dt", () => {
        expect(StepZoom({ value: CameraZoom(5), z: 5 }, 5, ZoomSettleDelay, 100).value).toBe(1);
        expect(StepZoom({ value: 1, z: 0 }, 0, ZoomSettleDelay, 100).value).toBe(1);
    });

    it("regression: interrupting an in-progress ease-back with a z change does not jump - it continues from wherever value currently is", () => {
        // settle partway back from a climb to z 5 (still mid-ease, not yet at 1)
        const midEase: ZoomState = { value: CameraZoom(5) - ZoomSettleSpeed, z: 5 };
        expect(midEase.value).not.toBe(1); // sanity: genuinely interrupted, not already settled

        // interrupt it by climbing one more level, to z 6
        const next = StepZoom(midEase, 6, 0, 1);

        // continuous: exactly one more ratio step from wherever value already was
        expect(next.value).toBeCloseTo(midEase.value * CameraZoomRatio, 10);
        // NOT a snap back to the fresh absolute CameraZoom(6) (which is what a
        // naive re-pin would produce, discarding how far the ease had gotten)
        expect(next.value).not.toBeCloseTo(CameraZoom(6), 5);
    });

    it("regression: stepping down after a full settle zooms OUT, not further in", () => {
        // player rested at z 5 long enough for the zoom to fully settle to 1
        const settledAtFive: ZoomState = { value: 1, z: 5 };

        // then steps down one level to z 4
        const next = StepZoom(settledAtFive, 4, 0, 1);

        expect(next.value).toBe(CameraZoom(-1)); // one ratio step down from the settled 1, not CameraZoom(4)
        expect(next.value).toBeLessThan(1); // zooms out, matching the downward move
    });

    it("does not change z while still easing (no further height change)", () => {
        const state: ZoomState = { value: CameraZoom(3), z: 3 };
        const next = StepZoom(state, 3, ZoomSettleDelay, 1);
        expect(next.z).toBe(3);
    });
});

describe("HeightAt", () => {
    it("is 0 for an unpainted or out-of-range cell", () => {
        expect(HeightAt([], 3, 3)).toBe(0);
        expect(HeightAt([[]], 3, 3)).toBe(0);
        const grid = [[], [], [1, 0, 2]]; // column x=2 only
        expect(HeightAt(grid, 0, 0)).toBe(0); // empty column
        expect(HeightAt(grid, 2, 1)).toBe(0); // painted 0
        expect(HeightAt(grid, 9, 9)).toBe(0); // out of range
    });

    it("returns the painted height at the cell", () => {
        const grid: number[][] = [];
        grid[4] = [];
        grid[4][7] = 3;
        expect(HeightAt(grid, 4, 7)).toBe(3);
        expect(HeightAt(grid, 4, 6)).toBe(0);
    });
});
