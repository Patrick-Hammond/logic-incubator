import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEVEL_CREATED } from "../Events";
import type { Camera } from "./Camera";
import Effects from "./Effects";

// A hand-cranked game: a ticker whose frames the tests run, and a dispatcher.
const game = vi.hoisted(() => {
    const listeners: { fn: () => void; context: unknown }[] = [];
    const handlers = new Map<string, { fn: (...args: unknown[]) => void; context: unknown }[]>();
    return {
        ticker: {
            deltaMS: 16,
            add: (fn: () => void, context: unknown) => listeners.push({ fn, context }),
            remove: (fn: () => void, context: unknown) => {
                const i = listeners.findIndex(l => l.fn === fn && l.context === context);
                if (i >= 0) {
                    listeners.splice(i, 1);
                }
            },
            /** One frame of `ms`. */
            frame(ms: number) {
                this.deltaMS = ms;
                listeners.slice().forEach(l => l.fn.call(l.context));
            },
            listeners,
        },
        dispatcher: {
            on: (event: string, fn: (...args: unknown[]) => void, context: unknown) => {
                handlers.set(event, (handlers.get(event) || []).concat({ fn, context }));
            },
            off: (event: string, fn: (...args: unknown[]) => void, context: unknown) => {
                handlers.set(event, (handlers.get(event) || []).filter(h => h.fn !== fn || h.context !== context));
            },
            emit: (event: string, ...args: unknown[]) => (handlers.get(event) || []).forEach(h => h.fn.apply(h.context, args)),
        },
    };
});

const loaded = vi.hoisted(() => new Set<string>(["dust"]));

// What Emitter shows to Effects: where it was made, the settings it was given, and what was done to it.
const fake = vi.hoisted(() => {
    class FakeEmitter {
        static created: FakeEmitter[] = [];
        parent: unknown;
        emit = true;
        autoUpdate = true; // as if the config asked for it
        particleCount = 0;
        owner = { x: NaN, y: NaN };
        updates: number[] = [];
        destroyCalls = 0;
        constructor(public container: unknown, public textures: unknown, public config: unknown) {
            this.parent = container;
            FakeEmitter.created.push(this);
        }
        updateOwnerPos(x: number, y: number): void {
            this.owner = { x, y };
        }
        update(seconds: number): void {
            this.updates.push(seconds);
        }
        destroy(): void {
            this.destroyCalls++;
            this.parent = null;
        }
    }
    return { FakeEmitter };
});

vi.mock("pixi.js", () => {
    class Point {
        x = 0;
        y = 0;
        set(x: number, y = x): void {
            this.x = x;
            this.y = y;
        }
    }
    class Container {
        name = "";
        interactiveChildren = true;
        scale = new Point();
        position = new Point();
        parent: Container | null = null;
        children: Container[] = [];
        addChild(child: Container): Container {
            child.parent?.removeChild(child);
            child.parent = this;
            this.children.push(child);
            return child;
        }
        removeChild(child: Container): void {
            this.children = this.children.filter(c => c !== child);
            child.parent = null;
        }
        destroy(): void {
            this.parent?.removeChild(this);
        }
    }
    return { Container };
});
vi.mock("@logic-incubator/lib/game/Game", () => ({ default: { inst: game } }));
vi.mock("@logic-incubator/lib/loading/AssetFactory", () => ({
    default: { inst: { Has: (name: string) => loaded.has(name), CreateTextures: (name: string) => [name + ".f1", name + ".f2"] } },
}));
vi.mock("@logic-incubator/lib/particles", () => ({ Emitter: fake.FakeEmitter }));

type FakeEmitter = InstanceType<typeof fake.FakeEmitter>;

/** The bits of a Camera that Effects reads. A 30 x 20 tile view centred on (20, 10), drawn at 2x. */
function MakeCamera(root: object, zoom = 1): Camera {
    return { root, ViewRect: { center: { x: 20, y: 10 } }, BaseViewWidth: 30, BaseViewHeight: 20, Scale: 2, EffectiveZoom: zoom } as unknown as Camera;
}

const config = { lifetime: { min: 1, max: 1 }, frequency: 0.1, pos: { x: 0, y: 0 } };

let effects: Effects;
let cameraRoot: { addChild(child: unknown): unknown; children: unknown[] };
let camera: Camera;

/** The emitter `Play` has just made - the most recent one. */
const last = (): FakeEmitter => fake.FakeEmitter.created[fake.FakeEmitter.created.length - 1];

beforeEach(async () => {
    fake.FakeEmitter.created.length = 0;
    game.ticker.listeners.length = 0;
    loaded.clear();
    loaded.add("dust");
    const { Container } = await import("pixi.js");
    cameraRoot = new Container() as unknown as typeof cameraRoot;
    camera = MakeCamera(cameraRoot);
    effects = new Effects(camera);
    effects.Show();
});

afterEach(() => {
    effects.Destroy(); // so it stops listening on the shared dispatcher
    vi.restoreAllMocks();
});

