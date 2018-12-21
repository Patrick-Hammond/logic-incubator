import {IStyler} from "./Styler";
import {IRectangle} from "../../../../_lib/math/Geometry";
import {Brush} from "../stores/LevelDataStore";
import RNG from "rot-js/lib/rng";

var defaultBrush: Brush = {name: "", position: {x: 0, y: 0}, pixelOffset: {x: 0, y: 0}, rotation: 0};

export abstract class BaseStyle implements IStyler {

    protected rect: IRectangle;

    StyleRoom(rect: IRectangle): Brush[] {

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
    };

    abstract TopLeft(): Brush[];
    abstract TopRight(): Brush[];
    abstract BottomLeft(): Brush[];
    abstract BottomRight(): Brush[];
    abstract TopWall(): Brush[];
    abstract BottomWall(): Brush[];
    abstract LeftWall(): Brush[];
    abstract RightWall(): Brush[];
    abstract Floor(): Brush[];

    protected Fill(tileNames: string[], x: number, y: number): Brush[] {
        return tileNames.map(name => {
            return {...defaultBrush, name: name, position: {x: x, y: y}};
        });
    }

    protected FillRect(weightedTiles: {[ key: string ]: number}, rect: IRectangle): Brush[] {
        let result: Brush[] = [];
        for(let i = 0; i <= rect.width; i++) {
            for(let j = 0; j <= rect.height; j++) {
                let name = RNG.getWeightedValue(weightedTiles);
                result.push({...defaultBrush, name: name, position: {x: rect.x + i, y: rect.y + j}});
            }
        }
        return result;
    }
}