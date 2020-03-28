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

    private IsColliding(x: number, y: number): boolean {
        x = (x / TileSize) | 0;
        y = (y / TileSize) | 0;
        return this.level.collisionData[x] && this.level.collisionData[x][y];
    }
}
