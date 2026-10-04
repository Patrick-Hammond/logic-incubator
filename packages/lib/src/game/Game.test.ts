import * as ScreenFull from "screenfull";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Game from "./Game";

// Everything Game puts together is mocked: these tests are about what it tears down, and in what order.
const calls = vi.hoisted(() => [] as string[]);
const pixi = vi.hoisted(() => ({ destroyArgs: [] as unknown[] }));

vi.mock("pixi.js", async () => {
    const { EventEmitter } = await import("eventemitter3");
    class Application {
        stage = { name: "" };
        view = {};
        renderer = { plugins: { interaction: new EventEmitter() } };
        constructor(public options: unknown) {}
        destroy(...args: unknown[]): void {
            calls.push("pixi");
            pixi.destroyArgs = args;
        }
    }
    return {
        Application,
        settings: {},
        SCALE_MODES: { NEAREST: 0 },
        utils: { destroyTextureCache: () => calls.push("textures") },
        UPDATE_PRIORITY: { UTILITY: -50 },
    };
});
vi.mock("screenfull", () => ({ isEnabled: true, request: vi.fn() }));
vi.mock("../io/Keyboard", () => ({ default: class { Destroy = () => calls.push("keyboard"); } }));
vi.mock("../io/GamePad", () => ({ default: class { Destroy = () => calls.push("gamepad"); } }));
vi.mock("./SceneManager", () => ({ default: class { Destroy = () => calls.push("scenes"); } }));
vi.mock("../assets/PixiAssets", () => ({ CreateAssets: () => ({ Destroy: () => calls.push("bundles") }) }));
vi.mock("../loading/AssetFactory", () => ({ default: { Destroy: () => calls.push("assets") } }));
vi.mock("../utils/StatsTicker", () => ({ StatsTicker: class {} }));

let win: { onresize: unknown };
/** `document.documentElement`: given a field of its own so a deep-equal match can't mistake it for the mocked canvas, also `{}`. */
const page = { tagName: "HTML" };

beforeEach(() => {
    calls.length = 0;
    vi.mocked(ScreenFull.request).mockClear();
    pixi.destroyArgs = [];
    win = { onresize: null };
    vi.stubGlobal("window", win);
    vi.stubGlobal("document", { body: { appendChild: () => undefined }, documentElement: page });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

const makeGame = (fullscreen = false) => new Game({ fit: "none", fullscreen });

function fullscreenListeners(game: Game): number {
    return (game.interactionManager as unknown as { listenerCount(event: string): number }).listenerCount("pointerdown");
}

describe("Game fullscreen", () => {
    it("goes fullscreen on the first click, as the whole page rather than the canvas, so the DOM UI over the canvas stays visible", () => {
        const game = makeGame(true);
        expect(ScreenFull.request).not.toHaveBeenCalled();
        game.interactionManager.emit("pointerdown");
        expect(ScreenFull.request).toHaveBeenCalledTimes(1);
        expect(ScreenFull.request).toHaveBeenCalledWith(page);
        expect(ScreenFull.request).not.toHaveBeenCalledWith(game.view);
    });

    it("asks only once, however many clicks follow", () => {
        const game = makeGame(true);
        game.interactionManager.emit("pointerdown");
        game.interactionManager.emit("pointerdown");
        expect(ScreenFull.request).toHaveBeenCalledTimes(1);
    });

    it("doesn't ask when the option is off", () => {
        const game = makeGame();
        game.interactionManager.emit("pointerdown");
        expect(ScreenFull.request).not.toHaveBeenCalled();
    });
});

describe("Game.destroy", () => {
    it("tears down in the order each part can rely on the next: scenes, input, asset bundles, shared registry, textures, then Pixi's own", () => {
        makeGame().destroy();
        expect(calls).toEqual(["scenes", "keyboard", "gamepad", "bundles", "assets", "textures", "pixi"]);
    });

    it("takes the canvas off the page by default, and hands stage options on to Pixi", () => {
        makeGame().destroy();
        expect(pixi.destroyArgs).toEqual([true, undefined]);

        const options = { children: true };
        makeGame().destroy(false, options);
        expect(pixi.destroyArgs).toEqual([false, options]);
    });

    it("clears the window's resize handler it installed", () => {
        const game = makeGame();
        expect(win.onresize).toBeTypeOf("function");
        game.destroy();
        expect(win.onresize).toBeNull();
    });

    it("leaves a resize handler someone else has installed since", () => {
        const game = makeGame();
        const theirs = () => undefined;
        win.onresize = theirs;
        game.destroy();
        expect(win.onresize).toBe(theirs);
    });

    it("takes back its fullscreen-on-first-click listener", () => {
        const game = makeGame(true);
        expect(fullscreenListeners(game)).toBe(1);
        game.destroy();
        expect(fullscreenListeners(game)).toBe(0);
    });

    it("stops everyone listening on its dispatcher", () => {
        const game = makeGame();
        game.dispatcher.on("anything", () => undefined);
        game.destroy();
        expect(game.dispatcher.listenerCount("anything")).toBe(0);
    });

    it("reports itself destroyed, so async boot code can stop", () => {
        const game = makeGame();
        expect(game.Destroyed).toBe(false);
        game.destroy();
        expect(game.Destroyed).toBe(true);
    });

    it("clears Game.inst, so a new Game can be made", () => {
        const game = makeGame();
        expect(Game.inst).toBe(game);
        game.destroy();
        expect(Game.inst).toBeUndefined();
    });

    it("leaves Game.inst alone if a newer Game has replaced it", () => {
        const older = makeGame();
        const newer = makeGame();
        older.destroy();
        expect(Game.inst).toBe(newer);
    });

    it("does it all once, however many times it's called", () => {
        const game = makeGame();
        game.destroy();
        calls.length = 0;
        game.destroy();
        expect(calls).toEqual([]);
    });
});
