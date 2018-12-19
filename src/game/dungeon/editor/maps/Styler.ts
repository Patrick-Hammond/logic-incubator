import {MapType, IMap} from "./Generators";
import {Brush, Point} from "../Types";

export interface IStyler {
    TopLeft(x:number, y:number):Brush[];
    TopRight(x:number, y:number):Brush[];
    BottomLeft(x:number, y:number):Brush[];
    BottomRight(x:number, y:number):Brush[];
    Top(y:number, width:number):Brush[];
    Bottom(y:number, width:number):Brush[];
    Left(x:number, height:number):Brush[];
    Right(x:number, height:number):Brush[];
    Floor(x:number, y:number, width:number, height:number):Brush[];
}

export function ApplyMapStyle(map: IMap, styler:IStyler): IMap {

    switch (map.type)
    {
        case MapType.DIGGER:
        case MapType.UNIFORM:
            return StyleDungeon(map, styler);
        default:
            return StyleMap(map, styler);
    }
}

function RemoveTiles(data:Brush[], pos:Point):Brush[]
{
    return data.filter(brush => brush.position.x != pos.x && brush.position.y != pos.y);
}

function StyleDungeon(map: IMap, styler:IStyler): IMap
{
    let result = map.levelData;

    map.dungeon._rooms.forEach(room =>
        {
            let roomRect = new PIXI.Rectangle(room._x1, room._y1, room._x2 - room._x1, room._y2 - room._y1);

            //remove old room
            result = result.filter(brush => roomRect.contains(brush.position.x, brush.position.y));

            //style corners
            result.push(
                ...styler.TopLeft(roomRect.x, roomRect.y),
                ...styler.TopRight(roomRect.x + roomRect.width, roomRect.y),
                ...styler.BottomLeft(roomRect.x, roomRect.y + roomRect.height),
                ...styler.BottomRight(roomRect.x + roomRect.width, roomRect.y),
                ...styler.Top(roomRect.y, roomRect.width),
                ...styler.Bottom(roomRect.y, roomRect.width),
                ...styler.Left(roomRect.x, roomRect.height),
                ...styler.Right(roomRect.x + roomRect.width, roomRect.height)
            );
            
            //style the floor
            //result.push(...styler.Floor());
           
        });
    return map;
}

function StyleMap(map: IMap, styler:IStyler): IMap
{
    return map;
}