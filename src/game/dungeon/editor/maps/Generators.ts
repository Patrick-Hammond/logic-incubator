import {Map} from "rot-js";
import Dungeon from "rot-js/lib/map/dungeon";
import {Brush} from "../stores/LevelDataStore";

export const enum MapType {
    DIGGER, ROGUE, UNIFORM, DIVIDED_MAZE, ELLER_MAZE, ICEY_MAZE, CELLULAR
}

export interface IMap {
    type: MapType,
    levelData: Brush[],
    dungeon: Dungeon
}

export function GenerateMap(mapType: MapType, width: number, height: number): IMap {

    let map: Brush[] = [];
    let dungeon: Dungeon = null;

    width = width | 0;
    height = height | 0;

    switch(mapType) {
        case MapType.DIGGER:
            dungeon = new Map.Digger(width, height, {roomHeight: [ 8, 30 ], roomWidth: [ 8, 30 ], dugPercentage: 0.3, timeLimit: 60000});
            dungeon.create((x: number, y: number, value: number) => {
                if(value == 0) {
                    map.push({name: "floor_1", position: {x: x, y: y}, rotation: 0, pixelOffset: {x: 0, y: 0}});
                }
            });
            break;
        case MapType.ROGUE:
            let maxRoomSize = {width: 30, height: 30};
            let rouge = new Map.Rogue(width, height, {cellWidth: width / maxRoomSize.width, cellHeight: height / maxRoomSize.height, roomHeight: [ 8, 30 ], roomWidth: [ 8, 30 ]});
            rouge.create((x: number, y: number, value: number) => {
                if(value == 0) {
                    map.push({name: "floor_1", position: {x: x, y: y}, rotation: 0, pixelOffset: {x: 0, y: 0}});
                }
                //todo: rewrite Rogue as a Dungeon subclass
            });
            break;
        case MapType.UNIFORM:
            dungeon = new Map.Uniform(width, height, {roomHeight: [ 2, 10 ], roomWidth: [ 5, 18 ], roomDugPercentage: 0.3, timeLimit: 60000});
            dungeon.create((x: number, y: number, value: number) => {
                if(value == 0) {
                    map.push({name: "floor_1", position: {x: x, y: y}, rotation: 0, pixelOffset: {x: 0, y: 0}});
                }
            });
            break;
        case MapType.DIVIDED_MAZE:
            let dividedMaze = new Map.DividedMaze(width, height);
            dividedMaze.create((x: number, y: number, value: number) => {
                if(value == 1) {
                    map.push({name: "wall_mid", position: {x: x, y: y}, rotation: 0, pixelOffset: {x: 0, y: 0}});
                }
            });
            break;
        case MapType.ELLER_MAZE:
            let ellerMaze = new Map.EllerMaze(width, height);
            ellerMaze.create((x: number, y: number, value: number) => {
                if(value == 1) {
                    map.push({name: "wall_mid", position: {x: x, y: y}, rotation: 0, pixelOffset: {x: 0, y: 0}});
                }
            });
            break;
        case MapType.ICEY_MAZE:
            let iceyMaze = new Map.IceyMaze(width, height, 0);
            iceyMaze.create((x: number, y: number, value: number) => {
                if(value == 1) {
                    map.push({name: "wall_mid", position: {x: x, y: y}, rotation: 0, pixelOffset: {x: 0, y: 0}});
                }
            });
            break;
        case MapType.CELLULAR:
            let cellular = new Map.Cellular(width, height);
            cellular.randomize(0.5);
            for(var i = 0; i < 3; i++) {
                cellular.create((x: number, y: number, value: number) => {
                    if(i == 2 && value == 0) {
                        map.push({name: "floor_1", position: {x: x, y: y}, rotation: 0, pixelOffset: {x: 0, y: 0}});
                    }
                });
            }
            break;
    }

    return {type: mapType, levelData: map, dungeon: dungeon};
}
