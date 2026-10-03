import { afterEach, describe, expect, it, vi } from "vitest";
import { Direction } from "../utils/Types";
import GamePad from "./GamePad";

// GamePad only uses Timing for button timing, and Timing pulls in pixi.js - which wants a browser.
vi.mock("../game/Timing", () => ({ Wait: () => () => undefined }));

const Threshold = 0.3;

afterEach(() => {
    vi.unstubAllGlobals();
});

/** A GamePad with one controller (id 0) reporting `axes` - left x, left y, right x, right y, ... */
function padWith(axes: number[]): GamePad {
    // GamePad's constructor listens for connect events on the browser `window`. A stub that
    // claims GamepadEvent support is enough to take that path (no polling timer), and nothing
    // here fires one - the controller is just put straight into place.
    vi.stubGlobal("window", { GamepadEvent: class {}, addEventListener: () => undefined });
    const pad = new GamePad();
    pad.controllers[0] = { axes } as unknown as Gamepad;
    return pad;
}

/**
 * Stick N is the axis pair (N*2, N*2 + 1), so a controller only has it if it reports both. The
 * guard used to ask for the first alone, and the missing second axis read back as `undefined`:
 * `LowerLimit(undefined, t)` is `undefined` (NaN < t is false), and `Vec2.Set(x, undefined)` falls
 * back to `y = x`. So a 3-axis pad whose axis 2 rested off-centre read as a right stick pushed
 * diagonally - which PlayerControl took for the player firing.
 */
const NotEnoughAxes: { stick: number; axes: number[] }[] = [
    { stick: 0, axes: [] },
    { stick: 0, axes: [0.9] },
    { stick: 1, axes: [0, 0] },
    { stick: 1, axes: [0, 0, 0.9] },
    { stick: 2, axes: [0, 0, 0, 0, 0.9] },
];

describe("GamePad.GetStick", () => {
    it.each(NotEnoughAxes)("is null when the controller doesn't report both of the stick's axes - stick $stick, axes $axes", ({ stick, axes }) => {
        expect(padWith(axes).GetStick(0, stick, Threshold)).toBeNull();
    });

    it("is null when no controller is connected in that slot", () => {
        expect(padWith([0.9, 0.9]).GetStick(1, 0, Threshold)).toBeNull();
    });

    it.each([
        // exactly the two axes the stick needs
        { stick: 0, axes: [0.9, 0], expected: { x: 0.9, y: 0 } },
        { stick: 1, axes: [0, 0, 0.9, 0], expected: { x: 0.9, y: 0 } },
        { stick: 2, axes: [0, 0, 0, 0, 0.9, -0.9], expected: { x: 0.9, y: -0.9 } },
        // each stick reads its own pair, not its neighbour's
        { stick: 0, axes: [0.5, -0.7, 0.4, -0.8], expected: { x: 0.5, y: -0.7 } },
        { stick: 1, axes: [0.5, -0.7, 0.4, -0.8], expected: { x: 0.4, y: -0.8 } },
    ])("reads stick $stick of axes $axes", ({ stick, axes, expected }) => {
        expect(padWith(axes).GetStick(0, stick, Threshold)).toMatchObject(expected);
    });

    it("hands a resting stick back zeroed by the dead zone - not null", () => {
        const stick = padWith([0.02, -0.01, 0.1, -0.2]).GetStick(0, 1, Threshold);

        expect(stick).not.toBeNull();
        expect(stick).toMatchObject({ x: 0, y: 0 });
    });
});

