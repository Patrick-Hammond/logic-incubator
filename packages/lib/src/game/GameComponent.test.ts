import { EventEmitter } from "eventemitter3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GameComponent, { IEmitter } from "./GameComponent";

// A hand-cranked stand-in for game.ticker.
const ticker = vi.hoisted(() => {
    const listeners = new Set<() => void>();
    return {
        listeners,
        add: (fn: () => void) => listeners.add(fn),
        remove: (fn: () => void) => listeners.delete(fn),
    };
});

vi.mock("pixi.js", () => {
    class Container {
        name = "";
        interactive = false;
        interactiveChildren = true;
        parent: Container | null = null;
        children: Container[] = [];
        destroyed = false;
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
            this.destroyed = true;
        }
    }
    return { Container };
});
// What `game.assets` says about the build: no manifest loaded, as in a game that doesn't use one.
const assets = vi.hoisted(() => ({ IsReady: false, IsDev: false }));

vi.mock("./Game", () => ({ default: { inst: { ticker, assets } } }));
vi.mock("../loading/AssetFactory", () => ({ default: { inst: {} } }));

/** Records every hook into a shared log, tagged with its own name. */
class Probe extends GameComponent {
    constructor(private name: string, private log: string[]) {
        super();
    }
    protected OnInitialise(): void {
        this.log.push(this.name + ".init");
    }
    protected OnShow(): void {
        this.log.push(this.name + ".show");
    }
    protected OnHide(): void {
        this.log.push(this.name + ".hide");
    }
    protected OnDestroy(): void {
        this.log.push(this.name + ".destroy");
    }
    // Exposed for the tests.
    own(fn: () => void) {
        this.Own(fn);
    }
    tick(fn: () => void) {
        this.Tick(fn);
    }
    listen(emitter: IEmitter, event: string, fn: () => void) {
        this.Listen(emitter, event, fn);
    }
    listenWhileShown(emitter: IEmitter, event: string, fn: () => void) {
        this.ListenWhileShown(emitter, event, fn);
    }
    attach<T extends GameComponent>(child: T) {
        return this.Attach(child);
    }
    getDebug() {
        return this.debug;
    }
}

let log: string[];
beforeEach(() => {
    log = [];
    ticker.listeners.clear();
    assets.IsReady = false;
    assets.IsDev = false;
});

describe("hooks", () => {
    it("run initialise once, then show/hide on every visit, then destroy once", () => {
        const c = new Probe("c", log);
        c.Initialise();
        c.Initialise();
        c.Show();
        c.Show();
        c.Hide();
        c.Hide();
        c.Show();
        c.Destroy();
        c.Destroy();
        expect(log).toEqual(["c.init", "c.show", "c.hide", "c.show", "c.hide", "c.destroy"]);
    });

    it("Show initialises a component that hasn't been yet", () => {
        const c = new Probe("c", log);
        c.Show();
        expect(log).toEqual(["c.init", "c.show"]);
    });

    it("do nothing once destroyed", () => {
        const c = new Probe("c", log);
        c.Initialise();
        c.Destroy();
        log.length = 0;
        c.Initialise();
        c.Show();
        c.Hide();
        c.Destroy();
        expect(log).toEqual([]);
    });

    it("destroying an uninitialised component skips OnDestroy but still destroys its root", () => {
        const c = new Probe("c", log);
        c.Destroy();
        expect(log).toEqual([]);
        expect((c.root as unknown as { destroyed: boolean }).destroyed).toBe(true);
    });
});

describe("Attach", () => {
    it("initialises a child attached during OnInitialise straight away, after the owner's own", () => {
        class Owner extends Probe {
            protected OnInitialise(): void {
                super.OnInitialise();
                this.Attach(new Probe("child", log));
                log.push("owner.initialised");
            }
        }
        new Owner("owner", log).Initialise();
        expect(log).toEqual(["owner.init", "child.init", "owner.initialised"]);
    });

    it("initialises a child attached before the owner was initialised along with the owner", () => {
        const owner = new Probe("owner", log);
        owner.attach(new Probe("child", log));
        expect(log).toEqual([]);
        owner.Initialise();
        expect(log).toEqual(["owner.init", "child.init"]);
    });

    it("shows a child attached to an owner that's already showing", () => {
        const owner = new Probe("owner", log);
        owner.Show();
        log.length = 0;
        owner.attach(new Probe("child", log));
        expect(log).toEqual(["child.init", "child.show"]);
    });

    it("doesn't show a child while its owner is hidden", () => {
        const owner = new Probe("owner", log);
        owner.Initialise();
        owner.attach(new Probe("child", log));
        expect(log).toEqual(["owner.init", "child.init"]);
    });

    it("puts the child's root in the owner's, or wherever it's told", () => {
        const owner = new Probe("owner", log);
        const child = owner.attach(new Probe("child", log));
        expect(child.root.parent).toBe(owner.root);
    });

    it("shows owner then children in order, hides and destroys children (last first) then owner", () => {
        const owner = new Probe("owner", log);
        owner.attach(new Probe("a", log));
        owner.attach(new Probe("b", log));
        owner.Show();
        owner.Hide();
        owner.Show();
        owner.Destroy();
        expect(log).toEqual([
            "owner.init", "a.init", "b.init",
            "owner.show", "a.show", "b.show",
            "b.hide", "a.hide", "owner.hide",
            "owner.show", "a.show", "b.show",
            // Destroy hides first.
            "b.hide", "a.hide", "owner.hide",
            "b.destroy", "a.destroy", "owner.destroy"
        ]);
    });
});

