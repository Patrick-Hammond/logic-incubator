import {PointLike, RectangleLike} from "../../../../_lib/math/Geometry";
import {Brush} from "../stores/LevelDataStore";
import {IStyler} from "./Styler";

const defaultBrush: Brush = {name: "", position: {x: 0, y: 0}, pixelOffset: {x: 0, y: 0}, rotation: 0, scale: {x: 1, y: 1}};

export abstract class BaseStyle implements IStyler {

    protected rect: RectangleLike;
    protected doors: PointLike[];

    StyleRoom(rect: RectangleLike, doors?: {[ key: string ]: number}): Brush[] {

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
            ...this.BottomRight(),
            ...this.TopWall(),
            ...this.BottomWall(),
            ...this.LeftWall(),
            ...this.RightWall(),
            ...this.Doors()
        ];
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
            return {...defaultBrush, name, position: {x, y}};
        });
    }

    protected FillRect(rect: RectangleLike, cb: (position: PointLike) => string): Brush[] {
        const result: Brush[] = [];
        for(let i = 0; i <= rect.width; i++) {
            for(let j = 0; j <= rect.height; j++) {
                const position = {x: rect.x + i, y: rect.y + j};
                result.push({...defaultBrush, name: cb(position), position});
            }
        }
        return result;
    }
}
