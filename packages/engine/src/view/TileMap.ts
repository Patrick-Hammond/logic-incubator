import { Container, GD8Symmetry, groupD8, Texture } from "pixi.js";
import { CompositeTilemap } from "@logic-incubator/lib/tilemap";
import GameComponent from "@logic-incubator/lib/game/GameComponent";
import { TileSize } from "../Constants";
import { CAMERA_MOVED, LEVEL_CREATED, LEVEL_LOADED } from "../Events";
import { ZBandAlpha, ZScale } from "../level/Depth";
import { CellCornerLight, FootLight } from "../level/Lighting";
import Level from "../level/Level";
import { Camera } from "./Camera";
import GlowLayer, { CreateGlowTexture } from "./GlowLayer";
import { ViewOrigin } from "./helpers/CameraWindow";
import { GlowFlameY, GlowLook, LookOfGlow } from "./helpers/Glow";

/** One height's tiles, a layer per tile layer, with the glows of the lit tiles among them drawn over them. */
type Band = { z: number; root: Container; layers: CompositeTilemap[]; glows: GlowLayer };

/** Name of the layer (a `GlowLayer`) the glows of moving lights - a carried torch, a glowing shot - are drawn into, under the figures - see `EntityRenderer`. */
export const GlowsLayer = "glows";
/** Name of the layer (a `GlowLayer`) a floating light - the player's mage-light - is drawn into, over the figures - see `EntityRenderer`. */
export const OrbsLayer = "orbs";
/** Name of the layer (a `CompositeTilemap`) the player, monsters and spawners are drawn into - see `EntityRenderer`. */
export const EntitiesLayer = "entities";
/** Name of the layer (a plain `Container` of sprites, which unlike a tilemap can turn to any angle) shots are drawn into. */
export const ProjectilesLayer = "projectiles";

/**
 * `CompositeTilemap.tile` has no rotation/flip parameter - it always
 * draws the texture's own baked-in orientation. A brush's rotation and flips
 * have to be composed into a single GD8 symmetry and applied after the fact via
 * `tileRotate`, since GD8 codes cover flip+rotation combinations, not each axis
 * independently.
 */
export function TileGD8Rotation(rotation: number, scaleX: number, scaleY: number): GD8Symmetry {
    // groupD8.S/N (and the mirror constants below) don't line up with their
    // documented directions for this use - the whole mapping here is fit to
    // match a real PIXI.Sprite(rotation, scale) rendering of the same texture,
    // verified pixel-for-pixel across all 4 rotations x 4 flip combinations,
    // not derived from the GD8 docs.
    const quarterTurns = Math.round(rotation / (Math.PI / 2)) % 4;
    const rotate = [groupD8.E, groupD8.N, groupD8.W, groupD8.S][quarterTurns];

    let flip = groupD8.E;
    if (scaleX < 0) {
        flip = groupD8.add(flip, groupD8.MIRROR_HORIZONTAL);
    }
    if (scaleY < 0) {
        flip = groupD8.add(flip, groupD8.MIRROR_VERTICAL);
    }

    return groupD8.add(flip, rotate);
}

/** How far inside the edges of a standing tile its light is sampled, in tiles - two pixels, as for a figure (see `EntityRenderer`). */
const StandingFootInset = 2 / TileSize;

/**
 * Draws tiles grouped by height (z). Each z band renders at `ZScale(z)`; all
 * bands are anchored on the same world point so they line up at the centre of
 * the screen and diverge outward by scale. Bands are added lowest z first, so a
 * higher band is drawn over a lower one where they overlap. Non-current bands
 * are faded (`ZBandAlpha`). All bands - including the player's own - are
 * additionally scaled by `camera.EffectiveZoom`, a whole-scene zoom driven by
 * the player's height (see `Camera.UpdateZoom`/`StepZoom`), so climbing
 * doesn't stay pinned at a perfect 1:1 - though it eases back to 1 if the
 * player stays put. A tile that gives off light has a glow drawn over it, in
 * its own band (see `Glow`). The player, monsters and spawners render into their
 * own layer on top (`EntitiesLayer`), over the glows of lights that move
 * (`GlowsLayer`) and under those that float (`OrbsLayer`), and shots into one
 * above that (`ProjectilesLayer`); all four get the same `EffectiveZoom` factor
 * so they grow/shrink in step with the world.
 */
