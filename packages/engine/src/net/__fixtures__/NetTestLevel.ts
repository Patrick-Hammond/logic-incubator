/**
 * A level for the online tests, from an ASCII map: `#` solid, `D` the cells of
 * one door, `S` the start, `E` a way out, `$` a gold pickup, `k` the key to the
 * door when it's locked, `@` a spawner's (solid) cell. Its doors open by the
 * same rule as `Level`'s (`DoorOpens`) and can be set from a snapshot; pickups
 * are taken and dropped as `Level` does them. Two copies of the same map are
 * the host's level and a guest's.
 */

import { Vec2Like } from "@logic-incubator/lib/math/Geometry";
import { DoorOpens } from "../../level/Doors";
import type { CollectedPickup } from "../../level/Level";
import { NoLock } from "../../level/entities/Keys";
import { PickupValue } from "../../level/entities/Pickups";
import { DefaultSpawnerValue, Spawner } from "../../level/entities/Spawners";
import type { NetLevel } from "../NetPlay";

type Pickup = Vec2Like & { value: PickupValue; sprite: string | null };
type Door = { cells: Vec2Like[]; isOpen: boolean; lockId: number };

export type NetTestLevel = NetLevel & { door: Door; pickups: Pickup[]; visibleFrom: Vec2Like[] };

export function NetTestLevel(rows: string[], lockId = NoLock, monsters: string[] = ["walker"]): NetTestLevel {
    const collisionData: boolean[][] = [];
    const door: Door = { cells: [], isOpen: false, lockId };
    const exits: Vec2Like[] = [];
    const pickups: Pickup[] = [];
    const spawners: Spawner[] = [];
    let start: Vec2Like | undefined;
    rows.forEach((row, y) => row.split("").forEach((c, x) => {
        (collisionData[x] = collisionData[x] || [])[y] = c === "#" || c === "@";
        if (c === "D") {
            door.cells.push({ x, y });
        } else if (c === "S") {
            start = { x, y };
        } else if (c === "E") {
            exits.push({ x, y });
        } else if (c === "$") {
            pickups.push({ x, y, value: { kind: "gold", amount: 5 }, sprite: "coin" });
        } else if (c === "k") {
            pickups.push({ x, y, value: { kind: "key", id: lockId }, sprite: "key" });
        } else if (c === "@") {
            spawners.push({ x, y, cells: [{ x, y }], value: { ...DefaultSpawnerValue(), monsters: monsters.slice(), hitPoints: 3 } });
        }
    }));
    const width = rows[0].length;
    const height = rows.length;
    const isSolid = (x: number, y: number) => x < 0 || y < 0 || x >= width || y >= height || collisionData[x][y];
    const isDoor = (x: number, y: number) => door.cells.some(c => c.x === x && c.y === y);
    let doorVersion = 0;
    const doors = door.cells.length ? [door] : [];
    const level: NetTestLevel = {
        door,
        doors,
        pickups,
        visibleFrom: [],
        spawners,
        collisionData,
        boundRect: { width, height },
        playerStartPosition: start,
        get doorVersion() {
            return doorVersion;
        },
        IsSolid: isSolid,
        IsDoorClosed: (x, y) => !door.isOpen && isDoor(x, y),
        IsCellVisible: () => true,
        HeightAt: () => 0,
        RemoveSpawner(spawner) {
            spawner.cells.forEach(cell => (collisionData[cell.x][cell.y] = false));
            level.spawners.splice(level.spawners.indexOf(spawner), 1);
        },
        IsFloor: (x, y) => !isSolid(x, y) && !isDoor(x, y),
        IsExit: (x, y) => exits.some(e => e.x === x && e.y === y),
        IsDoorLocked: (x, y, canOpen) => isDoor(x, y) && !door.isOpen && !canOpen(door.lockId),
        UpdateDoors(tiles, canOpen) {
            if (doors.length) {
                level.SetDoorOpen(0, DoorOpens(door, tiles, canOpen));
            }
        },
        SetDoorOpen(index, open) {
            const which = doors[index];
            if (which && which.isOpen !== open) {
                which.isOpen = open;
                doorVersion++;
            }
        },
        UpdateVisibleRegions(tiles) {
            level.visibleFrom = tiles.slice();
        },
        CollectPickupsAt(x, y): CollectedPickup[] {
            const here = level.pickups.filter(p => p.x === x && p.y === y);
            level.pickups = level.pickups.filter(p => here.indexOf(p) < 0);
            return here.map(p => ({ value: p.value, sprite: p.sprite }));
        },
        DropPickup(x, y, value, sprite) {
            level.pickups.push({ x, y, value, sprite });
            return { x, y };
        }
    };
    return level;
}
