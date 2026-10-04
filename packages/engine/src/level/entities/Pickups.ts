/**
 * What a pickup gives the player when they walk over it. Pure - no pixi - so
 * it runs under the plain node test runner, same as Spawners.ts.
 */

import {WeaponDef} from "./Projectiles";

export type PickupValue =
    | { kind: "gold"; amount: number }
    /** Hit points restored, in the same half-hearts as damage - never past the player's maximum. */
    | { kind: "health"; amount: number }
    /** A key for the doors whose lock is `id` (0 or more - see `Keys`). */
    | { kind: "key"; id: number }
    | { kind: "weapon"; weapon: WeaponDef }
    /** `sprite` is what goes in the inventory; left out, it's the pickup's own tile. */
    | { kind: "item"; sprite?: string };

export type PickupKind = PickupValue["kind"];

/** In the order the editor's pickup popup lists them. */
export const PickupKinds: ReadonlyArray<PickupKind> = ["gold", "health", "key", "weapon", "item"];

const IsNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function IsWeaponDef(value: unknown): value is WeaponDef {
    const weapon = value as WeaponDef;
    if (typeof weapon !== "object" || weapon === null || typeof weapon.icon !== "string") {
        return false;
    }
    const shot = weapon.shot;
    return (
        typeof shot === "object" && shot !== null && typeof shot.sprite === "string" &&
        IsNumber(shot.speed) && IsNumber(shot.damage) && IsNumber(shot.range) && IsNumber(shot.cooldown) &&
        (shot.spriteAngle === undefined || IsNumber(shot.spriteAngle))
    );
}

/**
 * Whether `value` is a well-formed pickup: a known `kind` with the fields that kind needs, all numbers
 * finite. Strict, since a pickup comes from hand-edited `assets-meta.json` as well as the editor - and
 * it's also what tells a pickup apart from a light or spawner in a tile's `Brush.data` (it's the only
 * value with a `kind`). Anything that fails is treated as "no pickup" rather than half-applied.
 */
export function IsPickupValue(value: unknown): value is PickupValue {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const pickup = value as { kind?: unknown; amount?: unknown; id?: unknown; weapon?: unknown; sprite?: unknown };
    switch (pickup.kind) {
        case "gold":
        case "health":
            return IsNumber(pickup.amount);
        case "key":
            // From 0 up: -1 is the lock of an unlocked door, so no key could ever fit it.
            return IsNumber(pickup.id) && Number.isInteger(pickup.id) && pickup.id >= 0;
        case "weapon":
            return IsWeaponDef(pickup.weapon);
        case "item":
            return pickup.sprite === undefined || typeof pickup.sprite === "string";
        default:
            return false;
    }
}

/** A fresh pickup of `kind` with plain starting values - what the editor's popup begins with when the kind is changed. A weapon's sprite names are blank: they're the game's art, for the popup to ask for. */
export function DefaultPickupValue(kind: PickupKind = "gold"): PickupValue {
    switch (kind) {
        case "health":
            return { kind, amount: 2 };
        case "key":
            return { kind, id: 1 };
        case "weapon":
            return { kind, weapon: { icon: "", shot: { sprite: "", speed: 5, damage: 1, cooldown: 0.4, range: 8 } } };
        case "item":
            return { kind };
        default:
            return { kind: "gold", amount: 1 };
    }
}
