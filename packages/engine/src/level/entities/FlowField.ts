/**
 * Walking distance from every cell of the map to one target cell (the player's),
 * shared by every monster: one search whenever the target changes cell, then each
 * monster's next step is a lookup of its neighbours. Pure - no pixi - so it runs
 * under the plain node test runner, same as Spawners.ts.
 */

import { Vec2Like } from "@logic-incubator/lib/math/Geometry";

/** `DistanceAt` for a solid, out-of-bounds or unreachable cell. */
export const UNREACHABLE = -1;

/** Step costs, x10 so a diagonal (~1.414) stays an integer - a straight line beats a zig-zag of equal cell count. */
const STRAIGHT = 10;
const DIAGONAL = 14;

const NEIGHBOURS: ReadonlyArray<{ x: number; y: number; cost: number }> = [
    { x: 1, y: 0, cost: STRAIGHT },
    { x: -1, y: 0, cost: STRAIGHT },
    { x: 0, y: 1, cost: STRAIGHT },
    { x: 0, y: -1, cost: STRAIGHT },
    { x: 1, y: 1, cost: DIAGONAL },
    { x: 1, y: -1, cost: DIAGONAL },
    { x: -1, y: 1, cost: DIAGONAL },
    { x: -1, y: -1, cost: DIAGONAL }
];

/** What monster behaviours read from the field - an interface so their tests can hand them a stub. */
export interface IFlowField {
    /** Walking distance in tiles from the cell to the target, or `UNREACHABLE`. */
    DistanceAt(x: number, y: number): number;
    /** The neighbouring cell one step closer to the target, or null at the target or with no way there. */
    NextCell(x: number, y: number): Vec2Like | null;
    /** The neighbouring cell one step further from the target, or null if none is. */
    AwayCell(x: number, y: number): Vec2Like | null;
}

export default class FlowField implements IFlowField {
    private readonly cost: Int32Array;
    private readonly heap: Int32Array;
    private targetX = Number.NaN;
    private targetY = Number.NaN;
    private dirty = true;

    /**
     * `isSolid` is read live on every recompute, so a cell that opens up (a destroyed spawner) only
     * needs `MarkDirty`. `isHeightGap` (see `Depth.IsHeightGap`), given the step's two endpoints, is
     * separate from solidity - an otherwise-open neighbour a monster can't actually step to because
     * of its height, so pathing doesn't route them into a gap they'd immediately bounce off (see
     * `PlayerMovement.ResolveMove`'s own height check). Omit it where height doesn't matter - nothing
     * is excluded on its account.
     */
    constructor(
        readonly width: number,
        readonly height: number,
        private isSolid: (x: number, y: number) => boolean,
        private isHeightGap?: (x1: number, y1: number, x2: number, y2: number) => boolean
    ) {
        this.cost = new Int32Array(Math.max(0, width * height)).fill(UNREACHABLE);
        // Each cell is pushed at most once per neighbour that lowers its cost - 8 is a safe bound.
        this.heap = new Int32Array(Math.max(1, width * height * 8) * 2);
    }

    /** Forces the next `Update` to recompute even if the target hasn't moved - call when a cell's solidity changes. */
    MarkDirty(): void {
        this.dirty = true;
    }

    /** Recomputes the field if the target has changed cell (or it was marked dirty). Returns whether it did. */
    Update(targetX: number, targetY: number): boolean {
        if (!this.dirty && targetX === this.targetX && targetY === this.targetY) {
            return false;
        }
        this.targetX = targetX;
        this.targetY = targetY;
        this.dirty = false;
        this.Search();
        return true;
    }

    DistanceAt(x: number, y: number): number {
        if (!this.InBounds(x, y)) {
            return UNREACHABLE;
        }
        const cost = this.cost[x + y * this.width];
        return cost === UNREACHABLE ? UNREACHABLE : cost / STRAIGHT;
    }

