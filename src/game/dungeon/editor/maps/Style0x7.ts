import {IStyler} from "./Styler";
import {IRectangle} from "../../../../_lib/math/Geometry";
import {Brush} from "../stores/LevelDataStore";
import Rect from "rot-js/lib/display/rect";

var defaultBrush: Brush = {name: "", position: {x: 0, y: 0}, pixelOffset: {x: 0, y: 0}, rotation: 0};

export class Style0x7 implements IStyler {

    private rect: IRectangle;

    Style(rect: IRectangle): Brush[] {

        this.rect = rect;

        let result: Brush[] = [];

        //floor
        result.push(...this.Floor());

        //corners
        result.push(...this.TopLeft());
        result.push(...this.TopRight());
        result.push(...this.BottomLeft());
        result.push(...this.BottomRight());

        //walls
        result.push(...this.TopWall());
        result.push(...this.BottomWall());
        result.push(...this.LeftWall());
        result.push(...this.RightWall());

        return result;
    }

    private TopLeft(): Brush[] {
        return this.Fill([ "wall_inner_corner_mid_left" ], this.rect.x, this.rect.y)
            .concat(this.Fill([ "wall_top_left" ], this.rect.x, this.rect.y - 1));
    }

    private TopRight(): Brush[] {
        return this.Fill([ "wall_inner_corner_mid_rigth" ], this.rect.x + this.rect.width, this.rect.y)
            .concat(this.Fill([ "wall_top_right" ], this.rect.x + this.rect.width, this.rect.y - 1));
    }

    private BottomLeft(): Brush[] {
        return this.Fill([ "floor_1", "wall_inner_corner_l_top_left" ], this.rect.x, this.rect.y + this.rect.height);
    }

    private BottomRight(): Brush[] {
        return this.Fill([ "floor_1", "wall_inner_corner_l_top_rigth" ], this.rect.x + this.rect.width, this.rect.y + this.rect.height);
    }

    private TopWall(): Brush[] {
        let result: Brush[] = [];
        for(let w = 1; w < this.rect.width; w++) {
            result.push(...this.Fill([ "wall_mid" ], this.rect.x + w, this.rect.y));
            result.push(...this.Fill([ "wall_top_mid" ], this.rect.x + w, this.rect.y - 1));
        }
        return result;
    }

    private BottomWall(): Brush[] {
        let result: Brush[] = [];
        for(let w = 1; w < this.rect.width; w++) {
            result.push(...this.Fill([ "floor_1", "wall_top_left" ], this.rect.x + w, this.rect.y + this.rect.height));
        }
        return result;
    }

    private LeftWall(): Brush[] {
        let result: Brush[] = [];
        for(let h = 1; h < this.rect.height; h++) {
            result.push(...this.Fill([ "floor_1", "wall_side_mid_right" ], this.rect.x, this.rect.y + h));
        }
        return result;
    }

    private RightWall(): Brush[] {
        let result: Brush[] = [];
        for(let h = 1; h < this.rect.height; h++) {
            result.push(...this.Fill([ "floor_1", "wall_side_mid_left" ], this.rect.x + this.rect.width, this.rect.y + h));
        }
        return result;
    }

    private Floor(): Brush[] {
        return this.FillRect([ "floor_1" ], {x: this.rect.x, y: this.rect.y + 1, width: this.rect.width, height: this.rect.height - 1});
    }

    private Fill(tileNames: string[], x: number, y: number): Brush[] {
        return tileNames.map(name => {
            return {...defaultBrush, name: name, position: {x: x, y: y}};
        });
    }

    private FillRect(tileNames: string[], rect: IRectangle): Brush[] {
        let result: Brush[] = [];
        for(let i = 0; i <= rect.width; i++) {
            for(let j = 0; j <= rect.height; j++) {
                tileNames.forEach(name => {
                    result.push({...defaultBrush, name: name, position: {x: rect.x + i, y: rect.y + j}});
                });
            }
        }
        return result;
    }
}