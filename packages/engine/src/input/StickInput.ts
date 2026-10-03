import { Vec2Like } from "@logic-incubator/lib/math/Geometry";

/**
 * Whether a stick read through `GamePad.GetStick` is pushed past its dead zone.
 *
 * `GetStick` is null only when there's no controller, or it has too few axes to have that stick.
 * A stick at rest still comes back - with both components zeroed by the dead zone - so non-null
 * means "this controller has the stick", not "the stick is pushed", and anything keyed off it
 * (like firing) would be on for every connected pad, all the time.
 *
 * Either component being left non-zero counts, so an up/down-only push is pushed too.
 *
 * Kept pure so it can be unit-tested without the Game runtime `PlayerControl` needs.
 */
export function IsStickPushed(stick: Vec2Like | null): boolean {
    return stick != null && (stick.x !== 0 || stick.y !== 0);
}
