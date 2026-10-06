import { EventEmitter } from "eventemitter3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DebugTools, { DebugEnabled } from "./DebugTools";

// DebugTools reaches the emitter panel, which needs a browser's pixi and the asset factory; neither is used here.
vi.mock("pixi.js", () => ({ Texture: class {} }));
vi.mock("../loading/AssetFactory", () => ({ default: { inst: {} } }));

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

describe("Emitter", () => {
    const emitter = { name: "an emitter" } as never;

    it("opens the panel for the emitter, and registers closing it with the component", () => {
        const close = vi.fn();
        const open = vi.fn(() => close);
        const own = vi.fn();

        const returned = new DebugTools(own, () => true, open).Emitter(emitter, { label: "fire" });

        expect(open).toHaveBeenCalledTimes(1);
        expect(open).toHaveBeenCalledWith(emitter, { label: "fire" });
        expect(returned).toBe(close);
        expect(own).toHaveBeenCalledWith(close);
    });

    it("tells the panel how big the game's screen is, unless the caller says otherwise", () => {
        const open = vi.fn(() => () => undefined);
        const tools = new DebugTools(() => undefined, () => true, open, () => ({ width: 800, height: 600 }));

        tools.Emitter(emitter);
        tools.Emitter(emitter, { label: "x" });
        tools.Emitter(emitter, { screen: { width: 1, height: 2 } });

        expect(open).toHaveBeenNthCalledWith(1, emitter, { screen: { width: 800, height: 600 } });
        expect(open).toHaveBeenNthCalledWith(2, emitter, { screen: { width: 800, height: 600 }, label: "x" });
        expect(open).toHaveBeenNthCalledWith(3, emitter, { screen: { width: 1, height: 2 } });
    });

    it("takes several emitters made from one config", () => {
        const open = vi.fn(() => () => undefined);
        const torches = [emitter, emitter, emitter];

        new DebugTools(() => undefined, () => true, open).Emitter(torches, { label: "torches" });

        expect(open).toHaveBeenCalledWith(torches, { label: "torches" });
    });

    it("does nothing in a production build: no panel, nothing to clean up, and one warning", () => {
        const open = vi.fn(() => () => undefined);
        const own = vi.fn();
        const tools = new DebugTools(own, () => false, open);

        const close = tools.Emitter(emitter);
        tools.Emitter(emitter);

        expect(open).not.toHaveBeenCalled();
        expect(own).not.toHaveBeenCalled();
        expect(() => close()).not.toThrow();
        expect(warn).toHaveBeenCalledTimes(1);
    });
});
