/**
 * The words the editor puts to data values: the short tag drawn over one on the map, and the longer
 * summary on the selected-brush card. Pure - no pixi, no DOM - so they run under the plain node test
 * runner (see DataLabels.test.ts).
 *
 * The map's labels are drawn in a small bitmap font that has letters, digits and a few marks but no "+" or
 * "$" - so a pickup is its kind's letter and its number ("G10" for ten gold, "K3" for key 3), with a Q after
 * it if it counts for a quest, a portal is P and its id (A for an arrival-only one), with a ? after it if
 * it goes nowhere, and a floor overlay is the pace it sets, x0.3 for "a third of normal".
 */

import { IsDoorLockValue } from "@logic-incubator/engine/level/Doors";
import { BossValue, IsBossValue } from "@logic-incubator/engine/level/entities/Bosses";
import { IsLocked } from "@logic-incubator/engine/level/entities/Keys";
import { IsPickupValue, PickupValue } from "@logic-incubator/engine/level/entities/Pickups";
import { IsSpawnerValue, SpawnerValue } from "@logic-incubator/engine/level/entities/Spawners";
import { IsLightValue } from "@logic-incubator/engine/level/Lighting";
import {
    IsOverlayValue,
    OverlayAlpha,
    OverlayBlendOf,
    OverlayReflectivity,
    OverlaySlipperiness,
    OverlaySpeed,
    OverlayTint,
    OverlayValue
} from "@logic-incubator/engine/level/Overlays";
import { Brush, DataBrushName, DataBrushValue } from "@logic-incubator/engine/level/LevelFormat";
import Portals, { IsTeleportValue, TeleportValue } from "@logic-incubator/engine/level/Portals";
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
 * which is every door by default, has none - it'd be noise on each), D for an NPC's dialog, B for a boss and
 * a portal's id as P3 (A3 if it's arrival only) and how fast an overlay lets the heroes walk, as x0.3 (the bitmap font has no "×").
 * A pickup or boss that counts for a quest has a Q after its tag.
 * Empty for anything else.
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
    if (IsTeleportValue(value)) {
        return (value.arrivalOnly ? "A" : "P") + value.portal;
    }
    if (IsOverlayValue(value)) {
        return "x" + OverlaySpeed(value);
    }
    return "";
}

/**
 * The cells (as "x,y") of the `TELEPORT` brushes in `levelData` that can never send anyone anywhere: no other portal has
 * their id (see `Portals.Unpaired`). The map puts a ? after their tag.
 */
export function UnpairedPortalCells(levelData: ReadonlyArray<Brush>): Set<string> {
    const portals = new Portals(
        levelData
            .filter(brush => brush.name === DataBrushName.TELEPORT && IsTeleportValue(brush.data))
            .map(brush => ({ x: brush.position.x, y: brush.position.y, value: brush.data as TeleportValue }))
    );
    return new Set(portals.Unpaired().map(portal => portal.x + "," + portal.y));
}

/** A portal in a few words, for the selected-brush card and the cell inspector: "portal 3", "portal 3 · arrival only". */
export function DescribeTeleport(value: TeleportValue): string {
    return `portal ${value.portal}` + (value.arrivalOnly ? " · arrival only" : "");
}

/**
 * An overlay in a few words, for the selected-brush card and the cell inspector: "water · speed ×0.4 · slipperiness ×0.5 · mirrors 55%" -
 * "mirrors" left out for one that doesn't - then "alpha 60%" for one that's faded and its blend, "screen", for one that isn't laid over
 * the floor as normal.
 */
export function DescribeOverlay(value: OverlayValue): string {
    const reflectivity = Math.round(OverlayReflectivity(value) * 100);
    const alpha = Math.round(OverlayAlpha(value) * 100);
    const blend = OverlayBlendOf(value);
    return [value.overlay, `speed ×${OverlaySpeed(value)}`, `slipperiness ×${OverlaySlipperiness(value)}`]
        .concat(reflectivity > 0 ? [`mirrors ${reflectivity}%`] : [])
        .concat(alpha < 100 ? [`alpha ${alpha}%`] : [])
        .concat(blend !== "normal" ? [blend] : [])
        .join(" · ");
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

/** A spawner in a few words: "skeleton · every 5s · max 3", or how many types it draws from. */
export function DescribeSpawner(spawner: SpawnerValue): string {
    const types = spawner.monsters.length === 1 ? spawner.monsters[0].replace(/_/g, " ") : `${spawner.monsters.length} types`;
    return `${types} · every ${spawner.interval}s · max ${spawner.maxAlive}`;
}

/**
 * Any data value in a few words, for the selected-brush card and the cell inspector - and, for a light, its tint to
 * show beside them. A number (a height) is just the number; a value with nothing to say about it (player start,
 * collision, an exit) is empty.
 */
export function DescribeDataValue(value: DataBrushValue | null | undefined): { text: string; colour?: number } {
    if (typeof value === "number") {
        return { text: String(value) };
    }
    if (IsPickupValue(value)) {
        return { text: DescribePickup(value) };
    }
    if (IsDialogValue(value)) {
        return { text: DescribeDialog(value.script) };
    }
    if (IsBossValue(value)) {
        return { text: DescribeBoss(value) };
    }
    if (IsLightValue(value)) {
        return { text: `${value.brightness} bright · ${value.range} tiles`, colour: value.tint };
    }
    if (IsSpawnerValue(value)) {
        return { text: DescribeSpawner(value) };
    }
    if (IsDoorLockValue(value)) {
        return { text: DescribeLock(value.lock) };
    }
    if (IsTeleportValue(value)) {
        return { text: DescribeTeleport(value) };
    }
    if (IsOverlayValue(value)) {
        return { text: DescribeOverlay(value), colour: value.overlay === "shiny" ? undefined : OverlayTint(value) };
    }
    return { text: "" };
}
