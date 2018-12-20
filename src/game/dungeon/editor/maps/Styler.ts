import {MapType, IMap} from "./Generators";
import {IRectangle, Rectangle} from "../../../../_lib/math/Geometry";
import {Brush} from "../stores/LevelDataStore";

export interface IStyler {
    Style(rect: IRectangle): Brush[];
}

export function ApplyMapStyle(map: IMap, styler: IStyler): IMap {

    switch(map.type) {
        case MapType.DIGGER:
        case MapType.UNIFORM:
            return StyleDungeon(map, styler);
        default:
            return StyleMap(map, styler);
    }
}

function StyleDungeon(map: IMap, styler: IStyler): IMap {
    let result = map.levelData;

    map.dungeon._rooms.forEach(room => {
        let roomRect = new Rectangle(room._x1, room._y1, room._x2 - room._x1, room._y2 - room._y1);

        //remove old room
        result = result.filter(brush => !roomRect.Contains(brush.position.x, brush.position.y));

        //style corners
        result.push(...styler.Style(roomRect));

    });
    return {...map, levelData: result};
}

function StyleMap(map: IMap, styler: IStyler): IMap {
    return map;
}