import { Vec2Like } from "@logic-incubator/lib/math/Geometry";
import { TileSize } from "../../Constants";
import { ZScale } from "../../level/Depth";
import { ViewOrigin } from "./CameraWindow";

/** What the camera shows, as `TileMapView` reads it: `Camera.ViewRect.center`, `BaseViewWidth`/`BaseViewHeight`, `Scale`, `EffectiveZoom` and `CurrentZ`. */
export interface CameraView {
    centre: Vec2Like;
    baseWidth: number;
    baseHeight: number;
    scale: number;
    zoom: number;
    currentZ: number;
}

/** A rectangle in the camera's root. */
export interface PlacedRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * Where `TileMapView` draws a tile `size` pixels big, `offset` pixels up and left of cell `cell`'s corner, on a cell of
 * height `z`: in the camera's root, scaled and moved as that height's band is (bands above the heroes' own drawn bigger,
 * those below smaller - see `ZScale`). For drawing something over a tile, such as an NPC's speech bubble. Pure.
 */
export function TileRect(view: CameraView, cell: Vec2Like, z: number, size: { width: number; height: number }, offset: Vec2Like): PlacedRect {
    const zScale = ZScale(z - view.currentZ) * view.zoom;
    const origin = ViewOrigin(view.centre, view.baseWidth, view.baseHeight, zScale);
    const scale = view.scale * zScale;
    return {
        x: ((cell.x - origin.x) * TileSize - offset.x) * scale,
        y: ((cell.y - origin.y) * TileSize - offset.y) * scale,
        width: size.width * scale,
        height: size.height * scale
    };
}