describe("Own", () => {
    it("runs disposers on destroy, last registered first, after OnDestroy", () => {
        const c = new Probe("c", log);
        c.own(() => log.push("first"));
        c.own(() => log.push("second"));
        c.Initialise();
        c.Destroy();
        expect(log).toEqual(["c.init", "c.destroy", "second", "first"]);
    });
});

describe("Tick", () => {
    it("runs only while the component is shown", () => {
        const c = new Probe("c", log);
        const fn = () => undefined;
        c.tick(fn);
        expect(ticker.listeners.has(fn)).toBe(false);
        c.Show();
        expect(ticker.listeners.has(fn)).toBe(true);
        c.Hide();
        expect(ticker.listeners.has(fn)).toBe(false);
        c.Show();
        expect(ticker.listeners.has(fn)).toBe(true);
        c.Destroy();
        expect(ticker.listeners.has(fn)).toBe(false);
    });

    it("starts at once when registered while already showing", () => {
        const c = new Probe("c", log);
        c.Show();
        const fn = () => undefined;
        c.tick(fn);
        expect(ticker.listeners.has(fn)).toBe(true);
    });
});

describe("Listen", () => {
    it("stays subscribed across hide and show, and stops on destroy", () => {
        const emitter = new EventEmitter();
        const c = new Probe("c", log);
        c.listen(emitter, "ping", () => log.push("ping"));
        c.Show();
        c.Hide();
        emitter.emit("ping");
        c.Destroy();
        emitter.emit("ping");
        expect(log.filter(entry => entry === "ping")).toHaveLength(1);
        expect(emitter.listenerCount("ping")).toBe(0);
    });

    it("calls the handler with the component as this", () => {
        const emitter = new EventEmitter();
        const c = new Probe("c", log);
        const handler = vi.fn();
        c.listen(emitter, "ping", handler);
        emitter.emit("ping");
        expect(handler.mock.contexts[0]).toBe(c);
    });
});

describe("ListenWhileShown", () => {
    it("is subscribed only between show and hide", () => {
        const emitter = new EventEmitter();
        const c = new Probe("c", log);
        c.listenWhileShown(emitter, "ping", () => log.push("ping"));
        emitter.emit("ping");
        c.Show();
        emitter.emit("ping");
        c.Hide();
        emitter.emit("ping");
        c.Show();
        emitter.emit("ping");
        c.Destroy();
        emitter.emit("ping");
        expect(log.filter(entry => entry === "ping")).toHaveLength(2);
        expect(emitter.listenerCount("ping")).toBe(0);
    });
});

describe("debug", () => {
    /** The least of a display object that `DebugTools.Drag` touches. */
    function FakeObject() {
        return Object.assign(new EventEmitter(), { interactive: false, cursor: "", name: "", x: 0, y: 0, parent: null as unknown });
    }

    it("is one helper per component, made on first use", () => {
        const c = new Probe("c", log);

        expect(c.getDebug()).toBe(c.getDebug());
        expect(c.getDebug()).not.toBe(new Probe("other", log).getDebug());
    });

    it("stops what it started when the component is destroyed", () => {
        const c = new Probe("c", log);
        const object = FakeObject();

        c.getDebug().Drag(object as never);
        expect(object.interactive).toBe(true);
        expect(object.listenerCount("pointerdown")).toBe(1);

        c.Destroy();

        expect(object.interactive).toBe(false);
        expect(object.listenerCount("pointerdown")).toBe(0);
    });

    it("works in a development build, and in a game that loaded no manifest", () => {
        const c = new Probe("c", log);
        const dev = FakeObject();
        const noManifest = FakeObject();

        assets.IsReady = true;
        assets.IsDev = true;
        c.getDebug().Drag(dev as never);
        assets.IsReady = false;
        assets.IsDev = false;
        c.getDebug().Drag(noManifest as never);

        expect(dev.interactive).toBe(true);
        expect(noManifest.interactive).toBe(true);
    });

    it("does nothing in a production build - a manifest built with --production - and says so once", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const c = new Probe("c", log);
        const object = FakeObject();
        assets.IsReady = true;
        assets.IsDev = false;

        c.getDebug().Drag(object as never);
        c.getDebug().Drag(object as never);

        expect(object.interactive).toBe(false);
        expect(object.listenerCount("pointerdown")).toBe(0);
        expect(warn).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });

    it("lets a drag be stopped before the component goes, and then leaves it stopped", () => {
        const c = new Probe("c", log);
        const object = FakeObject();

        const stop = c.getDebug().Drag(object as never);
        stop();
        expect(object.listenerCount("pointerdown")).toBe(0);

        expect(() => c.Destroy()).not.toThrow(); // stopping again at destroy is harmless
        expect(object.interactive).toBe(false);
    });
});
