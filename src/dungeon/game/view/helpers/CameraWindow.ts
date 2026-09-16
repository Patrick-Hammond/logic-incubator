import { Vec2Like } from "../../../../_lib/math/Geometry";

/**
 * Tile-space top-left of a window centred on `centre`, `baseWidth x
 * baseHeight` before `zScale` shrinks/grows it. TileMapView's per-band tile
 * origin and Player's own-band sprite draw offset must derive their origin
 * this exact same way, from the exact same `zScale`, or they silently drift
 * apart the moment `zScale` isn't exactly 1 - which used to be guaranteed for
 * the player's own band (it was always `ZScale(0) === 1`) but stopped being
 * true once `CameraZoom` started multiplying every band's scale, including
 * the player's own, by a factor that moves off 1 as soon as the player's z
 * isn't 0. Extracted so both call sites share one formula instead of each
 * reimplementing it (see PlayerMovement/SpriteDrawOffset for the same
 * extract-for-a-single-source-of-truth pattern).
 */
export function ViewOrigin(centre: Vec2Like, baseWidth: number, baseHeight: number, zScale: number): Vec2Like {
    return {
        x: centre.x - (baseWidth / zScale) * 0.5,
        y: centre.y - (baseHeight / zScale) * 0.5,
    };
}
