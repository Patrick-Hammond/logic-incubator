import { Vec2Like } from "@logic-incubator/lib/math/Geometry";
import { TileSize } from "../../Constants";
import { ViewOrigin } from "./CameraWindow";

/** Where to put a layer: its `scale`, and its `x`/`y` in the camera's root. */
export interface LayerPlacement {
    scale: number;
    x: number;
    y: number;
}

/**
 * Where a layer whose children sit in plain world pixels (a monster's `position`, a shot's `x`/`y`)
 * has to go to draw where `EntityRenderer` draws the same thing. That renderer re-lays its sprites
 * every frame at `world - origin * TileSize` in a layer scaled by `cameraScale * zoom`; a layer that
 * keeps its children still instead takes the same two numbers as its own scale and offset.
 *
 * `zoom` is the camera's `EffectiveZoom` - the origin is worked out from it exactly as the
 * entities layer does (see `ViewOrigin`), or the effects drift off the sprites as the camera zooms.
 */
export function EffectsPlacement(centre: Vec2Like, baseWidth: number, baseHeight: number, cameraScale: number, zoom: number): LayerPlacement {
    const origin = ViewOrigin(centre, baseWidth, baseHeight, zoom);
    const scale = cameraScale * zoom;
    return {
        scale,
        x: -origin.x * TileSize * scale,
        y: -origin.y * TileSize * scale,
    };
}
