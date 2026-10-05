import { describe, expect, it } from "vitest";
import InputRepeater from "./InputRepeater";
import { ActionForKeyCode } from "./KeyMap";
import { ActionsFromPad, PadSample } from "./PadMap";
import { InputSource, UiAction } from "./UiAction";
import UiInputCore from "./UiInputCore";

const set = (...actions: UiAction[]) => new Set<UiAction>(actions);

describe("ActionForKeyCode", () => {
    it("maps the arrows and WASD to directions, Enter and Space to accept, Escape and Backspace to cancel, Q/E and Page Up/Down to tabs", () => {
        expect([38, 40, 37, 39].map(ActionForKeyCode)).toEqual(["up", "down", "left", "right"]);
        expect([87, 83, 65, 68].map(ActionForKeyCode)).toEqual(["up", "down", "left", "right"]);
        expect([13, 32].map(ActionForKeyCode)).toEqual(["accept", "accept"]);
        expect([27, 8].map(ActionForKeyCode)).toEqual(["cancel", "cancel"]);
        expect([81, 69, 33, 34].map(ActionForKeyCode)).toEqual(["tabPrev", "tabNext", "tabPrev", "tabNext"]);
    });

    it("has nothing for any other key", () => {
        expect(ActionForKeyCode(70)).toBeNull(); // F
        expect(ActionForKeyCode(112)).toBeNull(); // F1
        expect(ActionForKeyCode(9)).toBeNull(); // Tab: left to the browser
    });
});

/** A pad with the named standard-layout buttons down, the left stick at (x, y) and the d-pad axis reading `dpad`. */
const pad = (down: number[] = [], stick = { x: 0, y: 0 }, dpad: PadSample["dpad"] = "none"): PadSample => ({ button: i => down.indexOf(i) >= 0, stick, dpad });

describe("ActionsFromPad", () => {
    it("reads the d-pad buttons, A and B, and the shoulder buttons", () => {
        expect(ActionsFromPad(pad([12]))).toEqual(["up"]);
        expect(ActionsFromPad(pad([13, 14, 15]))).toEqual(["down", "left", "right"]);
        expect(ActionsFromPad(pad([0, 1, 4, 5]))).toEqual(["accept", "cancel", "tabPrev", "tabNext"]);
        expect(ActionsFromPad(pad())).toEqual([]);
    });

    it("reads a d-pad that reports itself as an axis", () => {
        expect(ActionsFromPad(pad([], { x: 0, y: 0 }, "left"))).toEqual(["left"]);
    });

    it("reads the stick past its dead zone as the stronger axis, and ignores it inside", () => {
        expect(ActionsFromPad(pad([], { x: -0.9, y: 0.2 }))).toEqual(["left"]);
        expect(ActionsFromPad(pad([], { x: 0.4, y: 0.8 }))).toEqual(["down"]);
        expect(ActionsFromPad(pad([], { x: 0.3, y: -0.3 }))).toEqual([]);
        expect(ActionsFromPad(pad([], { x: 0.6, y: 0.1 }), 0.7)).toEqual([]);
    });

    it("reports an action once however many controls hold it", () => {
        expect(ActionsFromPad(pad([14], { x: -1, y: 0 }, "left"))).toEqual(["left"]);
    });
});

