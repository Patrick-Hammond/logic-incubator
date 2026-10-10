/**
 * A light the player carries - a torch they picked up (see the `light` pickup). Pure - no pixi - so it runs
 * under the plain node test runner, same as Health.ts.
 */

import { LightValue } from "../Lighting";

export type CarriedLight = {
    value: LightValue;
    /** How long it burns in all, in seconds; 0 burns for the rest of the level. */
    seconds: number;
    /** Seconds it has left - counts down from `seconds`. */
    left: number;
};

/** Seconds over which a light that burns out dims to nothing, so the player sees it going before it's gone. */
export const GutterTime = 8;

/** A fresh light that burns for `seconds` (0, negative or left out: for the rest of the level). */
export function CreateCarriedLight(value: LightValue, seconds = 0): CarriedLight {
    const burns = seconds > 0 ? seconds : 0;
    return { value, seconds: burns, left: burns };
}

/** Burns it for `seconds`; returns whether it's still alight. One that burns for the whole level never goes out. */
export function TickCarriedLight(light: CarriedLight, seconds: number): boolean {
    if (light.seconds === 0) {
        return true;
    }
    light.left = Math.max(0, light.left - seconds);
    return light.left > 0;
}

/** Its strength as a multiple of its own: 1, falling to 0 over the last `GutterTime` seconds of its burn. */
export function CarriedLightScale(light: CarriedLight): number {
    if (light.seconds === 0) {
        return 1;
    }
    return Math.max(0, Math.min(1, light.left / Math.min(GutterTime, light.seconds)));
}