    NextCell(x: number, y: number): Vec2Like | null {
        const own = this.InBounds(x, y) ? this.cost[x + y * this.width] : UNREACHABLE;
        let best: Vec2Like | null = null;
        let bestCost = own === UNREACHABLE ? Number.MAX_VALUE : own;
        this.ForEachStep(x, y, (nx, ny) => {
            const cost = this.cost[nx + ny * this.width];
            if (cost !== UNREACHABLE && cost < bestCost) {
                bestCost = cost;
                best = { x: nx, y: ny };
            }
        });
        return best;
    }

    AwayCell(x: number, y: number): Vec2Like | null {
        const own = this.InBounds(x, y) ? this.cost[x + y * this.width] : UNREACHABLE;
        if (own === UNREACHABLE) {
            return null;
        }
        let best: Vec2Like | null = null;
        let bestCost = own;
        this.ForEachStep(x, y, (nx, ny) => {
            const cost = this.cost[nx + ny * this.width];
            if (cost !== UNREACHABLE && cost > bestCost) {
                bestCost = cost;
                best = { x: nx, y: ny };
            }
        });
        return best;
    }

    private InBounds(x: number, y: number): boolean {
        return x >= 0 && y >= 0 && x < this.width && y < this.height;
    }

    private Open(x: number, y: number): boolean {
        return this.InBounds(x, y) && !this.isSolid(x, y);
    }

    /** Every open neighbour a one-tile box can step to - a diagonal only when both cells it passes between are open, so nothing cuts a wall's corner. */
    private ForEachStep(x: number, y: number, visit: (nx: number, ny: number, cost: number) => void): void {
        for (let i = 0; i < NEIGHBOURS.length; i++) {
            const n = NEIGHBOURS[i];
            const nx = x + n.x;
            const ny = y + n.y;
            if (!this.Open(nx, ny)) {
                continue;
            }
            if (this.isHeightGap && this.isHeightGap(x, y, nx, ny)) {
                continue;
            }
            if (n.x !== 0 && n.y !== 0 && (!this.Open(x + n.x, y) || !this.Open(x, y + n.y))) {
                continue;
            }
            visit(nx, ny, n.cost);
        }
    }

    /** Dijkstra from the target over open cells, on a binary heap of (cost, cell) pairs. */
    private Search(): void {
        this.cost.fill(UNREACHABLE);
        if (!this.Open(this.targetX, this.targetY)) {
            return;
        }

        const heap = this.heap;
        let size = 0;
        const push = (cost: number, cell: number) => {
            let i = size++;
            while (i > 0) {
                const parent = (i - 1) >> 1;
                if (heap[parent * 2] <= cost) {
                    break;
                }
                heap[i * 2] = heap[parent * 2];
                heap[i * 2 + 1] = heap[parent * 2 + 1];
                i = parent;
            }
            heap[i * 2] = cost;
            heap[i * 2 + 1] = cell;
        };
        const pop = (): number => {
            const cell = heap[1];
            const lastCost = heap[--size * 2];
            const lastCell = heap[size * 2 + 1];
            let i = 0;
            for (;;) {
                let child = i * 2 + 1;
                if (child >= size) {
                    break;
                }
                if (child + 1 < size && heap[(child + 1) * 2] < heap[child * 2]) {
                    child++;
                }
                if (heap[child * 2] >= lastCost) {
                    break;
                }
                heap[i * 2] = heap[child * 2];
                heap[i * 2 + 1] = heap[child * 2 + 1];
                i = child;
            }
            heap[i * 2] = lastCost;
            heap[i * 2 + 1] = lastCell;
            return cell;
        };

        const start = this.targetX + this.targetY * this.width;
        this.cost[start] = 0;
        push(0, start);

        while (size > 0) {
            const cost = heap[0];
            const cell = pop();
            if (cost > this.cost[cell]) {
                continue; // a stale entry - the cell was reached more cheaply since
            }
            const x = cell % this.width;
            const y = (cell / this.width) | 0;
            this.ForEachStep(x, y, (nx, ny, step) => {
                const next = nx + ny * this.width;
                const nextCost = cost + step;
                const known = this.cost[next];
                if (known === UNREACHABLE || nextCost < known) {
                    this.cost[next] = nextCost;
                    push(nextCost, next);
                }
            });
        }
    }
}
