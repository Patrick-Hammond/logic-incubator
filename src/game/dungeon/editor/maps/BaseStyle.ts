import {IPoint, IRectangle} from "../../../../_lib/math/Geometry";
import {IBrush} from "../stores/LevelDataStore";
import {IStyler} from "./Styler";

const defaultBrush: IBrush = {name: "", position: {x: 0, y: 0}, pixelOffset: {x: 0, y: 0}, rotation: 0, scale: {x: 1, y: 1}};

export abstract class BaseStyle implements IStyler {

    protected rect: IRectangle;
    protected doors: IPoint[];

    StyleRoom(rect: IRectangle, doors?: {[ key: string ]: number}): IBrush[] {

        this.rect = rect;

        this.doors = [];
        for(const key in doors) {
            if(doors.hasOwnProperty(key)) {
                const pos = key.split(",");
                this.doors.push({x: parseInt(pos[ 0 ]), y: parseInt(pos[ 1 ])});
            }
        }

        return [
            ...this.Floor(),
            ...this.TopLeft(),
            ...this.TopRight(),
            ...this.BottomLeft(),
            ...this.TopWall(),
            ...this.BottomWall(),
            ...this.LeftWall(),
            ...this.RightWall(),
            ...this.Doors()
        ];
    };

    abstract TopLeft(): IBrush[];
    abstract TopRight(): IBrush[];
    abstract BottomLeft(): IBrush[];
    abstract BottomRight(): IBrush[];
    abstract TopWall(): IBrush[];
    abstract BottomWall(): IBrush[];
    abstract LeftWall(): IBrush[];
    abstract RightWall(): IBrush[];
    abstract Floor(): IBrush[];
    abstract Doors(): IBrush[];

    protected Fill(tileNames: string[], x: number, y: number): IBrush[] {
        return tileNames.map(name => {
            return {...defaultBrush, name, position: {x, y}};
        });
    }

    protected FillRect(rect: IRectangle, cb: (position: IPoint) => string): IBrush[] {
        const result: IBrush[] = [];
        for(let i = 0; i <= rect.width; i++) {
            for(let j = 0; j <= rect.height; j++) {
                const position = {x: rect.x + i, y: rect.y + j};
                result.push({...defaultBrush, name: cb(position), position});
            }
        }
        return result;
    }
}
