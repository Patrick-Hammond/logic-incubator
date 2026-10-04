/**
 * The words the editor puts to data values: the short tag drawn over one on the map, and the longer
 * summary on the selected-brush card. Pure - no pixi, no DOM - so they run under the plain node test
 * runner (see DataLabels.test.ts).
 *
 * The map's labels are drawn in a small bitmap font that has letters, digits and a few marks but no "+" or
 * "$" - so a pickup is its kind's letter and its number ("G10" for ten gold, "K3" for key 3).
 */

import { IsDoorLockValue } from "@logic-incubator/engine/level/Doors";
import { IsLocked } from "@logic-incubator/engine/level/entities/Keys";
import { IsPickupValue, PickupValue } from "@logic-incubator/engine/level/entities/Pickups";
import { IsSpawnerValue } from "@logic-incubator/engine/level/entities/Spawners";
import { IsLightValue } from "@logic-incubator/engine/level/Lighting";
import { DataBrushValue } from "@logic-incubator/engine/level/LevelFormat";

/** A pickup's tag on the map: gold G10, health H2, key K3, weapon W, item I. */
export function PickupLabel(pickup: PickupValue): string {
    switch (pickup.kind) {
        case "gold":
            return "G" + pickup.amount;
        case "health":
            return "H" + pickup.amount;
        case "key":
            return "K" + pickup.id;
        case "weapon":
            return "W";
        default:
            return "I";
    }
}

/**
 * The tag drawn over a data value on the map - a bare number for a height, the range of a light, how many
 * monster types a spawner draws from, a pickup's PickupLabel, a locked door's lock as L3 (an unlocked door,
 * which is every door by default, has none - it'd be noise on each). Empty for anything else.
 * Whatever each is is told apart by its shape, like everywhere else a Brush.data is read.
 */
export function MapLabel(value: DataBrushValue | null | undefined): string {
    if (typeof value === "number") {
        return String(value);
    }
    if (IsPickupValue(value)) {
        return PickupLabel(value);
    }
    if (IsDoorLockValue(value)) {
        return IsLocked(value.lock) ? "L" + value.lock : "";
    }
    if (IsLightValue(value)) {
        return String(value.range);
    }
    if (IsSpawnerValue(value)) {
        return String(value.monsters.length);
    }
    return "";
}

/** A pickup in a few words, for the selected-brush card: "10 gold", "key 3", "weapon: weapon_axe". */
export function DescribePickup(pickup: PickupValue): string {
    switch (pickup.kind) {
        case "gold":
            return `${pickup.amount} gold`;
        case "health":
            return `${pickup.amount} hit points`;
        case "key":
            return `key ${pickup.id}`;
        case "weapon":
            return `weapon: ${pickup.weapon.icon || "unnamed"}`;
        default:
            return pickup.sprite ? `item: ${pickup.sprite}` : "item (its own sprite)";
    }
}

/** What a door's lock id means, for a tooltip or the card: unlocked, or the key it needs. */
export function DescribeLock(lock: number): string {
    return IsLocked(lock) ? `needs key ${lock}` : "unlocked";
}
