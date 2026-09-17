import { Container, GD8Symmetry, groupD8 } from "pixi.js";
import { CompositeTilemap } from "../../../_lib/tilemap";
import GameComponent from "../../../_lib/game/GameComponent";
import { TileSize } from "../../Constants";
import { CAMERA_MOVED, LEVEL_CREATED, LEVEL_LOADED } from "../Events";
import { ZBandAlpha, ZScale } from "../level/Depth";
import { BakedLight } from "../level/Lighting";
import Level from "../level/Level";
import { Camera } from "./Camera";
import { ViewOrigin } from "./helpers/CameraWindow";

type Band = { z: number; root: Container; layers: CompositeTilemap[] };

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

/** Packs a baked `BakedLight` (see `Lighting.ts`) into a colour multiply-tint: each of the light's own `tint` channels scaled by `brightness` (`[0, 1]`, 1 = that channel at full strength). `tint` can only darken a texture by multiplying it, never brighten it past its own colours - a white light (`AMBIENT_TINT`) at brightness 1 leaves a texture unchanged. */
export function LightTint(light: BakedLight): number {
    const brightness = Math.max(0, Math.min(1, light.brightness));
    const r = Math.round(((light.tint >> 16) & 0xff) * brightness);
    const g = Math.round(((light.tint >> 8) & 0xff) * brightness);
    const b = Math.round((light.tint & 0xff) * brightness);
    return (r << 16) | (g << 8) | b;
}

/**
 * Draws tiles grouped by height (z). Each z band renders at `ZScale(z)`; all
 * bands are anchored on the same world point so they line up at the centre of
 * the screen and diverge outward by scale. Bands are added lowest z first, so a
 * higher band is drawn over a lower one where they overlap. Non-current bands
 * are faded (`ZBandAlpha`). All bands - including the player's own - are
 * additionally scaled by `camera.EffectiveZoom`, a whole-scene zoom driven by
 * the player's height (see `Camera.UpdateZoom`/`StepZoom`), so climbing
 * doesn't stay pinned at a perfect 1:1 - though it eases back to 1 if the
 * player stays put. The player renders into its own top layer, which gets the
 * same `EffectiveZoom` factor so it grows/shrinks in step with the world.
 */
export default class TileMapView extends GameComponent {
    private bands: Band[] = [];
    private playerLayer: CompositeTilemap | null = null;

    constructor(private level: Level, private camera: Camera) {
        super();

        this.game.dispatcher.on(LEVEL_LOADED, this.OnLevelLoaded, this);
        this.game.dispatcher.on(CAMERA_MOVED, this.Render, this);
    }

    private OnLevelLoaded(): void {
        this.bands.forEach(band => {
            band.layers.forEach(layer => layer.clear());
            this.camera.root.removeChild(band.root);
            band.root.destroy({ children: true });
        });
        this.bands = [];

        if (this.playerLayer) {
            this.camera.root.removeChild(this.playerLayer);
            this.playerLayer.destroy();
            this.playerLayer = null;
        }

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

            this.camera.root.addChild(root);
            this.bands.push({ z, root, layers });
        }

        this.playerLayer = new CompositeTilemap();
        this.playerLayer.name = "player";
        this.playerLayer.interactive = this.playerLayer.interactiveChildren = false;
        this.playerLayer.scale.set(this.camera.Scale);
        this.camera.root.addChild(this.playerLayer);

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

        if (this.playerLayer) {
            this.playerLayer.scale.set(camScale * cameraZoom);
        }

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
                        const tint = LightTint(this.level.LightAt(x, y));
                        for (let t = 0, tt = tiles.length; t < tt; t++) {
                            const tile = tiles[t];
                            const texture = tile.anim ? tile.anim.texture : tile.texture;
                            if (texture) {
                                layer.tile(
                                    texture,
                                    (x - originX) * TileSize - tile.pixelOffset.x,
                                    (y - originY) * TileSize - tile.pixelOffset.y,
                                    { tint }
                                );
                                if (tile.rotation || tile.scale.x < 0 || tile.scale.y < 0) {
                                    layer.tileRotate(TileGD8Rotation(tile.rotation, tile.scale.x, tile.scale.y));
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
