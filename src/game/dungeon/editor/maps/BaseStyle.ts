import {IStyler} from "./Styler";
import {IRectangle, IPoint} from "../../../../_lib/math/Geometry";
import {Brush} from "../stores/LevelDataStore";

var defaultBrush: Brush = {name: "", position: {x: 0, y: 0}, pixelOffset: {x: 0, y: 0}, rotation: 0, scale: {x: 1, y: 1}};

export abstract class BaseStyle implements IStyler {

    protected rect: IRectangle;
    protected doors: IPoint[];

    StyleRoom(rect: IRectangle, doors?: {[ key: string ]: number}): Brush[] {

        this.rect = rect;

        let result: Brush[] = [];

        this.doors = [];
        for(const key in doors) {
            if(doors.hasOwnProperty(key)) {
                const pos = key.split(",");
                this.doors.push({x: parseInt(pos[ 0 ]), y: parseInt(pos[ 1 ])});
            }
        }

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

        //doors
        result.push(...this.Doors());

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
    abstract Doors(): Brush[];

    protected Fill(tileNames: string[], x: number, y: number): Brush[] {
        return tileNames.map(name => {
            return {...defaultBrush, name: name, position: {x: x, y: y}};
        });
    }

    protected FillRect(rect: IRectangle, cb: (position: IPoint) => string): Brush[] {
        let result: Brush[] = [];
        for(let i = 0; i <= rect.width; i++) {
            for(let j = 0; j <= rect.height; j++) {
                let position = {x: rect.x + i, y: rect.y + j};
                result.push({...defaultBrush, name: cb(position), position: position});
            }
        }
        return result;
    }
}