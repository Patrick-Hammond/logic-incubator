import Dungeon from "rot-js/lib/map/dungeon";
import { Rectangle, RectangleLike } from "@logic-incubator/lib/math/Geometry";
import { Brush } from "@logic-incubator/engine/level/LevelFormat";
import { IMap, MapTiles, MapType } from "./Generators";

/**
 * How the editor's map generators (keys 1-8) paint with a game's tiles: the plain floor and wall a
 * map is laid out with, then each room restyled in the game's own art. A game hands one to the
 * editor (`IDungeonEditorOptions.mapStyle`) - usually by extending `BaseStyle`.
 */
export interface IStyler extends MapTiles {
    StyleRoom(rect: RectangleLike, doors?: { [key: string]: number }): Brush[];
}

export function ApplyMapStyle(map: IMap, styler: IStyler): IMap {
    switch (map.type) {
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
    return { ...map, levelData: result };
}

type RogueRoom = { connections: number[][]; cellx: number; celly: number } & RectangleLike;

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
    return { ...map, levelData: result };
}
