import Dungeon from "rot-js/lib/map/dungeon";
import Map from "rot-js/lib/map/map";
import Digger from "rot-js/lib/map/digger";
import Cellular from "rot-js/lib/map/cellular";
import IceyMaze from "rot-js/lib/map/iceymaze";
import EllerMaze from "rot-js/lib/map/ellermaze";
import DividedMaze from "rot-js/lib/map/dividedmaze";
import Uniform from "rot-js/lib/map/uniform";
import Rogue from "rot-js/lib/map/rogue";
import {Brush} from "../stores/LevelDataStore";

export const enum MapType {
    DIGGER, ROGUE, UNIFORM, DIVIDED_MAZE, ELLER_MAZE, ICEY_MAZE, CELLULAR
}

export interface IMap {
    type: MapType,
    levelData: Brush[],
    dungeon: Dungeon | Map
}

export function GenerateMap(mapType: MapType, width: number, height: number): IMap {

    let map: Brush[] = [];
    let dungeon: Dungeon | Map = null;

    width = width | 0;
    height = height | 0;

    switch(mapType) {
        case MapType.DIGGER:
            dungeon = new Digger(width, height, {roomHeight: [ 8, 30 ], roomWidth: [ 8, 30 ], dugPercentage: 0.3, timeLimit: 60000});
            dungeon.create((x: number, y: number, value: number) => {
                if(value == 0) {
                    map.push({name: "floor_1", position: {x: x, y: y}, rotation: 0, pixelOffset: {x: 0, y: 0}});
                }
            });
            break;
        case MapType.ROGUE:
            let maxRoomSize = {width: 30, height: 30};
            dungeon = new Rogue(width, height, {cellWidth: width / maxRoomSize.width, cellHeight: height / maxRoomSize.height, roomHeight: [ 8, 30 ], roomWidth: [ 8, 30 ]});
            dungeon.create((x: number, y: number, value: number) => {
                if(value == 0) {
                    map.push({name: "floor_1", position: {x: x, y: y}, rotation: 0, pixelOffset: {x: 0, y: 0}});
                }
            });
            break;
        case MapType.UNIFORM:
            dungeon = new Uniform(width, height, {roomHeight: [ 2, 10 ], roomWidth: [ 5, 18 ], roomDugPercentage: 0.3, timeLimit: 60000});
            dungeon.create((x: number, y: number, value: number) => {
                if(value == 0) {
                    map.push({name: "floor_1", position: {x: x, y: y}, rotation: 0, pixelOffset: {x: 0, y: 0}});
                }
            });
            break;
        case MapType.DIVIDED_MAZE:
            let dividedMaze = new DividedMaze(width, height);
            dividedMaze.create((x: number, y: number, value: number) => {
                if(value == 1) {
                    map.push({name: "wall_mid", position: {x: x, y: y}, rotation: 0, pixelOffset: {x: 0, y: 0}});
                }
            });
            break;
        case MapType.ELLER_MAZE:
            let ellerMaze = new EllerMaze(width, height);
            ellerMaze.create((x: number, y: number, value: number) => {
                if(value == 1) {
                    map.push({name: "wall_mid", position: {x: x, y: y}, rotation: 0, pixelOffset: {x: 0, y: 0}});
                }
            });
            break;
        case MapType.ICEY_MAZE:
            let iceyMaze = new IceyMaze(width, height, 0);
            iceyMaze.create((x: number, y: number, value: number) => {
                if(value == 1) {
                    map.push({name: "wall_mid", position: {x: x, y: y}, rotation: 0, pixelOffset: {x: 0, y: 0}});
                }
            });
            break;
        case MapType.CELLULAR:
            let cellular = new Cellular(width, height);
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
