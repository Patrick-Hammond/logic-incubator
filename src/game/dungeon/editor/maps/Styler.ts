import {MapType, IMap} from "./Generators";
import {Brush, Point} from "../Types";

export interface IStyler {
    TopLeft():Brush[];
    TopRight():Brush[];
    BottomLeft():Brush[];
    BottomRight():Brush[];
    Top():Brush[];
    Bottom():Brush[];
    Left():Brush[];
    Right():Brush[];
    Floor():Brush[];
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
            

            //style corners
            let topLeft = {x:room._x1, y:room._y1};
            result = [...RemoveTiles(result, topLeft), ...styler.TopLeft()];

            let topRight = {x:room._x2, y:room._y1};
            result = [...RemoveTiles(result, topRight), ...styler.TopRight()];
            
            let bottomLeft = {x:room._x1, y:room._y2};
            result = [...RemoveTiles(result, bottomLeft), ...styler.BottomLeft()];

            let bottomRight = {x:room._x2, y:room._y2};
            result = [...RemoveTiles(result, bottomRight), ...styler.BottomRight()];
        });
    return map;
}

function StyleMap(map: IMap, styler:IStyler): IMap
{
    return map;
}