describe("GamePad.GetStickDirection", () => {
    it.each(NotEnoughAxes)("is null when the controller doesn't report both of the stick's axes - stick $stick, axes $axes", ({ stick, axes }) => {
        expect(padWith(axes).GetStickDirection(0, stick, Threshold)).toBeNull();
    });

    it("is null when no controller is connected in that slot", () => {
        expect(padWith([0.9, 0.9]).GetStickDirection(1, 0, Threshold)).toBeNull();
    });

    it.each<{ stick: number; axes: number[]; expected: Direction }>([
        // exactly the two axes the stick needs
        { stick: 0, axes: [0.9, 0], expected: "right" },
        { stick: 0, axes: [-0.9, 0], expected: "left" },
        { stick: 0, axes: [0, 0.9], expected: "down" },
        { stick: 0, axes: [0, -0.9], expected: "up" },
        { stick: 1, axes: [0, 0, 0.9, 0], expected: "right" },
        // each stick reads its own pair, not its neighbour's
        { stick: 0, axes: [0.9, 0, 0, -0.9], expected: "right" },
        { stick: 1, axes: [0.9, 0, 0, -0.9], expected: "up" },
        // inside the dead zone
        { stick: 0, axes: [0.1, -0.2], expected: "none" },
        { stick: 1, axes: [0, 0, -0.2, 0.1], expected: "none" },
    ])("reads stick $stick of axes $axes as $expected", ({ stick, axes, expected }) => {
        expect(padWith(axes).GetStickDirection(0, stick, Threshold)).toBe(expected);
    });
});

describe("GamePad.Destroy", () => {
    /** A `window` that records its listeners, so a test can see which are still attached. */
    function recordingWindow(extra: object = {}) {
        const attached = new Map<string, Set<unknown>>();
        const listenersOf = (type: string) => attached.get(type) || new Set<unknown>();
        vi.stubGlobal("window", {
            ...extra,
            addEventListener: (type: string, listener: unknown) => attached.set(type, listenersOf(type).add(listener)),
            removeEventListener: (type: string, listener: unknown) => listenersOf(type).delete(listener),
        });
        return (type: string) => listenersOf(type).size;
    }

    afterEach(() => {
        vi.useRealTimers();
    });

    it("takes back the window's connect and disconnect listeners", () => {
        const attachedTo = recordingWindow({ GamepadEvent: class {} });
        const pad = new GamePad();
        expect(attachedTo("gamepadconnected")).toBe(1);
        expect(attachedTo("gamepaddisconnected")).toBe(1);

        pad.Destroy();

        expect(attachedTo("gamepadconnected")).toBe(0);
        expect(attachedTo("gamepaddisconnected")).toBe(0);
    });

    it("takes back the webkit listeners where that's what the browser has", () => {
        const attachedTo = recordingWindow({ WebKitGamepadEvent: class {} });
        const pad = new GamePad();
        expect(attachedTo("webkitgamepadconnected")).toBe(1);

        pad.Destroy();

        expect(attachedTo("webkitgamepadconnected")).toBe(0);
        expect(attachedTo("webkitgamepaddisconnected")).toBe(0);
    });

    it("forgets its controllers and stops everyone listening on it", () => {
        recordingWindow({ GamepadEvent: class {} });
        const pad = new GamePad();
        pad.controllers[0] = { axes: [0, 0] } as unknown as Gamepad;
        pad.on("connected", () => undefined);

        pad.Destroy();

        expect(pad.IsConnected()).toBe(false);
        expect(pad.listenerCount("connected")).toBe(0);
    });

    it("is safe to call twice", () => {
        recordingWindow({ GamepadEvent: class {} });
        const pad = new GamePad();
        pad.Destroy();
        expect(() => pad.Destroy()).not.toThrow();
    });

    describe("in a browser without gamepad events, which polls instead", () => {
        const pad0 = { index: 0, id: "test pad", buttons: [], axes: [0, 0] } as unknown as Gamepad;

        it("polls with the right `this` - and stops once destroyed", () => {
            vi.useFakeTimers();
            vi.spyOn(console, "log").mockImplementation(() => undefined);
            recordingWindow();
            const getGamepads = vi.fn(() => [pad0]);
            vi.stubGlobal("navigator", { getGamepads });
            const pad = new GamePad();

            vi.advanceTimersByTime(500);
            // The scan used to be handed to setInterval bare, so it ran with no `this` and never found a controller.
            expect(getGamepads).toHaveBeenCalledTimes(1);
            expect(pad.IsConnected()).toBe(true);

            pad.Destroy();
            vi.advanceTimersByTime(5000);
            expect(getGamepads).toHaveBeenCalledTimes(1);
        });
    });
});
