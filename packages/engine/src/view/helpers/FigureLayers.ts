/**
 * Names of the layers `TileMapView` puts into the camera's root for what moves about the level, drawn together where the
 * level's player layer is (see `LevelFormat.TileLayerOrder`), and found by name by `EntityRenderer` and `Effects`. Pure - no
 * pixi - so `Effects`' test can import it.
 */

/** Name of the layer (a `GlowLayer`) the glows of moving lights - a carried torch, a glowing shot - are drawn into, under the figures - see `EntityRenderer`. */
export const GlowsLayer = "glows";
/** Name of the layer (a `CompositeTilemap`) the player, monsters and spawners are drawn into - see `EntityRenderer`. */
export const EntitiesLayer = "entities";
/** Name of the layer (a `GlowLayer`) a floating light - the player's mage-light - is drawn into, over the figures - see `EntityRenderer`. */
export const OrbsLayer = "orbs";
/** Name of the layer (a plain `Container` of sprites, which unlike a tilemap can turn to any angle) shots are drawn into. The top of the figures' layers: `Effects` goes just above it. */
export const ProjectilesLayer = "projectiles";
