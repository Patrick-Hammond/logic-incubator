import GameComponent from "../../_lib/game/GameComponent";
import {Vec2Like} from "../../_lib/math/Geometry";
import {Directions} from "../../_lib/utils/Types";
import {MapHeight, MapWidth} from "../Constants";

export default class Map extends GameComponent {

    public background: PIXI.Sprite;
    public foreground: PIXI.Sprite;

    private map: number[] = [
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0,
        0, 1, 1, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 1, 0,
        0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 1, 1, 0, 0, 1, 0,
        0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 1, 0,
        0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0,
        0, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0,
        0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0,
        0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 1, 1, 1,
        0, 1, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0,
        0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    ];

    public constructor() {
        super();

        this.background = this.assetFactory.Create("path");
        this.foreground = this.assetFactory.Create("trees");
    }

    public CanMove(position: Vec2Like, direction: Directions): boolean {

        let index = position.x + position.y * MapWidth;
        switch(direction) {
            case "left":
                position.x === 0 ? index = null : index -= 1;
                break;
            case "right":
                position.x === MapWidth - 1 ? index = null : index += 1;
                break;
            case "up":
                position.y === 0 ? index = null : index -= MapWidth;
                break;
            case "down":
                position.y === MapHeight - 1 ? index = null : index += MapWidth;
                break;
            }

        return index ? this.map[index] === 1 : false;
    }
}
