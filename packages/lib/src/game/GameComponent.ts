import {Container} from "pixi.js";
import AssetFactory from "../loading/AssetFactory";
import DebugTools, { DebugEnabled } from "./DebugTools";
import Game from "./Game";
import type {Cancel} from "./Timing";

/** What `Listen` needs of an event source: eventemitter3's `on`/`off` - `game.dispatcher`, `game.keyboard`, a Pixi display object. */
export interface IEmitter {
    /**
     * Subscribes `fn` to `event`.
     * @param event - The event name.
     * @param fn - Called when the event is emitted, with the event's arguments.
     * @param context - What `this` is inside `fn`.
     */
    on(event: string, fn: (...args: any[]) => void, context?: any): unknown;
    /**
     * Unsubscribes `fn` from `event` - give the same `fn` and `context` that `on` was given.
     * @param event - The event name.
     * @param fn - The function to remove; leave it out to remove every listener of `event`.
     * @param context - The `context` it was subscribed with.
     */
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
 * - `OnDestroy` - once, when the scene is removed. Attached children are destroyed before it;
 *   everything registered through `Own` and `Listen` is released after it, and `root` is destroyed.
 *
 * Initialise and Show run owner first, then children in attach order; Hide and Destroy run
 * children first, in reverse, then the owner.
 *
 * Three helpers tie something to the component's life, for three different lifetimes:
 *
 * - `Own(dispose)` - cleanup for something that lives as long as the component: `dispose` is
 *   stored now and called once, when the component is destroyed. (`Listen` is built on it.)
 * - `WhileShown(on, off)` - something that runs only while the component is on the stage: `on`
 *   at every Show, `off` at every Hide. (`Tick` and `ListenWhileShown` are built on it.)
 * - `Track(cancel)` - something you start during a visit, such as a tween or a timer: it is
 *   cancelled if the component is hidden or destroyed before it finishes.
 */
export default abstract class GameComponent {
    /**
     * The component's display root: build its display in here. An attached child's root goes into it (or into the
     * `into` that `Attach` is given). Destroyed, with everything in it, when the component is destroyed.
     */
    public root = new Container();

    /** The running `Game` (`Game.inst`, taken when the component was made): its `ticker`, `dispatcher`, `keyboard`, `assets`, `sceneManager`... */
    protected game: Game;
    /** Makes sprites and animations by name (`AssetFactory.inst`, taken when the component was made). */
    protected assetFactory: AssetFactory;

    private initialised = false;
    private shown = false;
    private destroyed = false;
    private children: GameComponent[] = [];
    private disposers: (() => void)[] = [];
    private tracked: (() => void)[] = [];
    private shownBindings: {on: () => void; off: () => void}[] = [];
    private debugTools: DebugTools | undefined;

    /**
     * Fields only: no display objects and no subscriptions here - build those in `OnInitialise`. The `Game` must already
     * exist, as the component takes `Game.inst` now.
     */
    constructor() {
        this.game = Game.inst;
        this.assetFactory = AssetFactory.inst;
    }

    // Driven by the owner (SceneManager, or the component that attached this one). Each is a no-op when repeated.

    /**
     * Runs `OnInitialise` once, then initialises the children attached so far. Called by the owner - `SceneManager.AddScene`
     * for a scene, `Attach` for a child of an initialised owner - and by `Show`, so you rarely call it yourself. A no-op when
     * repeated, or after `Destroy`.
     */
    Initialise(): void {
        if (this.initialised || this.destroyed) {
            return;
        }
        this.initialised = true;
        this.OnInitialise();
        // Children attached before this one was initialised.
        this.children.forEach(child => child.Initialise());
    }

    /**
     * Puts the component to work: initialises it if that hasn't happened, starts what `WhileShown` (so `Tick` and
     * `ListenWhileShown`) registered, runs `OnShow`, then shows the children in attach order. Called by the owner each time
     * the component goes on the stage. A no-op if it is already shown, or after `Destroy`.
     */
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

