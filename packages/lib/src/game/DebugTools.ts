import type { DisplayObject } from "pixi.js";
import { EmitterPanelOptions, OpenEmitterPanel } from "../debug/EmitterPanel";
import type { Emitter } from "../particles";
import { DragObject, DragOptions } from "../utils/DragObject";
import type { Cancel } from "./Timing";

/** The part of `Assets` that `DebugEnabled` reads. */
export interface IBuildInfo {
    readonly IsReady: boolean;
    readonly IsDev: boolean;
}

/**
 * Whether the debug helpers should work: yes in a development build (`assets.IsDev` - the manifest was built without
 * `--production`), no in a production one. A game that never loaded a manifest can't say which it is, so it gets them.
 */
export function DebugEnabled(assets: IBuildInfo): boolean {
    return !assets.IsReady || assets.IsDev;
}

const NoOp: Cancel = () => undefined;

/**
 * Development helpers for one `GameComponent` - reach them as `this.debug` in any component. Whatever a helper
 * starts is stopped when the component is destroyed, so a call needs no cleanup.
 *
 * They only work in development builds (see `DebugEnabled`): in a production build every call does nothing and the
 * component logs a one-time warning, so a call left in by mistake is noticed and harmless. Take the calls out before shipping.
 */
export default class DebugTools {
    private warned = false;

    /**
     * `own` registers a cleanup to run when the owning component is destroyed (`GameComponent.Own`);
     * `enabled` says whether the helpers are on - asked at each call; `openEmitterPanel` is what `Emitter` opens;
     * `screen` is the size of the game's screen, if known - the emitter panel starts a new kill area around it.
     */
    constructor(
        private own: (dispose: Cancel) => void,
        private enabled: () => boolean = () => true,
        private openEmitterPanel: (target: Emitter | Emitter[], options?: EmitterPanelOptions) => Cancel = OpenEmitterPanel,
        private screen: () => { width: number; height: number } | undefined = () => undefined
    ) {}

    /**
     * Makes any display object draggable, for positioning it by eye: press, drag, let go, and its position (in its
     * parent's space) is logged as an object literal - `title: {x:120, y:70}` - ready to paste into the code.
     * Whole pixels by default.
     *
     *     this.debug.Drag(this._title);
     *     this.debug.Drag(this._title, { label: "title", snap: 0 });            // a name for the log line; free movement
     *
     * The log is the object's own `position`, so drag the thing you are placing: a container that sits at (0, 0) with its
     * contents laid out inside it reports only how far it was dragged.
     *
     * The object must be in the stage's interaction tree when pressed - see `DragObject` for what blocks that.
     * Returns a function that stops it sooner than the component's destruction (one that does nothing, in a production build).
     */
    Drag(target: DisplayObject, options?: DragOptions): Cancel {
        if (!this.Allowed()) {
            return NoOp;
        }
        const stop = DragObject(target, options);
        this.own(stop);
        return stop;
    }

    /**
     * Opens a side panel for tuning a particle emitter while the game runs: its settings as controls (changes show at once), a picker
     * for the particle image - a loaded sprite or animation by name, or a picture from your computer - and the config as JSON to
     * copy into a data file, as the particle editor does.
     *
     *     this.debug.Emitter(fire);                                       // one emitter
     *     this.debug.Emitter(torches, { label: "torches" });              // several made from one config: one set of controls drives them all
     *
     * Needs an emitter that has been set up with a config. The panel works on a copy, so the loaded data is not changed until you
     * paste the JSON in. Each change sets the emitter up again (`init`), which ends its live particles; its owner position, rotation,
     * `emit` and `autoUpdate` are kept. One panel serves the page: a second call adds to its list.
     *
     * @param target - The emitter, or the emitters that share one config.
     * @param options - `label` names it in the panel; `config` starts from a config other than the emitter's own.
     * @returns A function that takes it out of the panel (the last one out closes it), sooner than the component's destruction.
     */
    Emitter(target: Emitter | Emitter[], options?: EmitterPanelOptions): Cancel {
        if (!this.Allowed()) {
            return NoOp;
        }
        const close = this.openEmitterPanel(target, { screen: this.screen(), ...options });
        this.own(close);
        return close;
    }

    private Allowed(): boolean {
        if (this.enabled()) {
            return true;
        }
        if (!this.warned) {
            this.warned = true;
            console.warn("this.debug does nothing in a production build - take the debug calls out before shipping.");
        }
        return false;
    }
}
