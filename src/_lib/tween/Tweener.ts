import { Ticker } from "pixi.js";
import { Dictionary } from "../utils/Types";
import { Lerp } from "../math/Utils";
import { CallbackDone } from "../game/display/Utils";
import { Cancel } from "../game/Timing";
import { Easing, EasingFunction } from "./Easing";

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
    const values = target as unknown as Dictionary<number>;
    const toValues = to as Dictionary<number>;
    const keys = Object.keys(to);

    if (ms <= 0) {
        keys.forEach(key => values[key] = toValues[key]);
        CallbackDone(onComplete);
        return () => {};
    }

    const from: Dictionary<number> = {};
    keys.forEach(key => from[key] = values[key]);

    let elapsed = 0;
    const tick = () => {
        elapsed += Ticker.shared.deltaMS;
        const t = easing(Math.min(1, elapsed / ms));
        keys.forEach(key => values[key] = Lerp(from[key], toValues[key], t));

        if (elapsed >= ms) {
            cancel();
            CallbackDone(onComplete);
        }
    };

    const cancel: Cancel = () => Ticker.shared.remove(tick);
    Ticker.shared.add(tick);
    return cancel;
}
