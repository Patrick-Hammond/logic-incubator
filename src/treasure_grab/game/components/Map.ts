import {Sprite} from "pixi.js";
import {ISearchGraph, SearchNode} from "../../../_lib/algorithms/Search";
import GameComponent from "../../../_lib/game/GameComponent";
import {Vec2Like} from "../../../_lib/math/Geometry";
import {Directions as Direction} from "../../../_lib/utils/Types";
import {MapHeight, MapWidth} from "../../Constants";

export enum TileType {
    BLOCKED, TRAVERSABLE
}

class Tile extends SearchNode {
    constructor(position: Vec2Like, public type: TileType) {
        super();
        this.position = {x: position.x, y: position.y};
    }

    CheckValid(): boolean {
        return this.type !== TileType.BLOCKED;
    };
}

export default class Map extends GameComponent implements ISearchGraph<Tile> {

    public background: Sprite;
    public foreground: Sprite;

    private mapData: number[][] = [
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0],
        [0, 1, 1, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 1, 0],
        [0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 1, 1, 0, 0, 1, 0],
        [0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 1, 0],
        [0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0],
        [0, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0],
        [0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0],
        [0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 1, 1, 1],
        [0, 1, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0],
        [0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ];

    private catPositions: Vec2Like[] = [];
    private _data: Tile[][];
    get data(): Tile[][] {
        return this._data;
    }

    public constructor() {
        super();

        this.background = this.assetFactory.Create("path");
        this.foreground = this.assetFactory.Create("trees");

        this.CreateMap();
        this.CreateRandomPositions();
    }

    GetTile(position: Vec2Like, direction: Direction): Tile {

        const blockedTile = new Tile(position, TileType.BLOCKED);

        let {x, y} = position;
        switch(direction) {
            case "left":
                if(x === 0) {
                    return blockedTile;
                }
                x -= 1;
                break;
            case "right":
                if(x === MapWidth - 1) {
                    return blockedTile;
                }
                x += 1;
                break;
            case "up":
                if(y === 0) {
                    return blockedTile;
                }
                y -= 1;
                break;
            case "down":
                if(y === MapHeight - 1) {
                    return blockedTile;
                }
                y += 1;
                break;
            }

        return this.data[y][x];
    }

    SetTile(x: number, y: number, type: TileType): void {
        this.data[y][x].type = type;
    }

    GetRandomPosition(): Vec2Like {
        return this.catPositions[(Math.random() * this.catPositions.length) | 0];
    }

    GetAdjacent(node: Tile): Tile[] {
        return ["up", "down", "left", "right"].map(direction => this.GetTile(node.position, direction as Direction));
    }

    private CreateMap(): void {
        this._data = this.mapData.map<Tile[]>((tile, y) => tile.map<Tile>((type, x) => new Tile({x, y}, type)));
    }

    private CreateRandomPositions(): void {
        for (let x = 3; x < 12; x++) {
           for (let y = 3; y < 9; y++) {
                if(this.data[y][x].type !== TileType.BLOCKED) {
                    this.catPositions.push({x, y});
                }
           }
        }
    }
}
