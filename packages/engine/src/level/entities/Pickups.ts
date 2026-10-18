/**
 * What a pickup gives the player when they walk over it, and which pickups a
 * hero reaches. Pure - no pixi - so it runs under the plain node test runner,
 * same as Spawners.ts.
 */

import {RectangleLike, Vec2Like} from "@logic-incubator/lib/math/Geometry";
import {IsQuestId} from "../../story/Quests";
import {IsCompleteLightValue, LightValue} from "../Lighting";
import {Overlaps, SpriteSize, WeaponDef} from "./Projectiles";

/** Any pickup can be marked for a quest: picking it up counts for that one (see `Quests`). */
export type PickupValue = PickupKindValue & {
    /** The id of the quest it counts for. */
    quest?: string;
};

type PickupKindValue =
    | { kind: "gold"; amount: number }
    /** Hit points restored, in the same half-hearts as damage - never past the player's maximum. */
    | { kind: "health"; amount: number }
    /** A key for the doors whose lock is `id` (0 or more - see `Keys`). */
    | { kind: "key"; id: number }
    | { kind: "weapon"; weapon: WeaponDef }
    /** `sprite` is what goes in the inventory; left out, it's the pickup's own tile. */
    | { kind: "item"; sprite?: string }
    /** A light the player carries from then on - a torch. It burns for `seconds` (0 or left out: for the rest of the level), dimming at the end - see `CarriedLight`. */
    | { kind: "light"; light: LightValue; seconds?: number };

export type PickupKind = PickupValue["kind"];

/** In the order the editor's pickup popup lists them. */
export const PickupKinds: ReadonlyArray<PickupKind> = ["gold", "health", "key", "weapon", "item", "light"];

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
        (shot.spriteAngle === undefined || IsNumber(shot.spriteAngle)) &&
        (shot.light === undefined || IsCompleteLightValue(shot.light)) &&
        (shot.sound === undefined || typeof shot.sound === "string") &&
        (shot.wallSound === undefined || typeof shot.wallSound === "string")
    );
}

/**
 * Whether `value` is a well-formed pickup: a known `kind` with the fields that kind needs, all numbers
 * finite, and the quest it's marked for, if any, an id one could have. Strict, since a pickup comes from hand-edited `assets-meta.json` as well as the editor - and
 * it's also what tells a pickup apart from a light or spawner in a tile's `Brush.data` (it's the only
 * value with a `kind`). Anything that fails is treated as "no pickup" rather than half-applied.
 */
export function IsPickupValue(value: unknown): value is PickupValue {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const pickup = value as { kind?: unknown; amount?: unknown; id?: unknown; weapon?: unknown; sprite?: unknown; light?: unknown; seconds?: unknown; quest?: unknown };
    if (pickup.quest !== undefined && !IsQuestId(pickup.quest)) {
        return false;
    }
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
        case "light":
            return IsCompleteLightValue(pickup.light) && (pickup.seconds === undefined || (IsNumber(pickup.seconds) && pickup.seconds >= 0));
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
        case "light":
            return { kind, light: { brightness: 1, tint: 0xffc780, range: 7, flicker: 0.15 }, seconds: 120 };
        default:
            return { kind: "gold", amount: 1 };
    }
}

/** Where a pickup lies, for telling which a hero reaches (see `PickupCellsReached`): its cell, and the pixels it's drawn over (see `PickupArea`). */
export type PickupSpot = Vec2Like & { area: RectangleLike };

/**
 * The pixels a pickup on `cell` draws: its sprite's frame of `size` at the cell's top-left less `pixelOffset` (as `TileMap`
 * draws a tile), less what's see-through round it (`size.trim`) - or, with no sprite (a `PICKUP` brush on an empty cell, a key
 * dropped with none), the whole cell.
 */
export function PickupArea(cell: Vec2Like, tileSize: number, sprite?: { size: SpriteSize; pixelOffset: Vec2Like } | null): RectangleLike {
    if (!sprite) {
        return { x: cell.x * tileSize, y: cell.y * tileSize, width: tileSize, height: tileSize };
    }
    const x = cell.x * tileSize - sprite.pixelOffset.x;
    const y = cell.y * tileSize - sprite.pixelOffset.y;
    const art = sprite.size.trim;
    return art ? { x: x + art.x, y: y + art.y, width: art.width, height: art.height } : { x, y, width: sprite.size.width, height: sprite.size.height };
}

/**
 * The cells whose pickups a hero picks up, each once, in the order `pickups` has them: any cell with a pickup that some
 * part of their sprite overlaps (`figure`, see `Hero.Figure`) - unless it's a step too high or low to climb to from
 * `tile`, the cell under their centre (`isHeightGap`, see `Depth.IsHeightGap`), so nothing is reached up onto a ledge -
 * and always the cell they stand on.
 */
export function PickupCellsReached(
    figure: RectangleLike,
    tile: Vec2Like,
    pickups: ReadonlyArray<PickupSpot>,
    isHeightGap: (from: Vec2Like, to: Vec2Like) => boolean
): Vec2Like[] {
    const cells: Vec2Like[] = [];
    pickups.forEach(pickup => {
        if (cells.some(cell => cell.x === pickup.x && cell.y === pickup.y)) {
            return;
        }
        const on = pickup.x === tile.x && pickup.y === tile.y;
        if (on || (Overlaps(figure, pickup.area) && !isHeightGap(tile, pickup))) {
            cells.push({ x: pickup.x, y: pickup.y });
        }
    });
    return cells;
}
