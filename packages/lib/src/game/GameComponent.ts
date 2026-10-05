import {Container} from "pixi.js";
import AssetFactory from "../loading/AssetFactory";
import DebugTools, { DebugEnabled } from "./DebugTools";
import Game from "./Game";

/** What `Listen` needs of an event source: eventemitter3's `on`/`off` - `game.dispatcher`, `game.keyboard`, a Pixi display object. */
export interface IEmitter {
    on(event: string, fn: (...args: any[]) => void, context?: any): unknown;
    off(event: string, fn?: (...args: any[]) => void, context?: any): unknown;
}

/**
 * A scene, or a piece of one. Its life is driven explicitly by its owner - `SceneManager` for a
 * scene, the component that `Attach`ed it for a child - never by Pixi's `added`/`removed` events:
 *
 * - construct - the constructor: fields only, no scene graph and no subscriptions.
 * - `OnInitialise` - once, when the scene is added to the `SceneManager` (a child: when attached to
 *   an initialised owner). Build the display, `Attach` children, register subscriptions.
 * - `OnShow` / `OnHide` - each time the scene goes on / leaves the stage. Reset what a visit
 *   changed on show, stop on hide.
 * - `OnDestroy` - once, when the scene is removed. Everything registered through `Own`, `Listen`
 *   and `Attach` is released after it, and `root` is destroyed.
 *
 * Initialise and Show run owner first, then children in attach order; Hide and Destroy run
 * children first, in reverse, then the owner.
 *
 * Two helpers tie something to the component's life, for two different lifetimes:
 *
 * - `Own(dispose)` - cleanup for something that lives as long as the component: `dispose` is
 *   stored now and called once, when the component is destroyed. (`Listen` is built on it.)
 * - `WhileShown(on, off)` - something that runs only while the component is on the stage: `on`
 *   at every Show, `off` at every Hide. (`Tick` and `ListenWhileShown` are built on it.)
 */
export default abstract class GameComponent {
    public root = new Container();

    protected game: Game;
    protected assetFactory: AssetFactory;

    private initialised = false;
    private shown = false;
    private destroyed = false;
    private children: GameComponent[] = [];
    private disposers: (() => void)[] = [];
    private shownBindings: {on: () => void; off: () => void}[] = [];
    private debugTools: DebugTools | undefined;

    constructor() {
        this.game = Game.inst;
        this.assetFactory = AssetFactory.inst;
    }

    // Driven by the owner (SceneManager, or the component that attached this one). Each is a no-op when repeated.

    Initialise(): void {
        if (this.initialised || this.destroyed) {
            return;
        }
        this.initialised = true;
        this.OnInitialise();
        // Children attached before this one was initialised.
        this.children.forEach(child => child.Initialise());
    }

    Show(): void {
        this.Initialise();
        if (this.shown || this.destroyed) {
            return;
        }
        this.shown = true;
        this.shownBindings.forEach(binding => binding.on());
        this.OnShow();
        this.children.forEach(child => child.Show());
    }

    Hide(): void {
        if (!this.shown) {
            return;
        }
        this.shown = false;
        for (let i = this.children.length - 1; i >= 0; i--) {
            this.children[i].Hide();
        }
        this.OnHide();
        for (let i = this.shownBindings.length - 1; i >= 0; i--) {
            this.shownBindings[i].off();
        }
    }

    Destroy(): void {
        if (this.destroyed) {
            return;
        }
        this.Hide();
        this.destroyed = true;
        for (let i = this.children.length - 1; i >= 0; i--) {
            this.children[i].Destroy();
        }
        this.children = [];
        if (this.initialised) {
            this.OnDestroy();
        }
        for (let i = this.disposers.length - 1; i >= 0; i--) {
            this.disposers[i]();
        }
        this.disposers = [];
        this.shownBindings = [];
        this.root.destroy({children: true});
    }

    /**
     * Makes `child` part of this component: its root goes into `into` (this root by default), and it
     * is initialised, shown, hidden and destroyed with this one.
     */
    Attach<T extends GameComponent>(child: T, into: Container = this.root): T {
        into.addChild(child.root);
        this.children.push(child);
        if (this.initialised) {
            child.Initialise();
            if (this.shown) {
                child.Show();
            }
        }
        return child;
    }

    protected OnInitialise(): void {
        // override: build the display, attach children, subscribe
    }
    protected OnShow(): void {
        // override: reset what a visit changed, start
    }
    protected OnHide(): void {
        // override: stop
    }
    protected OnDestroy(): void {
        // override: release what isn't covered by Own/Listen/Attach
    }

    /**
     * Says "this component owns this thing - let go of it when the component is destroyed".
     * Nothing is released now: `dispose` is only stored, and called once from `Destroy`, after
     * `OnDestroy`, last registered first - whether or not the component was ever initialised.
     * It takes any `() => void`: unsubscribe, cancel a timer or tween, destroy an emitter,
     * release a bundle handle...
     *
     *     const sparks = new Emitter(this.root, textures, config);
     *     this.Own(() => sparks.destroy());   // runs when this component is destroyed, not here
     *
     * It does what the same line in `OnDestroy` would, but sits beside the code that creates the
     * thing, so the two can't drift apart. For something that should stop and start with each
     * Hide and Show rather than once at the end, use `WhileShown`.
     */
    protected Own(dispose: () => void): void {
        this.disposers.push(dispose);
    }

    /**
     * For something that should run only while this component is on the stage: `on` now if it is
     * shown, and again at every Show from here; `off` at every Hide. `Destroy` hides first, so
     * `off` runs then too. (`Tick` and `ListenWhileShown` are this, for a ticker callback and a
     * subscription.) For something that lasts as long as the component, use `Own`.
     */
    protected WhileShown(on: () => void, off: () => void): void {
        this.shownBindings.push({on, off});
        if (this.shown) {
            on();
        }
    }

    /** Subscribes `fn` (called with this component as `this`) until this component is destroyed. */
    protected Listen(emitter: IEmitter, event: string, fn: (...args: any[]) => void): void {
        emitter.on(event, fn, this);
        this.Own(() => emitter.off(event, fn, this));
    }

    /** Subscribes `fn` only while this component is shown - so it needs no "am I showing" guard. */
    protected ListenWhileShown(emitter: IEmitter, event: string, fn: (...args: any[]) => void): void {
        this.WhileShown(() => emitter.on(event, fn, this), () => emitter.off(event, fn, this));
    }

    /** Calls `fn` (with this component as `this`) every frame, only while this component is shown. */
    protected Tick(fn: (dt: number) => void): void {
        this.WhileShown(() => this.game.ticker.add(fn, this), () => this.game.ticker.remove(fn, this));
    }

    /**
     * Development helpers for this component, such as `this.debug.Drag(sprite)` to position something by dragging it
     * (see `DebugTools`). Made on first use; whatever a helper starts stops when this component is destroyed. They work
     * in development builds only (`assets.IsDev`) - in a production build they do nothing - so take the calls out
     * before shipping.
     */
    protected get debug(): DebugTools {
        return this.debugTools || (this.debugTools = new DebugTools(dispose => this.Own(dispose), () => DebugEnabled(this.game.assets)));
    }

    /** @deprecated Attach the child to its owner instead (`owner.Attach(child)`), which doesn't need to know the scene's name. */
    protected AddToScene(id: string): void {
        this.game.sceneManager.GetScene(id).Attach(this);
    }
}