describe("Play", () => {
    it("starts an emitter on the effects layer, at the position, with the art's textures and the config", () => {
        const emitter = effects.Play("dust", config, 120, 64) as unknown as FakeEmitter;

        expect(emitter).toBe(last());
        expect(emitter.container).toBe(effects.root);
        expect(emitter.textures).toEqual(["dust.f1", "dust.f2"]);
        expect(emitter.config).toBe(config);
        expect(emitter.owner).toEqual({ x: 120, y: 64 });
    });

    it("takes the emitter off any ticker, so that Effects alone updates it", () => {
        const emitter = effects.Play("dust", config, 0, 0) as unknown as FakeEmitter;

        expect(emitter.autoUpdate).toBe(false);
    });

    it("skips art that isn't loaded, warning once per name", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

        expect(effects.Play("nope", config, 0, 0)).toBeUndefined();
        expect(effects.Play("nope", config, 0, 0)).toBeUndefined();
        expect(effects.Play("also_nope", config, 0, 0)).toBeUndefined();

        expect(fake.FakeEmitter.created).toHaveLength(0);
        expect(warn).toHaveBeenCalledTimes(2);
        expect(warn.mock.calls[0][0]).toContain('"nope"');
    });
});

describe("each frame", () => {
    it("updates every emitter by the frame's time in seconds", () => {
        effects.Play("dust", config, 0, 0);
        effects.Play("dust", config, 0, 0);
        game.ticker.frame(20);
        game.ticker.frame(10);

        fake.FakeEmitter.created.forEach(e => expect(e.updates).toEqual([0.02, 0.01]));
    });

    it("runs only while the scene is shown", () => {
        effects.Play("dust", config, 0, 0);
        effects.Hide();
        game.ticker.frame(16);
        expect(last().updates).toEqual([]);

        effects.Show();
        game.ticker.frame(16);
        expect(last().updates).toEqual([0.016]);
    });

    it("places the layer as EntityRenderer places the entities layer: scaled by the camera, shifted by the view origin", () => {
        game.ticker.frame(16);

        // 30 x 20 tiles centred on (20, 10) start at tile (5, 0); 16 px a tile, drawn at 2x.
        expect(effects.root.scale.x).toBe(2);
        expect(effects.root.scale.y).toBe(2);
        expect(effects.root.position.x).toBe(-5 * 16 * 2);
        expect(effects.root.position.y).toBeCloseTo(0, 9); // (-0 for an origin of 0)
    });

    it("follows the camera's zoom", () => {
        const zoomed = new Effects(MakeCamera(cameraRoot, 2));
        zoomed.Show();
        game.ticker.frame(16);

        // Zoomed 2x the window is 15 x 10 tiles, starting at (12.5, 5).
        expect(zoomed.root.scale.x).toBe(4);
        expect(zoomed.root.position.x).toBe(-12.5 * 16 * 4);
        expect(zoomed.root.position.y).toBe(-5 * 16 * 4);
        zoomed.Destroy();
    });

    it("destroys an emitter once it has stopped emitting and run out of particles - and not before", () => {
        const burst = effects.Play("dust", config, 0, 0) as unknown as FakeEmitter;
        const stopping = effects.Play("dust", config, 0, 0) as unknown as FakeEmitter;
        const torch = effects.Play("dust", config, 0, 0) as unknown as FakeEmitter;
        burst.emit = false;
        stopping.emit = false;
        stopping.particleCount = 3;
        torch.particleCount = 7;

        game.ticker.frame(16);

        expect(burst.destroyCalls).toBe(1);
        expect(stopping.destroyCalls).toBe(0); // its last particles are still flying
        expect(torch.destroyCalls).toBe(0); // still emitting

        stopping.particleCount = 0;
        torch.emit = false;
        torch.particleCount = 0;
        game.ticker.frame(16);

        expect(stopping.destroyCalls).toBe(1);
        expect(torch.destroyCalls).toBe(1);
        expect(burst.updates).toHaveLength(1); // not updated again once gone
    });

    it("lets go of an emitter its caller destroyed, without destroying it again", () => {
        const emitter = effects.Play("dust", config, 0, 0) as unknown as FakeEmitter;
        emitter.destroy();

        game.ticker.frame(16);
        game.ticker.frame(16);

        expect(emitter.destroyCalls).toBe(1);
        expect(emitter.updates).toHaveLength(1);
    });
});

describe("level", () => {
    it("drops the level's effects when a new level is created", () => {
        effects.Play("dust", config, 0, 0);
        effects.Play("dust", config, 0, 0);

        game.dispatcher.emit(LEVEL_CREATED);

        fake.FakeEmitter.created.forEach(e => expect(e.destroyCalls).toBe(1));
        game.ticker.frame(16);
        fake.FakeEmitter.created.forEach(e => expect(e.updates).toEqual([]));
    });

    it("goes back on top of the camera's layers, which TileMapView has just added", async () => {
        const { Container } = await import("pixi.js");
        cameraRoot.addChild(effects.root);
        cameraRoot.addChild(new Container()); // a band
        cameraRoot.addChild(new Container()); // the entities layer
        expect(cameraRoot.children[cameraRoot.children.length - 1]).not.toBe(effects.root);

        game.dispatcher.emit(LEVEL_CREATED);

        expect(cameraRoot.children[cameraRoot.children.length - 1]).toBe(effects.root);
        expect(cameraRoot.children.filter(c => c === effects.root)).toHaveLength(1);
    });

    it("leaves the layer non-interactive", () => {
        expect(effects.root.interactiveChildren).toBe(false);
    });
});

describe("destroy", () => {
    it("destroys its emitters, stops updating, and plays nothing more", () => {
        const emitter = effects.Play("dust", config, 0, 0) as unknown as FakeEmitter;

        effects.Destroy();

        expect(emitter.destroyCalls).toBe(1);
        expect(game.ticker.listeners).toHaveLength(0);
        expect(effects.Play("dust", config, 0, 0)).toBeUndefined();
    });
});
