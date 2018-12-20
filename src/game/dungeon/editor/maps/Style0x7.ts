import {Brush} from "../stores/LevelDataStore";
import {BaseStyle} from "./BaseStyle";

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
        return this.Fill([ "floor_1", "wall_inner_corner_l_top_left" ], this.rect.x, this.rect.y + this.rect.height);
    }

    BottomRight(): Brush[] {
        return this.Fill([ "floor_1", "wall_inner_corner_l_top_rigth" ], this.rect.x + this.rect.width, this.rect.y + this.rect.height);
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
            result.push(...this.Fill([ "floor_1", "wall_top_left" ], this.rect.x + w, this.rect.y + this.rect.height));
        }
        return result;
    }

    LeftWall(): Brush[] {
        let result: Brush[] = [];
        for(let h = 1; h < this.rect.height; h++) {
            result.push(...this.Fill([ "floor_1", "wall_side_mid_right" ], this.rect.x, this.rect.y + h));
        }
        return result;
    }

    RightWall(): Brush[] {
        let result: Brush[] = [];
        for(let h = 1; h < this.rect.height; h++) {
            result.push(...this.Fill([ "floor_1", "wall_side_mid_left" ], this.rect.x + this.rect.width, this.rect.y + h));
        }
        return result;
    }

    Floor(): Brush[] {
        return this.FillRect([ "floor_1", "floor_2", "floor_3" ], {x: this.rect.x, y: this.rect.y + 1, width: this.rect.width, height: this.rect.height - 1});
    }
}