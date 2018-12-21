import {Brush} from "../stores/LevelDataStore";
import {BaseStyle} from "./BaseStyle";
import {IPoint, Rectangle} from "../../../../_lib/math/Geometry";
import RNG from "rot-js/lib/rng";

export class Style0x7 extends BaseStyle {

    TopLeft(): Brush[] {
        return this.Fill([ "wall_inner_corner_mid_left" ], this.rect.x, this.rect.y)
            .concat(this.Fill([ "wall_top_left" ], this.rect.x, this.rect.y - 1));
    }

    TopRight(): Brush[] {
        return this.Fill([ "wall_inner_corner_mid_rigth" ], this.rect.x + this.rect.width, this.rect.y)
            .concat(this.Fill([ "wall_top_right" ], this.rect.x + this.rect.width, this.rect.y - 1));
    }

    BottomLeft(): Brush[] {
        return this.Fill([ "wall_inner_corner_l_top_left", "wall_top_left" ], this.rect.x, this.rect.y + this.rect.height - 1)
            .concat(this.Fill([ "wall_left" ], this.rect.x, this.rect.y + this.rect.height));
    }

    BottomRight(): Brush[] {
        return this.Fill([ "wall_inner_corner_l_top_rigth", "wall_top_right" ], this.rect.x + this.rect.width, this.rect.y + this.rect.height - 1)
            .concat(this.Fill([ "wall_right" ], this.rect.x + this.rect.width, this.rect.y + this.rect.height));
    }

    TopWall(): Brush[] {
        let result: Brush[] = [];
        for(let w = 1; w < this.rect.width; w++) {
            result.push(...this.Fill([ "wall_mid" ], this.rect.x + w, this.rect.y));
            result.push(...this.Fill([ "wall_top_mid" ], this.rect.x + w, this.rect.y - 1));
        }
        return result;
    }

    BottomWall(): Brush[] {
        let result: Brush[] = [];
        for(let w = 1; w < this.rect.width; w++) {
            result.push(...this.Fill([ "wall_top_mid" ], this.rect.x + w, this.rect.y + this.rect.height - 1));
            result.push(...this.Fill([ "wall_mid" ], this.rect.x + w, this.rect.y + this.rect.height));
        }
        return result;
    }

    LeftWall(): Brush[] {
        let result: Brush[] = [];
        for(let h = 1; h < this.rect.height - 1; h++) {
            result.push(...this.Fill([ "wall_side_mid_right" ], this.rect.x, this.rect.y + h));
        }
        return result;
    }

    RightWall(): Brush[] {
        let result: Brush[] = [];
        for(let h = 1; h < this.rect.height - 1; h++) {
            result.push(...this.Fill([ "wall_side_mid_left" ], this.rect.x + this.rect.width, this.rect.y + h));
        }
        return result;
    }

    Floor(): Brush[] {
        
        let floorTiles = {"floor_1": 900, "floor_2": 5, "floor_3": 5, "floor_4": 1, "floor_5": 5};
        let edgeDirt = {"floor_1": 20, "floor_4": 1, "floor_6": 1, "floor_7": 1, "floor_8": 1};
        let floorArea = new Rectangle(this.rect.x, this.rect.y + 1, this.rect.width, this.rect.height - 1);
        let roomPerimeter = new Rectangle(this.rect.x, this.rect.y + 1, this.rect.width, this.rect.height - 1);
        return this.FillRect(floorArea, (position:IPoint) =>
        {
            if( position.x == roomPerimeter.left ||
                position.x == roomPerimeter.right ||
                position.y == roomPerimeter.top ||
                position.y == roomPerimeter.bottom
            ){
                return RNG.getWeightedValue(edgeDirt);
            }
            else {
                return RNG.getWeightedValue(floorTiles);
            }
        });
    }

    Doors(): Brush[] {
        let result: Brush[] = [];
        this.doors.forEach(door =>{
            result.push(...this.Fill([ "crate" ], door.x, door.y));
        });
        return result;
    }
}