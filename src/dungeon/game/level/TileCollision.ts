import { Rectangle, Vec2Like } from "../../../_lib/math/Geometry";
import { TileSize } from "../../Constants";
import Level from "./Level";

export default class TileCollision {
    private playerBounds = new Rectangle(0, 0, TileSize - 1, TileSize - 1);

    constructor(private level: Level) {}

    TestX(from: Vec2Like, dir: number): number {
        this.playerBounds.x = from.x + dir;
        const yBottom = from.y + this.playerBounds.height;
        if (dir > 0) {
            const x = this.playerBounds.x + this.playerBounds.width;
            if (this.IsColliding(x, from.y) || this.IsColliding(x, yBottom)) {
                return (Math.floor(x / TileSize) - 1) * TileSize;
            }
        } else {
            const x = this.playerBounds.x;
            if (this.IsColliding(x, from.y) || this.IsColliding(x, yBottom)) {
                return (Math.floor(x / TileSize) + 1) * TileSize;
            }
        }

        return null;
    }

    TestY(from: Vec2Like, dir: number): number {
        this.playerBounds.y = from.y + dir;
        const xRight = from.x + this.playerBounds.width;
        if (dir > 0) {
            const y = this.playerBounds.y + this.playerBounds.height;
            if (this.IsColliding(from.x, y) || this.IsColliding(xRight, y)) {
                return (Math.floor(y / TileSize) - 1) * TileSize;
            }
        } else {
            const y = this.playerBounds.y;
            if (this.IsColliding(from.x, y) || this.IsColliding(xRight, y)) {
                return (Math.floor(y / TileSize) + 1) * TileSize;
            }
        }

        return null;
    }

    /**
     * Called when a vertical step of `dir` has been blocked by TestY. If the
     * blocker is really a one-tile column gap in a horizontal wall that the
     * player's horizontal centre is already over (rather than a solid wall or a
     * stray tile), returns the X the player should jump to so it sits fully
     * inside that gap column. null means "block normally".
     *
     * The player box is one pixel narrower than a tile, so it spans one or two
     * columns. Spanning two, with the centre over an open column, a side solid,
     * and the wall continuing solid past both sides of the gap, is the "lined
     * up with a gap but a corner is catching" case the head-start is for.
     */
    GapAlignX(from: Vec2Like, dir: number): number {
        if (dir === 0) {
            return null;
        }

        const w = this.playerBounds.width;
        const row = ((dir > 0 ? from.y + dir + this.playerBounds.height : from.y + dir) / TileSize) | 0;

        const leadCol = (from.x / TileSize) | 0;
        const trailCol = ((from.x + w) / TileSize) | 0;
        if (leadCol === trailCol) {
            return null; // fits in one column -> the thing it hit is a wall
        }

        const centreCol = ((from.x + w * 0.5) / TileSize) | 0;
        if (this.IsSolidTile(centreCol, row)) {
            return null; // centre is not over an opening
        }
        if (!this.IsSolidTile(leadCol, row) && !this.IsSolidTile(trailCol, row)) {
            return null; // neither side solid -> TestY was not blocked by a gap edge here
        }
        if (!this.IsSolidTile(centreCol - 1, row) || !this.IsSolidTile(centreCol + 1, row)) {
            return null; // not a real wall with a hole - just a stray tile the player clipped
        }

        return centreCol * TileSize;
    }

    /**
     * Mirror of GapAlignX for a horizontal step blocked by TestX: a one-tile row
     * gap (a doorway) in a vertical wall that the player's vertical centre is
     * lined up with. Returns the Y to jump to, or null to block normally.
     */
    GapAlignY(from: Vec2Like, dir: number): number {
        if (dir === 0) {
            return null;
        }

        const h = this.playerBounds.height;
        const col = ((dir > 0 ? from.x + dir + this.playerBounds.width : from.x + dir) / TileSize) | 0;

        const leadRow = (from.y / TileSize) | 0;
        const trailRow = ((from.y + h) / TileSize) | 0;
        if (leadRow === trailRow) {
            return null; // fits in one row -> the thing it hit is a wall
        }

        const centreRow = ((from.y + h * 0.5) / TileSize) | 0;
        if (this.IsSolidTile(col, centreRow)) {
            return null; // centre is not over an opening
        }
        if (!this.IsSolidTile(col, leadRow) && !this.IsSolidTile(col, trailRow)) {
            return null; // neither side solid -> TestX was not blocked by a gap edge here
        }
        if (!this.IsSolidTile(col, centreRow - 1) || !this.IsSolidTile(col, centreRow + 1)) {
            return null; // not a real vertical wall with a hole - just a stray tile
        }

        return centreRow * TileSize;
    }

    private IsColliding(x: number, y: number): boolean {
        return this.IsSolidTile((x / TileSize) | 0, (y / TileSize) | 0);
    }

    private IsSolidTile(tx: number, ty: number): boolean {
        return this.level.collisionData[tx] && this.level.collisionData[tx][ty];
    }
}
