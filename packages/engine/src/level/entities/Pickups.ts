/**
 * What a pickup gives the player when they walk over it. Pure - no pixi - so
 * it runs under the plain node test runner, same as Spawners.ts.
 */

import {WeaponDef} from "./Projectiles";

export type PickupValue =
    | { kind: "gold"; amount: number }
    | { kind: "weapon"; weapon: WeaponDef }
    | { kind: "item"; sprite: string };