    /**
     * Stops the component: hides the children (last attached first), runs `OnHide`, cancels what `Track` is holding, then
     * stops what `WhileShown` registered (last first). Called by the owner each time the component leaves the stage. A no-op
     * if it isn't shown.
     */
    Hide(): void {
        if (!this.shown) {
            return;
        }
        this.shown = false;
        for (let i = this.children.length - 1; i >= 0; i--) {
            this.children[i].Hide();
        }
        this.OnHide();
        this.CancelTracked();
        for (let i = this.shownBindings.length - 1; i >= 0; i--) {
            this.shownBindings[i].off();
        }
    }

    /**
     * Takes the component down, for good. In order: `Hide` (and anything `Track` still holds is cancelled); destroy the attached
     * children (last first); `OnDestroy` (if it was ever initialised); every cleanup registered with `Own` - and so every
     * `Listen` - last registered first; then destroy `root` and everything in it. Called by the owner when the component is
     * removed. A no-op when repeated.
     */
    Destroy(): void {
        if (this.destroyed) {
            return;
        }
        this.Hide();
        this.CancelTracked(); // what was tracked while the component wasn't shown
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
     * is initialised, shown, hidden and destroyed with this one. If this component is already initialised (or shown), the
     * child is initialised (or shown) at once. Children draw in the order they are attached.
     *
     * For *components* - pieces with their own logic and lifecycle (`OnInitialise`, `Tick`, `Listen`...), such as a HUD or a
     * world view - not for display objects: add a sprite, a container or a text with `this.root.addChild(...)`, and it is
     * destroyed with `root`. There is no way to detach a child, so it lives until this component is destroyed: don't attach
     * short-lived ones (a shot, a popup) over and over.
     *
     *     const world = this.Attach(new World());          // keep the reference it returns
     *     this.Attach(new Hud());                          // drawn over the world
     *
     * @param child - The component to attach.
     * @param into - The container its root is added to. Default: this component's `root`.
     * @returns `child`, so the owner can keep a reference to it.
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

    /**
     * Override: runs once, when the component is initialised. Build the display (into `root`), `Attach` children, and register
     * subscriptions and cleanups (`Listen`, `Own`, `Tick`...).
     */
    protected OnInitialise(): void {
        // override: build the display, attach children, subscribe
    }

    /**
     * Override: runs each time the component goes on the stage. Reset what a visit changed, and start things that only run
     * while it is visible. (What `WhileShown`, `Tick` and `ListenWhileShown` registered is started just before this.)
     */
    protected OnShow(): void {
        // override: reset what a visit changed, start
    }

    /**
     * Override: runs each time the component leaves the stage. Stop things that only run while it is visible. (What
     * `WhileShown`, `Tick` and `ListenWhileShown` registered is stopped just after this.)
     */
    protected OnHide(): void {
        // override: stop
    }

    /**
     * Override: runs once, when the component is destroyed - after its attached children, and only if it was ever initialised.
     * Release what isn't already covered by `Attach`, `Own` or `Listen`.
     */
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
     *
     * @param dispose - The cleanup to run when the component is destroyed.
     */
    protected Own(dispose: () => void): void {
        this.disposers.push(dispose);
    }

    /**
     * For something that should run only while this component is on the stage: `on` now if it is
     * shown, and again at every Show from here; `off` at every Hide. `Destroy` hides first, so
     * `off` runs then too. (`Tick` and `ListenWhileShown` are this, for a ticker callback and a
     * subscription.) For something that lasts as long as the component, use `Own`.
     *
     * @param on - Starts it: runs now if the component is shown, and at every Show.
     * @param off - Stops it: runs at every Hide.
     */
    protected WhileShown(on: () => void, off: () => void): void {
        this.shownBindings.push({on, off});
        if (this.shown) {
            on();
        }
    }

    /**
     * Holds something you have started during a visit - a tween, a `Wait` or `GetInterval` timer - so it is cancelled if the
     * component is hidden or destroyed before it finishes, with nothing to store or clean up yourself:
     *
     *     private OnEnterClicked(): void {
     *         this.Track(Tween(this.title, { alpha: 0 }, 1000, Easing.Quad.In, () => this.game.sceneManager.ShowScene("next")));
     *     }
     *
     * `cancel` is called once, at the next Hide - just after `OnHide` - or at Destroy if the component was never shown, last
     * tracked first. It is dropped from then on, so the next visit starts clean. (This is the difference from `Own`, which
     * waits for Destroy and so would leave the tween running while the component is hidden.) Anything that has finished by
     * then is cancelled anyway, which is harmless: cancelling a finished tween or timer does nothing.
     *
     * To replace something - a new fade over the one running - call the function it returns first: it cancels now and stops
     * tracking, so repeated calls don't pile up until the next Hide. (A tween that has run its course stays on the list until
     * then; the list is emptied at every Hide.)
     *
     *     this.stopFade?.();
     *     this.stopFade = this.Track(Tween(this.title, { alpha }, ms));
     *
     * Tracking on a destroyed component cancels at once.
     *
     * @param cancel - What stops it: the function `Tween`, `Wait` and `GetInterval` return, or any `() => void`.
     * @returns A function that cancels it now and stops tracking it. It cancels at most once, however often it is called.
     */
    protected Track(cancel: Cancel): Cancel {
        if (this.destroyed) {
            cancel();
            return () => undefined;
        }
        let active = true;
        const stop = () => {
            if (active) {
                active = false;
                cancel();
            }
        };
        this.tracked.push(stop);
        return () => {
            const index = this.tracked.indexOf(stop);
            if (index >= 0) {
                this.tracked.splice(index, 1);
            }
            stop();
        };
    }

    /**
     * Subscribes `fn` to `event` now, and unsubscribes when this component is destroyed (through `Own`). `fn` is called with
     * the component as `this`, so a method can be passed as it is.
     *
     *     this.Listen(this.game.dispatcher, MONSTER_KILLED, this.OnMonsterKilled);
     *
     * For a subscription that should only be live while the component is shown, use `ListenWhileShown`.
     *
     * @param emitter - The event source: `game.dispatcher`, `game.keyboard`, `game.assets`, a pixi display object...
     * @param event - The event name.
     * @param fn - Called with the event's arguments, `this` being this component.
     */
    protected Listen(emitter: IEmitter, event: string, fn: (...args: any[]) => void): void {
        emitter.on(event, fn, this);
        this.Own(() => emitter.off(event, fn, this));
    }

    /**
     * Subscribes `fn` to `event` at every Show, and unsubscribes at every Hide - so it needs no "am I showing" guard. `fn` is
     * called with the component as `this`.
     *
     *     this.ListenWhileShown(this.game.keyboard, "keydown", this.OnKey);
     *
     * @param emitter - The event source: `game.dispatcher`, `game.keyboard`, `game.assets`, a pixi display object...
     * @param event - The event name.
     * @param fn - Called with the event's arguments, `this` being this component.
     */
    protected ListenWhileShown(emitter: IEmitter, event: string, fn: (...args: any[]) => void): void {
        this.WhileShown(() => emitter.on(event, fn, this), () => emitter.off(event, fn, this));
    }

    /**
     * Calls `fn` (with this component as `this`) every frame of `game.ticker`, only while this component is shown - so it
     * pauses when the scene is hidden and needs no cleanup.
     *
     *     this.Tick(this.Update);
     *
     * @param fn - Called each frame with pixi's frame delta as `dt` (1 at 60 fps, 2 at 30). For seconds, use
     *             `this.game.ticker.deltaMS / 1000`.
     */
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
        return this.debugTools || (this.debugTools = new DebugTools(
            dispose => this.Own(dispose),
            () => DebugEnabled(this.game.assets),
            undefined,
            () => this.game.screen
        ));
    }

    /** Cancels what `Track` is holding, last tracked first, and forgets it. */
    private CancelTracked(): void {
        const tracked = this.tracked;
        this.tracked = [];
        for (let i = tracked.length - 1; i >= 0; i--) {
            tracked[i]();
        }
    }

    /**
     * Attaches this component to the scene registered under `id`.
     *
     * @deprecated Attach the child to its owner instead (`owner.Attach(child)`), which doesn't need to know the scene's name.
     * @param id - The id of the scene (as given to `SceneManager.AddScene`) to attach this component to.
     */
    protected AddToScene(id: string): void {
        this.game.sceneManager.GetScene(id).Attach(this);
    }
}
