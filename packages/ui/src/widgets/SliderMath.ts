/**
 * The arithmetic of a slider: a value in a range, snapped to a step, against a position along a track. Floating-point steps (0.1) are kept from drifting by snapping
 * in units of the step from the minimum and rounding the result to the step's own precision. Pure.
 */

export type SliderRange = { min: number; max: number; step: number };

/** How many decimal places a step has (0.25 -> 2), so results can be rounded back to them. */
function Decimals(step: number): number {
    const text = String(step);
    const dot = text.indexOf(".");
    return dot < 0 ? 0 : text.length - dot - 1;
}

/**
 * The value clamped into the range and snapped to the nearest step from the minimum. The maximum itself is always reachable, even when it isn't a whole number of steps from the
 * minimum: a value nearer to it than to the last step is the maximum (a slider dragged to its end reads full, not one step short).
 */
export function SnapValue(value: number, range: SliderRange): number {
    if (!(range.max > range.min)) {
        return range.min;
    }
    const clamped = Math.max(range.min, Math.min(range.max, value));
    if (!(range.step > 0)) {
        return clamped;
    }
    const steps = Math.round((clamped - range.min) / range.step);
    const snapped = range.min + steps * range.step;
    const places = Decimals(range.step);
    const rounded = Number(snapped.toFixed(Math.max(places, Decimals(range.min))));
    if (rounded > range.max) {
        return range.max;
    }
    return Math.abs(range.max - clamped) < Math.abs(rounded - clamped) ? range.max : rounded;
}

/** The value at `position` along a track that starts at `trackStart` and is `trackLength` long (positions outside it clamp to the ends). */
export function ValueAt(position: number, trackStart: number, trackLength: number, range: SliderRange): number {
    if (!(trackLength > 0)) {
        return range.min;
    }
    const fraction = Math.max(0, Math.min(1, (position - trackStart) / trackLength));
    return SnapValue(range.min + fraction * (range.max - range.min), range);
}

/** Where along the track a value is (the fraction 0 to 1 times the track's length, from its start). */
export function PositionOf(value: number, trackStart: number, trackLength: number, range: SliderRange): number {
    if (!(range.max > range.min)) {
        return trackStart;
    }
    const fraction = (Math.max(range.min, Math.min(range.max, value)) - range.min) / (range.max - range.min);
    return trackStart + Math.round(fraction * trackLength);
}

/** One step up or down (ten steps when `large`, for page keys), snapped and clamped. */
export function NudgeValue(value: number, direction: -1 | 1, range: SliderRange, large = false): number {
    const step = range.step > 0 ? range.step : (range.max - range.min) / 100;
    return SnapValue(value + direction * step * (large ? 10 : 1), range);
}
