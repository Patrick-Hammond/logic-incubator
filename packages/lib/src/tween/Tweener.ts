import { Ticker } from "pixi.js";
import { Dictionary } from "../utils/Types";
import { Lerp } from "../math/Utils";
import { CallbackDone } from "../game/display/Utils";
import { Cancel } from "../game/Timing";
import { Easing, EasingFunction } from "./Easing";

export interface TweenOptions {
    /** Defaults to `Easing.Linear`. */
    easing?: EasingFunction;
    /** After reaching `to`, play the same tween backwards to the starting values. Each leg takes `ms`, so a round trip takes `2 * ms`. */
    pingPong?: boolean;
    /** Extra plays after the first (a ping-pong round trip counts as one play). `Infinity` loops until cancelled. Defaults to 0. */
    repeat?: number;
    /** Called once the last play finishes - never, if `repeat` is `Infinity`. */
    onComplete?: () => void;
    /** Called after every play finishes, including the last (alongside `onComplete`) - keeps firing with `repeat: Infinity`, once per round trip. */
    onRound?: () => void;
}

/**
 * Animates the given numeric properties of `target` (e.g. `{alpha: 0}` or `{x: 100, y: 200}`) from
 * their current value to those in `to`, over `ms` milliseconds. Returns a `Cancel` that stops the
 * tween wherever it currently is, leaving the last-applied values in place.
 */
export function Tween<T extends object>(
    target: T,
    to: Partial<Record<keyof T, number>>,
    ms: number,
    easing: EasingFunction = Easing.Linear,
    onComplete?: () => void
): Cancel {
    return TweenWithOptions(target, to, ms, { easing, onComplete });
}

/**
 * `Tween` with playback options. A `pingPong` return leg is the forward leg played in reverse, so
 * e.g. `Easing.Quad.Out` decelerates into `to` and accelerates back out of it, ending exactly on the
 * starting values. Without `pingPong`, each repeat jumps back to the starting values and plays again.
 */
export function TweenWithOptions<T extends object>(
    target: T,
    to: Partial<Record<keyof T, number>>,
    ms: number,
    options: TweenOptions = {}
): Cancel {
    const { easing = Easing.Linear, pingPong = false, repeat = 0, onComplete, onRound } = options;
    const values = target as unknown as Dictionary<number>;
    const toValues = to as Dictionary<number>;
    const keys = Object.keys(to);

    const from: Dictionary<number> = {};
    keys.forEach(key => from[key] = values[key]);

    const roundMs = (pingPong ? 2 : 1) * ms;

    const finish = () => {
        keys.forEach(key => values[key] = pingPong ? from[key] : toValues[key]);
        CallbackDone(onRound);
        CallbackDone(onComplete);
    };

    if (ms <= 0) {
        finish();
        return () => {};
    }

    const duration = (repeat + 1) * roundMs;
    let elapsed = 0;
    let roundsDone = 0;
    const tick = () => {
        elapsed += Ticker.shared.deltaMS;
        if (elapsed >= duration) {
            cancel();
            finish();
            return;
        }

        if (onRound) {
            const rounds = Math.floor(elapsed / roundMs);
            while (roundsDone < rounds) {
                roundsDone++;
                CallbackDone(onRound);
            }
        }

        const leg = Math.floor(elapsed / ms);
        const progress = (elapsed - leg * ms) / ms;
        const t = easing(pingPong && leg % 2 === 1 ? 1 - progress : progress);
        keys.forEach(key => values[key] = Lerp(from[key], toValues[key], t));
    };

    const cancel: Cancel = () => Ticker.shared.remove(tick);
    Ticker.shared.add(tick);
    return cancel;
}
