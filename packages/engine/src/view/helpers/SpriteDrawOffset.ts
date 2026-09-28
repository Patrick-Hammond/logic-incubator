import { Vec2Like } from "@logic-incubator/lib/math/Geometry";
import { TileSize } from "../../Constants";

export interface TextureSize {
    height: number;
    /** Leave out for a frame that's one tile wide. */
    width?: number;
}

/**
 * Screen-space top-left position to draw a sprite frame at, given its
 * collision-box top-left `position`, the camera's tile-space view offset,
 * and the frame's own pixel size. Extracted from what used to live inline in
 * Player.Render, kept pure so it can be unit-tested without a pixi/Game
 * runtime (mirrors how ResolveMove was extracted from Player.Move).
 *
 * `CompositeTilemap.tile` draws a texture top-left anchored with
 * no pivot support. Most tile art is exactly one tile (TileSize) on each
 * axis, but a character's frame (e.g. wizzard_m_run_anim, 16x28) is taller
 * than its footprint tile to fit a head/torso above it. Drawn at the raw
 * top-left, that extra height would render downward into the tile below
 * instead - so the Y draw position is pulled up by `TileSize - height`,
 * anchoring the frame's bottom (feet) to the bottom of its own tile. Zero
 * correction for any frame exactly TileSize tall (every tile is, and so was
 * the player sprite before wizzard_m_run_anim).
 *
 * A frame wider than its tile (big_demon/ogre, 32px) is centred on it
 * instead of hanging off its right side - again zero for a TileSize-wide
 * frame.
 */
export function SpriteDrawPosition(position: Vec2Like, viewOffsetTiles: Vec2Like, texture: TextureSize): Vec2Like {
    const width = texture.width != null ? texture.width : TileSize;
    return {
        x: position.x - viewOffsetTiles.x * TileSize + (TileSize - width) * 0.5,
        y: position.y - viewOffsetTiles.y * TileSize + (TileSize - texture.height),
    };
}
