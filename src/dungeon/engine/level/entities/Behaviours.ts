/**
 * How monsters decide where to go. A game picks one per monster type (see
 * `MonsterDef.behaviour`) and can write its own by implementing
 * `IMonsterBehaviour`. Pure - no pixi - so it runs under the plain node test
 * runner, same as Spawners.ts.
 */

import { Vec2Like } from "../../../../_lib/math/Geometry";
import { IFlowField, UNREACHABLE } from "./FlowField";

/** What a behaviour sees each frame. Positions are a one-tile box's top-left, in pixels - the same as the player's. */
export type MonsterContext = {
    position: Vec2Like;
    /** The cell under the monster's centre. */
    tile: Vec2Like;
    player: Vec2Like;
    /** Walking distances to the player's cell - see `FlowField`. */
    flow: IFlowField;
    tileSize: number;
    /** Seconds since the last frame. */
    dt: number;
    /** `[0, 1)`, like `Math.random` - injected so tests can pin it. */
    random: () => number;
};

export interface IMonsterBehaviour {
    /** Direction the monster wants to move this frame, length 0 (stay put) to 1 (full speed). */
    Steer(context: MonsterContext): Vec2Like;
}

const STILL: Vec2Like = { x: 0, y: 0 };

/** Unit vector from `from` towards `to`, or zero if they coincide. */
export function Toward(from: Vec2Like, to: Vec2Like): Vec2Like {
    const x = to.x - from.x;
    const y = to.y - from.y;
    const length = Math.sqrt(x * x + y * y);
    return length > 0 ? { x: x / length, y: y / length } : STILL;
}

/** Steers at the top-left of `cell`, so a monster lines itself up with the cell it's stepping into - which is what lets its box through a one-tile gap. */
function TowardCell(context: MonsterContext, cell: Vec2Like | null): Vec2Like {
    return cell ? Toward(context.position, { x: cell.x * context.tileSize, y: cell.y * context.tileSize }) : STILL;
}

/** Down the flow field towards the player - straight at them once within a tile, where the field has nothing left to say. */
export function FollowFlow(context: MonsterContext): Vec2Like {
    const distance = context.flow.DistanceAt(context.tile.x, context.tile.y);
    if (distance !== UNREACHABLE && distance <= 1) {
        return Toward(context.position, context.player);
    }
    return TowardCell(context, context.flow.NextCell(context.tile.x, context.tile.y));
}

/** Heads for the player by the shortest walk. */
export class Chase implements IMonsterBehaviour {
    Steer(context: MonsterContext): Vec2Like {
        return FollowFlow(context);
    }
}

export type WanderOptions = {
    /** Starts chasing once the player is within this many tiles' walk - and doesn't stop. */
    aggroRange?: number;
    /** Average seconds between changes of heading. */
    turnEvery?: number;
    /** Speed while wandering, as a fraction of its chasing speed. */
    pace?: number;
};

/** Ambles about at random until the player comes near, then chases for good. */
export class Wander implements IMonsterBehaviour {
    private heading: Vec2Like = STILL;
    private untilTurn = 0;
    private aggro = false;
    private options: Required<WanderOptions>;

    constructor(options: WanderOptions = {}) {
        this.options = { aggroRange: 5, turnEvery: 1.5, pace: 0.5, ...options };
    }

    Steer(context: MonsterContext): Vec2Like {
        const distance = context.flow.DistanceAt(context.tile.x, context.tile.y);
        if (distance !== UNREACHABLE && distance <= this.options.aggroRange) {
            this.aggro = true;
        }
        if (this.aggro) {
            return FollowFlow(context);
        }

        this.untilTurn -= context.dt;
        if (this.untilTurn <= 0) {
            this.untilTurn = this.options.turnEvery * (0.5 + context.random());
            // One turn in four is a pause.
            if (context.random() < 0.25) {
                this.heading = STILL;
            } else {
                const angle = context.random() * Math.PI * 2;
                this.heading = { x: Math.cos(angle) * this.options.pace, y: Math.sin(angle) * this.options.pace };
            }
        }
        return this.heading;
    }
}

export type KeepDistanceOptions = {
    /** Walking distance in tiles it tries to hold from the player. */
    range?: number;
    /** How much closer than `range` it tolerates before backing off. */
    slack?: number;
};

/** Closes to about `range` tiles' walk from the player, then holds - backing off if the player closes in. Pairs with a `ranged` attack. */
export class KeepDistance implements IMonsterBehaviour {
    private options: Required<KeepDistanceOptions>;

    constructor(options: KeepDistanceOptions = {}) {
        this.options = { range: 5, slack: 1.5, ...options };
    }

    Steer(context: MonsterContext): Vec2Like {
        const distance = context.flow.DistanceAt(context.tile.x, context.tile.y);
        if (distance === UNREACHABLE) {
            return STILL;
        }
        if (distance > this.options.range) {
            return FollowFlow(context);
        }
        if (distance < this.options.range - this.options.slack) {
            return TowardCell(context, context.flow.AwayCell(context.tile.x, context.tile.y));
        }
        return STILL;
    }
}

/**
 * A push on `positions[index]` away from every other position within `radius`
 * pixels - stronger the closer they are, capped at length 1 - so a crowd
 * following the same flow line spreads out instead of stacking into one
 * sprite. Two on the exact same spot are pushed opposite ways by index so they
 * don't stay stuck together.
 */
export function Separation(index: number, positions: ReadonlyArray<Vec2Like>, radius: number): Vec2Like {
    const self = positions[index];
    let x = 0;
    let y = 0;
    for (let i = 0; i < positions.length; i++) {
        if (i === index) {
            continue;
        }
        const other = positions[i];
        const dx = self.x - other.x;
        const dy = self.y - other.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance >= radius) {
            continue;
        }
        const strength = 1 - distance / radius;
        if (distance > 0) {
            x += (dx / distance) * strength;
            y += (dy / distance) * strength;
        } else {
            x += index < i ? -strength : strength;
        }
    }
    const length = Math.sqrt(x * x + y * y);
    return length > 1 ? { x: x / length, y: y / length } : { x, y };
}
