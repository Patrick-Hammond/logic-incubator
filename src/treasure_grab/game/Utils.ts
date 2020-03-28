import {Vec2Like} from "../../_lib/math/Geometry";
import {TileSize} from "../Constants";

export function TileToPixel(tileXY: Vec2Like): Vec2Like {
    return {x: tileXY.x * TileSize + TileSize * 0.5, y: tileXY.y * TileSize};
}
