import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Keyboard from "./Keyboard";

// Timing pulls in pixi.js, which wants a browser; Keyboard only uses its Wait.
const cancelWait = vi.hoisted(() => vi.fn());
vi.mock("../game/Timing", () => ({ Wait: vi.fn(() => cancelWait) }));

type KeyHandler = (ev: { type: string; keyCode: number }) => void;

let doc: { onkeydown: unknown; onkeyup: unknown };

beforeEach(() => {
    doc = { onkeydown: null, onkeyup: null };
    vi.stubGlobal("document", doc);
    cancelWait.mockClear();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

const key = (type: "keydown" | "keyup", keyCode: number) => (doc.onkeydown as KeyHandler)({ type, keyCode });

describe("Keyboard", () => {
    it("takes over the document's key events, tracks what's held and emits each event", () => {
        const keyboard = new Keyboard();
        const seen: string[] = [];
        keyboard.on("keydown", (e: { keyCode: number }) => seen.push("down " + e.keyCode));

        key("keydown", 65);
        expect(keyboard.KeyPressed(65)).toBe(true);
        expect(keyboard.AnyKeyPressed()).toBe(true);
        key("keyup", 65);
        expect(keyboard.AnyKeyPressed()).toBe(false);
        expect(seen).toEqual(["down 65"]);
    });
});

describe("Keyboard.Destroy", () => {
    it("lets go of the document's key events", () => {
        const keyboard = new Keyboard();
        keyboard.Destroy();
        expect(doc.onkeydown).toBeNull();
        expect(doc.onkeyup).toBeNull();
    });

    it("leaves alone handlers a newer keyboard has taken over since", () => {
        const older = new Keyboard();
        const newer = new Keyboard();
        const newerHandler = doc.onkeydown;
        older.Destroy();
        expect(doc.onkeydown).toBe(newerHandler);
        expect(doc.onkeyup).toBe(newerHandler);
        newer.Destroy();
        expect(doc.onkeydown).toBeNull();
    });

    it("stops everyone listening on it, and forgets what was held", () => {
        const keyboard = new Keyboard();
        keyboard.on("keydown", () => undefined);
        key("keydown", 65);

        keyboard.Destroy();

        expect(keyboard.listenerCount("keydown")).toBe(0);
        expect(keyboard.KeyPressed(65)).toBeFalsy();
        expect(keyboard.AnyKeyPressed()).toBe(false);
    });

    it("cancels a key's pending min-time wait", () => {
        const keyboard = new Keyboard();
        key("keydown", 65);
        expect(keyboard.KeyPressedMinTime(500, 65)).toBe(true);

        keyboard.Destroy();

        expect(cancelWait).toHaveBeenCalledTimes(1);
    });

    it("is safe to call twice", () => {
        const keyboard = new Keyboard();
        keyboard.Destroy();
        expect(() => keyboard.Destroy()).not.toThrow();
    });
});
