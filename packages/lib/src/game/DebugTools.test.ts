import { EventEmitter } from "eventemitter3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DebugTools, { DebugEnabled } from "./DebugTools";

/** The least of a display object that `Drag` touches. */
function FakeObject() {
    return Object.assign(new EventEmitter(), { interactive: false, cursor: null as string | null, name: "", x: 0, y: 0, parent: null as unknown });
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
    vi.restoreAllMocks();
});

describe("DebugEnabled", () => {
    it("is on in a development build", () => {
        expect(DebugEnabled({ IsReady: true, IsDev: true })).toBe(true);
    });

    it("is off in a production build - a manifest that was built with --production", () => {
        expect(DebugEnabled({ IsReady: true, IsDev: false })).toBe(false);
    });

    it("is on when no manifest was ever loaded: such a game can't say which kind of build it is", () => {
        expect(DebugEnabled({ IsReady: false, IsDev: false })).toBe(true);
    });
});

describe("Drag when enabled", () => {
    it("makes the object draggable and registers its cleanup with the component", () => {
        const own = vi.fn();
        const object = FakeObject();

        const stop = new DebugTools(own, () => true).Drag(object as never);

        expect(object.interactive).toBe(true);
        expect(object.listenerCount("pointerdown")).toBe(1);
        expect(own).toHaveBeenCalledTimes(1);
        expect(own).toHaveBeenCalledWith(stop);
        expect(warn).not.toHaveBeenCalled();
    });

    it("is on by default, when nothing says otherwise", () => {
        const object = FakeObject();

        new DebugTools(() => undefined).Drag(object as never);

        expect(object.interactive).toBe(true);
    });
});

describe("Drag when disabled", () => {
    it("does nothing: the object is left alone and nothing is registered for cleanup", () => {
        const own = vi.fn();
        const object = FakeObject();

        const stop = new DebugTools(own, () => false).Drag(object as never);

        expect(object.interactive).toBe(false);
        expect(object.cursor).toBe(null);
        expect(object.listenerCount("pointerdown")).toBe(0);
        expect(own).not.toHaveBeenCalled();
        expect(() => stop()).not.toThrow();
    });

    it("warns once per component, however many times it is called", () => {
        const tools = new DebugTools(() => undefined, () => false);

        tools.Drag(FakeObject() as never);
        tools.Drag(FakeObject() as never);
        tools.Drag(FakeObject() as never);

        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain("production build");
    });

    it("asks at each call, so it works once the build is known to be a development one", () => {
        let enabled = false;
        const tools = new DebugTools(() => undefined, () => enabled);
        const early = FakeObject();
        const late = FakeObject();

        tools.Drag(early as never);
        enabled = true;
        tools.Drag(late as never);

        expect(early.interactive).toBe(false);
        expect(late.interactive).toBe(true);
    });
});
