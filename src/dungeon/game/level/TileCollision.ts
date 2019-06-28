import { Vec2Like, Rectangle } from "../../../_lib/math/Geometry";
import { TileSize } from "../../Constants";

export default class TileCollision {
    private playerBounds = new Rectangle(0, 0, TileSize - 1, TileSize - 1);

    constructor(private collisionData: boolean[][]) {}

    TestX(from: Vec2Like, dir: number): number {
        this.playerBounds.x = from.x + dir;

        let yTop = (from.y / TileSize) | 0;
        let yBottom = ((from.y + this.playerBounds.height) / TileSize) | 0;
        if (dir > 0) {
            let x = Math.floor((this.playerBounds.x + this.playerBounds.width) / TileSize);
            if (this.IsColliding(x, yTop) || this.IsColliding(x, yBottom)) {
                return (x - 1) * TileSize;
            }
        } else {
            let x = Math.floor(this.playerBounds.x / TileSize);
            if (this.IsColliding(x, yTop) || this.IsColliding(x, yBottom)) {
                return (x + 1) * TileSize;
            }
        }

        return null;
    }

    TestY(from: Vec2Like, dir: number): number {
        this.playerBounds.y = from.y + dir;

        let xLeft = (from.x / TileSize) | 0;
        let xRight = ((from.x + this.playerBounds.width) / TileSize) | 0;
        if (dir > 0) {
            let y = Math.floor((this.playerBounds.y + this.playerBounds.height) / TileSize);
            if (this.IsColliding(xLeft, y) || this.IsColliding(xRight, y)) {
                return (y - 1) * TileSize;
            }
        } else {
            let y = Math.floor(this.playerBounds.y / TileSize);
            if (this.IsColliding(xLeft, y) || this.IsColliding(xRight, y)) {
                return (y + 1) * TileSize;
            }
        }

        return null;
    }

    private IsColliding(x: number, y: number): boolean {
        return this.collisionData[x] && this.collisionData[x][y];
    }
}