export default class TileMapView extends GameComponent {
    private bands: Band[] = [];
    private glowsLayer: GlowLayer | null = null;
    private entitiesLayer: CompositeTilemap | null = null;
    private orbsLayer: GlowLayer | null = null;
    private projectilesLayer: Container | null = null;
    /** What every glow is drawn with - made once, and destroyed with this. */
    private glowTexture: Texture | null = null;
    /** One glow's look, refilled per lit tile. */
    private glowLook: GlowLook = { tint: 0xffffff, alpha: 0, radius: 0 };
    /** One cell's corner light, refilled per cell and read by `tile()` as each tile is added - see `Lighting.CellCornerLight`. */
    private cornerLight = new Float32Array(12);
    /** Light for a tile taller than a cell, refilled per tile - see `StandingLight`. */
    private standingLight = new Float32Array(12);

    constructor(private level: Level, private camera: Camera) {
        super();
    }

    protected OnInitialise(): void {
        const glowTexture = this.glowTexture = CreateGlowTexture();
        this.Own(() => glowTexture.destroy(true));
        this.Listen(this.game.dispatcher, LEVEL_LOADED, this.OnLevelLoaded);
        this.Listen(this.game.dispatcher, CAMERA_MOVED, this.Render);
    }

    protected OnDestroy(): void {
        this.ClearBands();
    }

    /** Takes every band and layer this has put into the camera out of it, and destroys them. */
    private ClearBands(): void {
        this.bands.forEach(band => {
            band.layers.forEach(layer => layer.clear());
            this.camera.root.removeChild(band.root);
            band.root.destroy({ children: true });
        });
        this.bands = [];

        [this.glowsLayer, this.orbsLayer].forEach(layer => {
            if (layer) {
                this.camera.root.removeChild(layer);
                layer.destroy({ children: true });
            }
        });
        this.glowsLayer = this.orbsLayer = null;
        if (this.entitiesLayer) {
            this.camera.root.removeChild(this.entitiesLayer);
            this.entitiesLayer.destroy();
            this.entitiesLayer = null;
        }
        if (this.projectilesLayer) {
            this.camera.root.removeChild(this.projectilesLayer);
            this.projectilesLayer.destroy({ children: true });
            this.projectilesLayer = null;
        }
    }

    private OnLevelLoaded(): void {
        this.ClearBands();

        for (const z of this.level.depths) {
            const root = new Container();
            root.name = "z-" + z;
            root.interactive = root.interactiveChildren = false;

            const layers: CompositeTilemap[] = [];
            this.level.tileLayers.forEach(layer => {
                const tileLayer = new CompositeTilemap();
                tileLayer.interactive = tileLayer.interactiveChildren = false;
                tileLayer.name = layer.name;
                root.addChild(tileLayer);
                layers.push(tileLayer);
            });
            const glows = new GlowLayer(this.glowTexture);
            root.addChild(glows);

            this.camera.root.addChild(root);
            this.bands.push({ z, root, layers, glows });
        }

        this.glowsLayer = new GlowLayer(this.glowTexture);
        this.glowsLayer.name = GlowsLayer;
        this.glowsLayer.scale.set(this.camera.Scale);
        this.camera.root.addChild(this.glowsLayer);

        this.entitiesLayer = new CompositeTilemap();
        this.entitiesLayer.name = EntitiesLayer;
        this.entitiesLayer.interactive = this.entitiesLayer.interactiveChildren = false;
        this.entitiesLayer.scale.set(this.camera.Scale);
        this.camera.root.addChild(this.entitiesLayer);

        this.orbsLayer = new GlowLayer(this.glowTexture);
        this.orbsLayer.name = OrbsLayer;
        this.orbsLayer.scale.set(this.camera.Scale);
        this.camera.root.addChild(this.orbsLayer);

        this.projectilesLayer = new Container();
        this.projectilesLayer.name = ProjectilesLayer;
        this.projectilesLayer.interactive = this.projectilesLayer.interactiveChildren = false;
        this.projectilesLayer.scale.set(this.camera.Scale);
        this.camera.root.addChild(this.projectilesLayer);

        this.game.dispatcher.emit(LEVEL_CREATED);

        this.Render();
    }

