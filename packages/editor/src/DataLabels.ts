/**
 * The words the editor puts to data values: the short tag drawn over one on the map, and the longer
 * summary on the selected-brush card. Pure - no pixi, no DOM - so they run under the plain node test
 * runner (see DataLabels.test.ts).
 *
 * The map's labels are drawn in a small bitmap font that has letters, digits and a few marks but no "+" or
 * "$" - so a pickup is its kind's letter and its number ("G10" for ten gold, "K3" for key 3), with a Q after
 * it if it counts for a quest.
 */

import { IsDoorLockValue } from "@logic-incubator/engine/level/Doors";
import { BossValue, IsBossValue } from "@logic-incubator/engine/level/entities/Bosses";
import { IsLocked } from "@logic-incubator/engine/level/entities/Keys";
import { IsPickupValue, PickupValue } from "@logic-incubator/engine/level/entities/Pickups";
import { IsSpawnerValue } from "@logic-incubator/engine/level/entities/Spawners";
import { IsLightValue } from "@logic-incubator/engine/level/Lighting";
import { DataBrushValue } from "@logic-incubator/engine/level/LevelFormat";
import { ShoutPart } from "@logic-incubator/engine/story/DialogScript";
import { IsDialogValue } from "@logic-incubator/engine/story/Talk";

/** A pickup's tag on the map: gold G10, health H2, key K3, weapon W, item I, a light to carry T (for torch - L is a locked door's). */
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
        case "light":
            return "T";
        default:
            return "I";
    }
}

/**
 * The tag drawn over a data value on the map - a bare number for a height, the range of a light, how many
 * monster types a spawner draws from, a pickup's PickupLabel, a locked door's lock as L3 (an unlocked door,
 * which is every door by default, has none - it'd be noise on each), D for an NPC's dialog and B for a boss.
 * A pickup or boss that counts for a quest has a Q after its tag. Empty for anything else.
 * Whatever each is is told apart by its shape, like everywhere else a Brush.data is read.
 */
export function MapLabel(value: DataBrushValue | null | undefined): string {
    if (typeof value === "number") {
        return String(value);
    }
    if (IsPickupValue(value)) {
        return PickupLabel(value) + (value.quest ? "Q" : "");
    }
    if (IsDialogValue(value)) {
        return "D";
    }
    if (IsBossValue(value)) {
        return "B" + (value.quest ? "Q" : "");
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

/** A pickup in a few words, for the selected-brush card: "10 gold", "key 3", "weapon: weapon_axe" - and "· quest rats" if it counts for one. */
export function DescribePickup(pickup: PickupValue): string {
    return KindOfPickup(pickup) + (pickup.quest ? ` · quest ${pickup.quest}` : "");
}

function KindOfPickup(pickup: PickupValue): string {
    switch (pickup.kind) {
        case "gold":
            return `${pickup.amount} gold`;
        case "health":
            return `${pickup.amount} hit points`;
        case "key":
            return `key ${pickup.id}`;
        case "weapon":
            return `weapon: ${pickup.weapon.icon || "unnamed"}`;
        case "light":
            return pickup.seconds ? `a light to carry, ${pickup.seconds} s` : "a light to carry";
        default:
            return pickup.sprite ? `item: ${pickup.sprite}` : "item (its own sprite)";
    }
}

/** A boss in a few words, for the selected-brush card: "big demon · 120 hit points · quest demon". */
export function DescribeBoss(boss: BossValue): string {
    const parts = [boss.monster.replace(/_/g, " ") || "no monster", boss.hitPoints ? `${boss.hitPoints} hit points` : "its own hit points"];
    return parts.concat(boss.quest ? [`quest ${boss.quest}`] : []).join(" · ");
}

/** A dialog script in a few words, for the selected-brush card: its first line (not a part's name), how long it is, and whether its NPC shouts (a `shout:` part). */
export function DescribeDialog(script: string): string {
    const lines = script.split(/\r?\n/).map(line => line.replace(/#.*/, "").trim()).filter(line => line);
    if (!lines.length) {
        return "says nothing";
    }
    const label = (line: string) => /^[^\s:]+:$/.test(line);
    const first = lines.filter(line => !label(line))[0] || lines[0];
    const words = [`“${first}”`];
    if (lines.length > 1) {
        words.push(`${lines.length} lines`);
    }
    if (lines.some(line => line === ShoutPart + ":")) {
        words.push("shouts");
    }
    return words.join(" · ");
}

/** What a door's lock id means, for a tooltip or the card: unlocked, or the key it needs. */
export function DescribeLock(lock: number): string {
    return IsLocked(lock) ? `needs key ${lock}` : "unlocked";
}
