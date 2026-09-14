
import * as PIXI from "pixi.js"
window["PIXI"] = PIXI
import "pixi-tilemap";

import { Container } from "pixi.js";
import GameComponent from "../../../_lib/game/GameComponent";
import { TileSize } from "../../Constants";
import { CAMERA_MOVED, LEVEL_CREATED, LEVEL_LOADED } from "../Events";
import { ZBandAlpha, ZScale } from "../level/Depth";
import Level from "../level/Level";
import { Camera } from "./Camera";

type Band = { root: Container; layers: PIXI.tilemap.CompositeRectTileLayer[] };

/**
 * `CompositeRectTileLayer.addFrame` has no rotation/flip parameter - it always
 * draws the texture's own baked-in orientation. A brush's rotation and flips
 * have to be composed into a single GD8 symmetry and applied after the fact via
 * `tileRotate`, since GD8 codes cover flip+rotation combinations, not each axis
 * independently.
 */
export function TileGD8Rotation(rotation: number, scaleX: number, scaleY: number): PIXI.GD8Symmetry {
    // groupD8.S/N (and the mirror constants below) don't line up with their
    // documented directions for this use - the whole mapping here is fit to
    // match a real PIXI.Sprite(rotation, scale) rendering of the same texture,
    // verified pixel-for-pixel across all 4 rotations x 4 flip combinations,
    // not derived from the GD8 docs.
    const quarterTurns = Math.round(rotation / (Math.PI / 2)) % 4;
    const rotate = [PIXI.groupD8.E, PIXI.groupD8.N, PIXI.groupD8.W, PIXI.groupD8.S][quarterTurns];

    let flip = PIXI.groupD8.E;
    if (scaleX < 0) {
        flip = PIXI.groupD8.add(flip, PIXI.groupD8.MIRROR_HORIZONTAL);
    }
    if (scaleY < 0) {
        flip = PIXI.groupD8.add(flip, PIXI.groupD8.MIRROR_VERTICAL);
    }

    return PIXI.groupD8.add(flip, rotate);
}

/**
 * Draws tiles grouped by height (z). Each z band renders at `ZScale(z)`; all
 * bands are anchored on the same world point so they line up at the centre of
 * the screen and diverge outward by scale. Bands are added lowest z first, so a
 * higher band is drawn over a lower one where they overlap. Non-current bands
 * are faded (`ZBandAlpha`). The player renders into its own top layer, scaled by
 * the camera only, so it keeps a constant on-screen size while the world scales.
 */
export default class TileMapView extends GameComponent {
    private bands: Band[] = [];
    private playerLayer: PIXI.tilemap.CompositeRectTileLayer;

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

        for (let z = 0; z <= this.level.depthMax; z++) {
            const root = new Container();
            root.name = "z-" + z;
            root.interactive = root.interactiveChildren = false;

            const layers: PIXI.tilemap.CompositeRectTileLayer[] = [];
            this.level.tileLayers.forEach(layer => {
                const tileLayer = new PIXI.tilemap.CompositeRectTileLayer(layer.id);
                tileLayer.interactive = tileLayer.interactiveChildren = false;
                tileLayer.name = layer.name;
                root.addChild(tileLayer);
                layers.push(tileLayer);
            });

            this.camera.root.addChild(root);
            this.bands.push({ root, layers });
        }

        this.playerLayer = new PIXI.tilemap.CompositeRectTileLayer(0);
        this.playerLayer.name = "player";
        this.playerLayer.interactive = this.playerLayer.interactiveChildren = false;
        this.playerLayer.scale.set(this.camera.Scale);
        this.camera.root.addChild(this.playerLayer);

        this.game.dispatcher.emit(LEVEL_CREATED);

        this.Render();
    }

    private Render(): void {
        const camScale = this.camera.Scale;
        const centre = this.camera.ViewRect.center;
        const currentZ = this.camera.CurrentZ;
        const heightData = this.level.heightData;
        const boundW = this.level.boundRect.width;
        const boundH = this.level.boundRect.height;

        for (let z = 0, len = this.bands.length; z < len; z++) {
            const band = this.bands[z];
            const alpha = ZBandAlpha(z, currentZ);
            band.root.alpha = alpha;
            band.root.visible = alpha > 0;

            // Scale is relative to the player's z: their own band is always 1:1,
            // higher bands are bigger, lower bands recede.
            const zScale = ZScale(z - currentZ);
            const winW = this.camera.BaseViewWidth / zScale;
            const winH = this.camera.BaseViewHeight / zScale;
            const originX = centre.x - winW * 0.5;
            const originY = centre.y - winH * 0.5;

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
                        for (let t = 0, tt = tiles.length; t < tt; t++) {
                            const tile = tiles[t];
                            if (tile.texture) {
                                layer.addFrame(tile.texture, (x - originX) * TileSize, (y - originY) * TileSize);
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