describe("InputRepeater", () => {
    const options = { delay: 300, interval: 100, repeats: ["down", "tabNext"] as UiAction[] };

    it("fires on the press, waits the delay, then repeats every interval while held", () => {
        const r = new InputRepeater(options);
        const log: Array<[number, UiAction[]]> = [];
        let t = 0;
        const step = (held: UiAction[], pressed: UiAction[] = [], dt = 50) => {
            t += dt;
            log.push([t, r.Update(set(...held), set(...pressed), dt)]);
        };
        step(["down"], ["down"]); // 50: the press
        step(["down"]); // 100
        step(["down"]); // 150
        step(["down"]); // 200
        step(["down"]); // 250
        step(["down"]); // 300: 250 ms since the press, delay 300 - not yet
        step(["down"]); // 350: 300 reached
        step(["down"]); // 400
        step(["down"]); // 450: 100 after the first repeat
        expect(log.filter(([, fired]) => fired.length).map(([at]) => at)).toEqual([50, 350, 450]);
    });

    it("doesn't repeat an action that isn't a repeater, however long it is held", () => {
        const r = new InputRepeater(options);
        expect(r.Update(set("accept"), set("accept"), 16)).toEqual(["accept"]);
        for (let i = 0; i < 100; i++) expect(r.Update(set("accept"), set(), 16)).toEqual([]);
    });

    it("fires a tap that was over before the update, once", () => {
        const r = new InputRepeater(options);
        expect(r.Update(set(), set("down"), 16)).toEqual(["down"]);
        expect(r.Update(set(), set(), 16)).toEqual([]);
        // and it can be pressed again
        expect(r.Update(set("down"), set("down"), 16)).toEqual(["down"]);
    });

    it("starts again after a release, with the delay once more", () => {
        const r = new InputRepeater(options);
        r.Update(set("down"), set("down"), 16);
        for (let i = 0; i < 10; i++) r.Update(set("down"), set(), 40);
        r.Update(set(), set(), 16);
        expect(r.Update(set("down"), set("down"), 16)).toEqual(["down"]);
        expect(r.Update(set("down"), set(), 100)).toEqual([]);
    });

    it("takes one step, not a burst, after a long frame", () => {
        const r = new InputRepeater(options);
        r.Update(set("down"), set("down"), 16);
        expect(r.Update(set("down"), set(), 2000)).toEqual(["down"]);
        expect(r.Update(set("down"), set(), 50)).toEqual([]);
    });

    it("forgets everything on Reset", () => {
        const r = new InputRepeater(options);
        r.Update(set("down"), set("down"), 16);
        r.Reset();
        expect(r.Update(set("down"), set(), 16)).toEqual(["down"]);
    });
});

describe("UiInputCore", () => {
    const options = { delay: 300, interval: 100, repeats: ["up", "down", "left", "right"] as UiAction[] };
    const make = () => {
        const fired: Array<[UiAction, InputSource]> = [];
        const core = new UiInputCore((action, source) => fired.push([action, source]), options);
        return { core, fired };
    };

    it("turns a key press into its action, and says whether the UI uses the key", () => {
        const { core, fired } = make();
        expect(core.KeyDown(40)).toBe(true);
        expect(core.KeyDown(70)).toBe(false);
        core.Update(16);
        expect(fired).toEqual([["down", "keyboard"]]);
        expect(core.KeyUp(40)).toBe(true);
        expect(core.KeyUp(70)).toBe(false);
    });

    it("ignores the browser's own key repeat, and repeats the held key itself", () => {
        const { core, fired } = make();
        core.KeyDown(40);
        core.Update(16);
        for (let i = 0; i < 5; i++) {
            core.KeyDown(40);
            core.Update(16);
        }
        expect(fired.length).toBe(1);
        for (let i = 0; i < 30; i++) core.Update(16);
        expect(fired.length).toBeGreaterThan(2);
        expect(fired.every(([action]) => action === "down")).toBe(true);
    });

    it("fires a key tapped between two updates, once", () => {
        const { core, fired } = make();
        core.KeyDown(13);
        core.KeyUp(13);
        core.Update(16);
        core.Update(16);
        expect(fired).toEqual([["accept", "keyboard"]]);
    });

    it("treats a key and the pad holding the same action as one hold", () => {
        const { core, fired } = make();
        core.KeyDown(40);
        core.Pad(pad([13]));
        core.Update(16);
        expect(fired).toEqual([["down", "keyboard"]]);
        core.Pad(pad([13]));
        core.Update(16);
        expect(fired.length).toBe(1);
    });

    it("reports the pad as the source of what the pad pressed, and fires a pad action once per press", () => {
        const { core, fired } = make();
        core.Pad(pad([0]));
        core.Update(16);
        core.Pad(pad([0]));
        core.Update(16);
        core.Pad(pad([]));
        core.Update(16);
        core.Pad(pad([0]));
        core.Update(16);
        expect(fired).toEqual([["accept", "pad"], ["accept", "pad"]]);
    });

    it("copes with the pad disappearing", () => {
        const { core, fired } = make();
        core.Pad(pad([14]));
        core.Update(16);
        core.Pad(null);
        for (let i = 0; i < 40; i++) core.Update(16);
        expect(fired).toEqual([["left", "pad"]]);
        expect(core.Busy).toBe(false);
    });

    it("lets go of everything on ReleaseAll, so a key whose key-up never came doesn't stick", () => {
        const { core, fired } = make();
        core.KeyDown(39);
        core.Update(16);
        core.ReleaseAll();
        for (let i = 0; i < 60; i++) core.Update(16);
        expect(fired.length).toBe(1);
        expect(core.Busy).toBe(false);
    });
});
