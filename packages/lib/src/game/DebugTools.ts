import type { DisplayObject } from "pixi.js";
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
     * `enabled` says whether the helpers are on - asked at each call.
     */
    constructor(private own: (dispose: Cancel) => void, private enabled: () => boolean = () => true) {}

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
