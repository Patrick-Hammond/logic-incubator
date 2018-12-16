import {MapType} from "./Constants";
import {Map, RNG} from "rot-js";
import {ILevelDataState} from "./stores/LevelDataStore";
import {Brush} from "./Types";

export function GenerateMap(mapType: MapType, width: number, height: number): ILevelDataState {

    let map: Brush[] = [];

    RNG.setSeed(Math.random());

    switch(mapType) {
        case MapType.DIGGER:
            let arena = new Map.Digger(width, height);
            arena.create((x: number, y: number, value: number) => {
                if(value == 0) {
                    map.push({name: "floor_1", position: {x: x, y: y}, rotation: 0, pixelOffset: {x: 0, y: 0}});
                }
            });
            break;
        case MapType.ROGUE:
            let maxRoomSize = {width: 20, height: 15};
            let rouge = new Map.Rogue(width, height, {cellWidth: width / maxRoomSize.width, cellHeight: height / maxRoomSize.height, roomHeight: [ 2, 10 ], roomWidth: [ 5, 18 ]});
            rouge.create((x: number, y: number, value: number) => {
                if(value == 0) {
                    map.push({name: "floor_1", position: {x: x, y: y}, rotation: 0, pixelOffset: {x: 0, y: 0}});
                }
            });
            break;
        case MapType.CELLULAR:
            let cellular = new Map.Cellular(width, height);
            cellular.create((x: number, y: number, value: number) => {
                console.log(value);
                if(value == 0) {
                    map.push({name: "floor_1", position: {x: x, y: y}, rotation: 0, pixelOffset: {x: 0, y: 0}});
                }
            });
            break;
    }

    return {levelData: map};
}