    private Render(): void {
        const currentZ = this.camera.CurrentZ;
        const camScale = this.camera.Scale;
        const cameraZoom = this.camera.EffectiveZoom;
        const centre = this.camera.ViewRect.center;
        const heightData = this.level.heightData;
        const boundW = this.level.boundRect.width;
        const boundH = this.level.boundRect.height;

        [this.glowsLayer, this.entitiesLayer, this.orbsLayer, this.projectilesLayer].forEach(layer => {
            if (layer) {
                layer.scale.set(camScale * cameraZoom);
            }
        });

        for (let i = 0, len = this.bands.length; i < len; i++) {
            const band = this.bands[i];
            const z = band.z;
            const alpha = ZBandAlpha(z, currentZ);
            band.root.alpha = alpha;
            band.root.visible = alpha > 0;

            // Relative to the player's z - their own band is 1:1 here, higher
            // bands are bigger, lower bands recede - then `cameraZoom` scales
            // everything again together, so the whole view also grows a little
            // as the player's absolute z climbs instead of staying pinned.
            const zScale = ZScale(z - currentZ) * cameraZoom;
            const winW = this.camera.BaseViewWidth / zScale;
            const winH = this.camera.BaseViewHeight / zScale;
            const { x: originX, y: originY } = ViewOrigin(centre, this.camera.BaseViewWidth, this.camera.BaseViewHeight, zScale);
            band.glows.Begin();
            band.glows.scale.set(camScale * zScale);

            for (let l = 0, ll = band.layers.length; l < ll; l++) {
                const layer = band.layers[l];
                layer.clear();
                if (!band.root.visible) {
                    continue;
                }
                layer.scale.set(camScale * zScale);

                const columns = this.level.levelData[l];
                if (!columns) {
                    continue;
                }

                for (let x = originX | 0, w = (originX + winW) | 0; x <= w; x++) {
                    if (x < 0 || x >= boundW || columns[x] == null) {
                        continue;
                    }
                    const heightColumn = heightData[x];
                    for (let y = originY | 0, h = (originY + winH) | 0; y <= h; y++) {
                        if (y < 0 || y >= boundH) {
                            continue;
                        }
                        const tiles = columns[x][y];
                        if (!tiles) {
                            continue;
                        }
                        const cellZ = (heightColumn && heightColumn[y]) || 0;
                        if (cellZ !== z) {
                            continue;
                        }
                        if (!this.level.IsCellVisible(x, y)) {
                            continue;
                        }
                        CellCornerLight(this.level.lightGrid, x, y, this.cornerLight);
                        for (let t = 0, tt = tiles.length; t < tt; t++) {
                            const tile = tiles[t];
                            const texture = tile.anim ? tile.anim.texture : tile.texture;
                            if (texture) {
                                const light = texture.height > TileSize ? this.StandingLight(x, y, tile.pixelOffset, texture) : this.cornerLight;
                                const left = (x - originX) * TileSize - tile.pixelOffset.x;
                                const top = (y - originY) * TileSize - tile.pixelOffset.y;
                                // A new options object per tile: `tile()` writes the texture's frame into it.
                                layer.tile(texture, left, top, { cornerTints: light });
                                if (tile.rotation || tile.scale.x < 0 || tile.scale.y < 0) {
                                    layer.tileRotate(TileGD8Rotation(tile.rotation, tile.scale.x, tile.scale.y));
                                }
                                if (tile.light !== undefined) {
                                    const lights = this.level.lights;
                                    LookOfGlow(lights.Colour(tile.light), lights.Scale(tile.light), this.glowLook);
                                    band.glows.Add(left + texture.width / 2, top + texture.height * GlowFlameY, this.glowLook, TileSize);
                                }
                            }
                        }
                    }
                }
            }
            band.glows.End();
        }
    }

    /**
     * Light for a tile taller than a cell - a door, a statue - drawn at cell `(x, y)`. It stands up out of the
     * floor, so like a figure it's lit by the floor along its foot (`Lighting.FootLight`), not by the cells its
     * top reaches into: for a door set in a wall, those are in the wall's shadow.
     */
    private StandingLight(x: number, y: number, pixelOffset: { x: number; y: number }, texture: { width: number; height: number }): Float32Array {
        const left = x - pixelOffset.x / TileSize;
        const bottom = y + (texture.height - pixelOffset.y) / TileSize;
        FootLight(this.level.lightGrid, left + StandingFootInset, left + texture.width / TileSize - StandingFootInset, bottom - StandingFootInset, this.standingLight);
        return this.standingLight;
    }
}
