import Cellular from "rot-js/lib/map/cellular";
import Digger from "rot-js/lib/map/digger";
import DividedMaze from "rot-js/lib/map/dividedmaze";
import Dungeon from "rot-js/lib/map/dungeon";
import EllerMaze from "rot-js/lib/map/ellermaze";
import IceyMaze from "rot-js/lib/map/iceymaze";
import Map from "rot-js/lib/map/map";
import Rogue from "rot-js/lib/map/rogue";
import Uniform from "rot-js/lib/map/uniform";
import {IBrush} from "../stores/LevelDataStore";

export const enum MapType {
    DIGGER, ROGUE, UNIFORM, DIVIDED_MAZE, ELLER_MAZE, ICEY_MAZE, CELLULAR
}

export interface IMap {
    type: MapType,
    levelData: IBrush[],
    dungeon: Dungeon | Map
}

export function GenerateMap(type: MapType, width: number, height: number): IMap {

    const levelData: IBrush[] = [];
    let dungeon: Dungeon | Map = null;

    width = width | 0;
    height = height | 0;

    switch(type) {
        case MapType.DIGGER:
            dungeon = new Digger(width, height,
                {roomHeight: [4, 30], roomWidth: [4, 30], dugPercentage: 0.2, timeLimit: 60000, corridorLength: [1, 5]}
            );
            dungeon.create((x: number, y: number, value: number) => {
                if(value === 0) {
                    levelData.push({name: "floor_1", position: {x, y}, rotation: 0, pixelOffset: {x: 0, y: 0}, scale: {x: 1, y: 1}});
                }
            });
            break;
        case MapType.ROGUE:
            const maxRoomSize = {width: 30, height: 30};
            const cellSize = {width: width / maxRoomSize.width, height: height / maxRoomSize.height};
            dungeon = new Rogue(width, height,
                {cellWidth: cellSize.width, cellHeight: cellSize.height, roomHeight: [8, 30], roomWidth: [8, 30]}
            );
            dungeon.create((x: number, y: number, value: number) => {
                if(value === 0) {
                    levelData.push({name: "floor_1", position: {x, y}, rotation: 0, pixelOffset: {x: 0, y: 0}, scale: {x: 1, y: 1}});
                }
            });
            break;
        case MapType.UNIFORM:
            dungeon = new Uniform(width, height,
                {roomHeight: [5, 10], roomWidth: [5, 18], roomDugPercentage: 0.3, timeLimit: 60000}
            );
            dungeon.create((x: number, y: number, value: number) => {
                if(value === 0) {
                    levelData.push({name: "floor_1", position: {x, y}, rotation: 0, pixelOffset: {x: 0, y: 0}, scale: {x: 1, y: 1}});
                }
            });
            break;
        case MapType.DIVIDED_MAZE:
            const dividedMaze = new DividedMaze(width, height);
            dividedMaze.create((x: number, y: number, value: number) => {
                if(value === 1) {
                    levelData.push({name: "wall_mid", position: {x, y}, rotation: 0, pixelOffset: {x: 0, y: 0}, scale: {x: 1, y: 1}});
                }
            });
            break;
        case MapType.ELLER_MAZE:
            const ellerMaze = new EllerMaze(width, height);
            ellerMaze.create((x: number, y: number, value: number) => {
                if(value === 1) {
                    levelData.push({name: "wall_mid", position: {x, y}, rotation: 0, pixelOffset: {x: 0, y: 0}, scale: {x: 1, y: 1}});
                }
            });
            break;
        case MapType.ICEY_MAZE:
            const iceyMaze = new IceyMaze(width, height, 0);
            iceyMaze.create((x: number, y: number, value: number) => {
                if(value === 1) {
                    levelData.push({name: "wall_mid", position: {x, y}, rotation: 0, pixelOffset: {x: 0, y: 0}, scale: {x: 1, y: 1}});
                }
            });
            break;
        case MapType.CELLULAR:
            const cellular = new Cellular(width, height);
            cellular.randomize(0.5);
            for(let i = 0; i < 3; i++) {
                cellular.create((x: number, y: number, value: number) => {
                    if(i === 2 && value === 0) {
                        levelData.push({name: "floor_1", position: {x, y}, rotation: 0, pixelOffset: {x: 0, y: 0}, scale: {x: 1, y: 1}});
                    }
                });
            }
            break;
    }

    return {type, levelData, dungeon};
}
