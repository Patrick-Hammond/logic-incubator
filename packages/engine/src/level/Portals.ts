/**
 * Portals: the cells painted with the `TELEPORT` data brush, each with a portal id (its `TeleportValue`). A hero who walks
 * onto one comes out of another with the same id: with two, the other one; with more, the next along in reading order (along
 * each row, the top row first), the last going round to the first - so three make a ring. One marked `arrivalOnly` is only
 * somewhere to come out: walking onto it does nothing, so a portal and an arrival-only one with its id are a one-way trip.
 * A portal only sends someone who has just walked onto it - one who comes out on it stays put until they step off and on
 * again - and one somewhere no one can stand (a wall, an NPC, a spawner) is passed over. Heroes only: monsters and shots
 * pay them no mind. Pure - no pixi - so it runs under the plain node test runner.
 */

import type { Vec2Like } from "@logic-incubator/lib/math/Geometry";

/** A `TELEPORT` brush's value: its portal id, and whether it's only somewhere to come out (see the module comment). */
export type TeleportValue = { portal: number; arrivalOnly?: boolean };

/** One portal: its cell, in normalised map coordinates, and its value. */
export type Portal = Vec2Like & { value: TeleportValue };

/** Highest portal id the editor offers. */
export const MaxPortalId = 9999;

/** Whether `value` is a `TeleportValue` - told apart, like every data value, by its shape. */
export function IsTeleportValue(value: unknown): value is TeleportValue {
    return value != null && typeof value === "object" && typeof (value as TeleportValue).portal === "number";
}

/** What a new teleport brush starts as: portal 1, both ways. */
export function DefaultTeleportValue(): TeleportValue {
    return { portal: 1 };
}

/** `value` as the game reads it: a whole portal id from 0 to `MaxPortalId`, and `arrivalOnly` only where it's set. */
export function SanitiseTeleportValue(value: TeleportValue): TeleportValue {
    const portal = Math.min(MaxPortalId, Math.max(0, Math.round(Number(value.portal) || 0)));
    return value.arrivalOnly ? { portal, arrivalOnly: true } : { portal };
}

export default class Portals {
    /** Every portal, one a cell, in reading order. */
    private list: Portal[];
    private at = new Map<string, Portal>();

    /** `portals` in any order; where two share a cell, the last one counts. */
    constructor(portals: ReadonlyArray<Portal> = []) {
        portals.forEach(portal => this.at.set(portal.x + "," + portal.y, { x: portal.x, y: portal.y, value: SanitiseTeleportValue(portal.value) }));
        this.list = Array.from(this.at.values()).sort((a, b) => a.y - b.y || a.x - b.x);
    }

    /** Every portal, in reading order. */
    get All(): ReadonlyArray<Portal> {
        return this.list;
    }

    /** The portal on the cell, or null. */
    At(x: number, y: number): Portal | null {
        return this.at.get(x + "," + y) || null;
    }

    /**
     * Where someone whose step took them from cell `from` to cell `to` is sent: if `to` is a portal they've just walked onto
     * (it isn't `from`) that isn't arrival only, the portal it sends them to (see `Destination`) - otherwise, or with nowhere to
     * go, null. `canStand` says whether a cell can be stood on.
     */
    Jump(from: Vec2Like, to: Vec2Like, canStand: (x: number, y: number) => boolean): Portal | null {
        if (from.x === to.x && from.y === to.y) {
            return null;
        }
        const portal = this.At(to.x, to.y);
        return portal && !portal.value.arrivalOnly ? this.Destination(portal, canStand) : null;
    }

    /** The portal `portal` (one of `All`) sends a hero to: the next one with its id, in reading order and round again, that `canStand` - null for none. */
    Destination(portal: Portal, canStand: (x: number, y: number) => boolean): Portal | null {
        const ring = this.list.filter(other => other.value.portal === portal.value.portal);
        const index = ring.indexOf(portal);
        for (let step = 1; step < ring.length; step++) {
            const next = ring[(index + step) % ring.length];
            if (canStand(next.x, next.y)) {
                return next;
            }
        }
        return null;
    }

    /** The portals that can never send anyone anywhere: ones that aren't arrival only and whose id no other portal has. */
    Unpaired(): Portal[] {
        return this.list.filter(portal => !portal.value.arrivalOnly && !this.list.some(other => other !== portal && other.value.portal === portal.value.portal));
    }
}
