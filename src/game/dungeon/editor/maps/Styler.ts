import Dungeon from "rot-js/lib/map/dungeon";
import {IRectangle, Rectangle} from "../../../../_lib/math/Geometry";
import {IBrush} from "../stores/LevelDataStore";
import {IMap, MapType} from "./Generators";

export interface IStyler {
    StyleRoom(rect: IRectangle, doors?: {[key: string]: number}): IBrush[];
}

export function ApplyMapStyle(map: IMap, styler: IStyler): IMap {

    switch(map.type) {
        case MapType.DIGGER:
        case MapType.UNIFORM:
            return StyleDungeon(map, styler);
        case MapType.ROGUE:
            return StyleRogue(map, styler);
        default:
            return map;
    }
}

function StyleDungeon(map: IMap, styler: IStyler): IMap {

    let result = map.levelData;

    (map.dungeon as Dungeon)._rooms.forEach(room => {

        const roomRect = new Rectangle(room._x1, room._y1, room._x2 - room._x1, room._y2 - room._y1);

        // remove old room
        result = result.filter(brush => !roomRect.Contains(brush.position.x, brush.position.y));

        // style room
        result.push(...styler.StyleRoom(roomRect, room._doors));

    });
    return {...map, levelData: result};
}

type RogueRoom = {connections: number[][], cellx: number, celly: number} & IRectangle;

function StyleRogue(map: IMap, styler: IStyler): IMap {

    let result = map.levelData;

    (map.dungeon["rooms"] as RogueRoom[][]).forEach(cell => {

        cell.forEach(room => {

            const roomRect = new Rectangle(room.x, room.y, room.width, room.height);

            // remove old room
            result = result.filter(brush => !roomRect.Contains(brush.position.x, brush.position.y));

            // style room
            result.push(...styler.StyleRoom(roomRect));
        });

    });
    return {...map, levelData: result};
}
