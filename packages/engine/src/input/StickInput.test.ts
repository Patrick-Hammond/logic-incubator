import { afterEach, describe, expect, it, vi } from "vitest";
import GamePad from "@logic-incubator/lib/io/GamePad";
import { IsStickPushed } from "./StickInput";

// GamePad only uses Timing for button timing, and Timing pulls in pixi.js - which wants a browser.
vi.mock("@logic-incubator/lib/game/Timing", () => ({ Wait: () => () => undefined }));

/**
 * Regression test for "the player auto-fires constantly on a gamepad": PlayerControl treated
 * `GamePad.GetStick(id, 1, ...)` being non-null as "the right stick is pushed". But GetStick is
 * null only when there's no controller, or it has too few axes - a resting stick comes back as a
 * vector the dead zone has zeroed - so any connected pad with its right stick untouched counted as
 * firing, every frame, whenever no keyboard key was held.
 */
describe("IsStickPushed", () => {
    it("is false for a resting stick - the zeroed vector GetStick returns inside the dead zone", () => {
        expect(IsStickPushed({ x: 0, y: 0 })).toBe(false);
    });

    it("is false when there's no stick to read at all (GetStick returns null)", () => {
        expect(IsStickPushed(null)).toBe(false);
    });

    it("is true once the stick is pushed along either axis, in either direction - an up/down-only push still fires", () => {
        const pushes = [{ x: 0.8, y: 0 }, { x: -0.8, y: 0 }, { x: 0, y: 0.8 }, { x: 0, y: -0.8 }, { x: 0.5, y: -0.5 }];
        for (const stick of pushes) {
            expect(IsStickPushed(stick), JSON.stringify(stick)).toBe(true);
        }
    });
});

describe("a connected controller's right stick, read through the real GamePad.GetStick", () => {
    const AimDeadZone = 0.3; // what PlayerControl passes for the right stick

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

    it("is handed back at rest - not null - yet is not pushed", () => {
        // The left stick drifting a little, the right stick wobbling inside its dead zone.
        const aim = padWith([0.02, -0.01, 0.1, -0.2]).GetStick(0, 1, AimDeadZone);

        // That non-null result is what a bare `if (aim)` took for "firing"...
        expect(aim).not.toBeNull();
        // ...but the dead zone has zeroed it.
        expect(IsStickPushed(aim)).toBe(false);
    });

    it("is pushed once it's past the dead zone", () => {
        expect(IsStickPushed(padWith([0, 0, 0.9, 0]).GetStick(0, 1, AimDeadZone))).toBe(true);
        expect(IsStickPushed(padWith([0, 0, 0, -0.9]).GetStick(0, 1, AimDeadZone))).toBe(true);
    });

    it("stays pushed on one axis when the other is still inside the dead zone", () => {
        // Mostly up, a touch right: x is zeroed by the dead zone, y survives - still a push.
        const aim = padWith([0, 0, 0.1, -0.9]).GetStick(0, 1, AimDeadZone);
        expect(aim.x).toBe(0);
        expect(IsStickPushed(aim)).toBe(true);
    });

    it("is not pushed on a controller with no right stick at all", () => {
        const aim = padWith([0.5, 0.5]).GetStick(0, 1, AimDeadZone);
        expect(aim).toBeNull();
        expect(IsStickPushed(aim)).toBe(false);
    });
});
