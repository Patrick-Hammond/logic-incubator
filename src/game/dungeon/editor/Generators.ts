import {MapType} from "./Constants";
import {Map} from "rot-js";
import {ILevelDataState} from "./stores/LevelDataStore";
import {Brush} from "./Types";

export function GenerateMap(mapType: MapType, width: number, height: number): ILevelDataState {

    let map: Brush[] = [];

    switch(mapType) {
        case MapType.DIGGER:
            let arena = new Map.Digger(width, height);
            arena.create((x: number, y: number, contents: number) => {
                console.log(contents);
                if(contents == 0) {
                    map.push({name: "floor_1", position: {x: x, y: y}, rotation: 0, pixelOffset: {x: 0, y: 0}});
                }
            });
    }

    return {levelData: map};
}