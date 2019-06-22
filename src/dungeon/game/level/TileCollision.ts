import {Vec2Like, Rectangle, Vec2} from "../../../_lib/math/Geometry";
import {Lerp} from "../../../_lib/math/Utils";
import {TileSize} from "../../Constants";

export enum CollisionType {
    NONE, X, Y, XY
}

export type CollisionResult = {type:CollisionType, result:Vec2Like};

export default class TileCollision {
    
    private playerBounds = new Rectangle();
    private safe = new Vec2();

    constructor(
        private collisionData: boolean[][]) {
    }

    Test(from:Vec2Like, to:Vec2Like):CollisionResult {

        this.playerBounds.Set(from.x, from.y, TileSize, TileSize);
        let collision = 0;

        for (let subStep = 0; subStep < 4; subStep++) {

            //store un-collided position
            this.safe.Copy(this.playerBounds);

            //move player x by substep
            this.playerBounds.x = Lerp(this.playerBounds.x, to.x, 0.25 * (subStep + 1));

            //test corners
            if(this.TestCorners(this.playerBounds)) {
                collision = 1;
            }

             //move player y by substep
            this.playerBounds.x = this.safe.x;
            this.playerBounds.y = Lerp(this.playerBounds.y, to.y, 0.25 * (subStep + 1));

            //test corners
            if(this.TestCorners(this.playerBounds)) {
                collision++;
            }

            if(collision > 0) {
                return this.ResolveCollision(collision);
            }
        }
        
        return {type:CollisionType.NONE, result:null};
    }

    private TestCorners(rect:Rectangle):boolean {
        return this.IsColliding(rect.topLeft) ||
               this.IsColliding(rect.topRight) ||
               this.IsColliding(rect.bottomLeft) ||
               this.IsColliding(rect.bottomRight);
    }

    private IsColliding(point:Vec2Like):boolean {

        let x = (point.x / TileSize) | 0;
        let y = (point.y / TileSize) | 0;
        return this.collisionData[x] && this.collisionData[x][y];
    }

    private ResolveCollision(collisionType:number):CollisionResult {

        let type = CollisionType.XY;

        //x collided
        if(collisionType === 1) {
            this.playerBounds.x = this.safe.x;
            type = CollisionType.X;
        }

        //y collided
        if(collisionType === 2) {
            this.playerBounds.y = this.safe.y;
            type = CollisionType.Y;
        }

         //both collided
         if(collisionType === 3) {
            this.playerBounds.Set(this.safe.x, this.safe.y);
            type = CollisionType.XY;
        }
       
        return {type, result:this.playerBounds.Clone()};
    }
}