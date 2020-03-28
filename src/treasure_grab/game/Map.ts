import {Sprite} from "pixi.js";
import GameComponent from "../../_lib/game/GameComponent";
import {Vec2, Vec2Like} from "../../_lib/math/Geometry";
import {Directions} from "../../_lib/utils/Types";
import {MapHeight, MapWidth} from "../Constants";

export enum TileType {
    BLOCKED, TRAVERSABLE, CAT
}

type Tile = {type: TileType, visited?: boolean, parent?: Tile, pos?: Vec2Like};

export default class Map extends GameComponent {

    public background: Sprite;
    public foreground: Sprite;

    private map: Tile[][] = [
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0],
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
    ].map<Tile[]>((t, y) => t.map<Tile>((v, x) => ({type: v, visited: false, parent: null, pos: {x, y}})));

    private catPositions: Vec2Like[] = [];

    public constructor() {
        super();

        this.background = this.assetFactory.Create("path");
        this.foreground = this.assetFactory.Create("trees");

        this.CreateRandomPositions();
    }

    GetAdjacentTile(position: Vec2Like, direction: Directions): Tile {

        const blocked: Tile = {type: TileType.BLOCKED};

        let {x, y} = position;
        switch(direction) {
            case "left":
                if(x === 0) {
                    return blocked;
                }
                x -= 1;
                break;
            case "right":
                if(x === MapWidth - 1) {
                    return blocked;
                }
                x += 1;
                break;
            case "up":
                if(y === 0) {
                    return blocked;
                }
                y -= 1;
                break;
            case "down":
                if(y === MapHeight - 1) {
                    return blocked;
                }
                y += 1;
                break;
            }

        return this.map[y][x];
    }

    SetTile(x: number, y: number, type: TileType): void {
        this.map[y][x].type = type;
    }

    FindShortestPath(start: Vec2, end: Vec2): Vec2Like[] {

        const path: Vec2Like[] = [];
        const getPath = (t: Tile) => {
            path.push(t.pos);
            if(t.parent) {
                getPath(t.parent);
            }
        }

        getPath(this.BredthFirstSearch(start, end));

        path.pop();
        return path.reverse();
    }

    GetRandomPosition(): Vec2Like {
        return this.catPositions[(Math.random() * this.catPositions.length) | 0];
    }

    private BredthFirstSearch(start: Vec2, end: Vec2): Tile {

        const copyTile = (tile: Tile): Tile => ({type: tile.type, visited: false, parent: null, pos: tile.pos});

        const getEdges = (tile: Tile): Tile[] => ["up", "down", "left", "right"].map(d => {
            return copyTile(this.GetAdjacentTile(tile.pos, d as Directions));
        });

        const queue: Tile[] = [];
        const startTile = copyTile(this.map[start.y][start.x]);
        startTile.visited = true;
        queue.push(startTile);

        const target = this.map[end.y][end.x];

        while (queue.length) {
            const currentTile = queue.shift();
            if(currentTile.pos.x === target.pos.x && currentTile.pos.y === target.pos.y) {
                return currentTile;
            }
            const edges = getEdges(currentTile);
            edges.forEach(tile => {
                if (tile.type !== TileType.BLOCKED && !tile.visited) {
                    tile.visited = true;
                    tile.parent = currentTile;
                    queue.push(tile)
                }
            });
        }
    }

    private CreateRandomPositions(): void {
        for (let x = 3; x < 12; x++) {
           for (let y = 3; y < 9; y++) {
                if(this.map[y][x].type !== TileType.BLOCKED) {
                    this.catPositions.push({x, y});
                }
           }
        }
    }
}
