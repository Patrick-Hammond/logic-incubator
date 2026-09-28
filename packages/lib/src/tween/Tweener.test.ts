import { beforeEach, describe, expect, it, vi } from "vitest";
import { Easing } from "./Easing";
import { Tween, TweenWithOptions } from "./Tweener";

// A hand-cranked stand-in for Ticker.shared, so tests step time explicitly.
const ticker = vi.hoisted(() => {
    const listeners = new Set<() => void>();
    return {
        deltaMS: 0,
        listeners,
        add: (fn: () => void) => listeners.add(fn),
        remove: (fn: () => void) => listeners.delete(fn),
    };
});

vi.mock("pixi.js", () => ({ Ticker: { shared: ticker } }));
// The real module drags in Game (and the renderer) just for this helper.
vi.mock("../game/display/Utils", () => ({ CallbackDone: (fn?: () => void) => fn?.() }));

function step(ms: number, times = 1): void {
    for (let i = 0; i < times; i++) {
        ticker.deltaMS = ms;
        Array.from(ticker.listeners).forEach(fn => fn());
    }
}

describe("Tween", () => {
    beforeEach(() => ticker.listeners.clear());

    it("lands exactly on the target, completes once, and stops ticking", () => {
        const target = { x: 0 };
        const onComplete = vi.fn();
        Tween(target, { x: 100 }, 100, Easing.Linear, onComplete);

        step(50);
        expect(target.x).toBeCloseTo(50);
        step(60);
        expect(target.x).toBe(100);
        expect(onComplete).toHaveBeenCalledTimes(1);
        expect(ticker.listeners.size).toBe(0);
    });

    it("jumps straight to the target when ms <= 0", () => {
        const target = { x: 0 };
        Tween(target, { x: 100 }, 0);
        expect(target.x).toBe(100);
        expect(ticker.listeners.size).toBe(0);
    });
});

describe("TweenWithOptions", () => {
    beforeEach(() => ticker.listeners.clear());

    it("pingPong goes out to the target and back to the start", () => {
        const target = { x: 10 };
        const onComplete = vi.fn();
        TweenWithOptions(target, { x: 110 }, 100, { pingPong: true, onComplete });

        step(50);
        expect(target.x).toBeCloseTo(60);
        step(50);
        expect(target.x).toBeCloseTo(110);
        step(25);
        expect(target.x).toBeCloseTo(85);
        expect(onComplete).not.toHaveBeenCalled();
        step(100);
        expect(target.x).toBe(10);
        expect(onComplete).toHaveBeenCalledTimes(1);
        expect(ticker.listeners.size).toBe(0);
    });

    it("pingPong's return leg is the forward leg played in reverse", () => {
        const target = { x: 0 };
        TweenWithOptions(target, { x: 1 }, 100, { pingPong: true, easing: Easing.Quad.Out });

        step(25);
        const out = target.x;
        expect(out).toBeCloseTo(Easing.Quad.Out(0.25));
        step(150);  // 75% through the return leg mirrors 25% through the forward leg.
        expect(target.x).toBeCloseTo(out);
    });

    it("repeat without pingPong restarts from the start each play", () => {
        const target = { x: 0 };
        const onComplete = vi.fn();
        TweenWithOptions(target, { x: 100 }, 100, { repeat: 2, onComplete });

        step(90);
        expect(target.x).toBeCloseTo(90);
        step(20);
        expect(target.x).toBeCloseTo(10);
        step(180);
        expect(onComplete).not.toHaveBeenCalled();
        step(10);
        expect(target.x).toBe(100);
        expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it("repeat counts a ping-pong round trip as one play", () => {
        const target = { x: 0 };
        const onComplete = vi.fn();
        TweenWithOptions(target, { x: 100 }, 100, { pingPong: true, repeat: 1, onComplete });

        step(300);
        expect(target.x).toBeCloseTo(100);
        expect(onComplete).not.toHaveBeenCalled();
        step(100);
        expect(target.x).toBe(0);
        expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it("repeat: Infinity keeps ping-ponging until cancelled", () => {
        const target = { alpha: 1 };
        const onComplete = vi.fn();
        const cancel = TweenWithOptions(target, { alpha: 0 }, 100, { pingPong: true, repeat: Infinity, onComplete });

        step(16, 1000);
        expect(ticker.listeners.size).toBe(1);
        expect(target.alpha).toBeGreaterThanOrEqual(0);
        expect(target.alpha).toBeLessThanOrEqual(1);

        cancel();
        const frozen = target.alpha;
        step(50);
        expect(target.alpha).toBe(frozen);
        expect(ticker.listeners.size).toBe(0);
        expect(onComplete).not.toHaveBeenCalled();
    });

    it("pingPong with ms <= 0 leaves the values where they started", () => {
        const target = { x: 5 };
        const onComplete = vi.fn();
        TweenWithOptions(target, { x: 100 }, 0, { pingPong: true, onComplete });
        expect(target.x).toBe(5);
        expect(onComplete).toHaveBeenCalledTimes(1);
    });
});
