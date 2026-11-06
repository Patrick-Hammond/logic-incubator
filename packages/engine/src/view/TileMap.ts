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
import { EntitiesLayer, GlowsLayer, MirroredFiguresLayer, OrbsLayer, ProjectilesLayer, ReflectionsLayer } from "./helpers/FigureLayers";
import { GlowFlameY, GlowLook, LookOfGlow } from "./helpers/Glow";
import { MirroredLight, MirroredTop, MirroredTurn } from "./helpers/Mirror";
import OverlayLayer from "./OverlayLayer";
import ReflectionCapture from "./ReflectionCapture";

export { EntitiesLayer, GlowsLayer, MirroredFiguresLayer, OrbsLayer, ProjectilesLayer, ReflectionsLayer };

/** Some of a band's tile layers, with the glows of the lit tiles among them drawn over them. */
type BandPart = { root: Container; glows: GlowLayer };

/**
 * One height's tiles, a layer per tile layer (`layers`, in the level's order), in two parts: those under the figures, and
 * those over them - null when the level has no tile layer over its player layer. `overlays` are its floor overlays, over its
 * floor (see `Level.overlayLayer`) - null at a height without any - and `mirrored` what of it shows in a reflective overlay,
 * upside down - null in a level without one.
 */
type Band = { z: number; layers: CompositeTilemap[]; under: BandPart; over: BandPart | null; overlays: OverlayLayer | null; mirrored: CompositeTilemap | null };

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

/**
 * Draws `texture` into `into` mirrored for a reflection (see `ReflectionCapture`): upside down below where it's drawn the right way
 * up at `left`, `top` - hanging from its bottom edge, its feet - turned and flipped as `rotation`, `scaleX` and `scaleY` say it is
 * the right way up (see `TileGD8Rotation`), lit by `light` the right way up (four corners', as `tile()` takes them; `scratch` is
 * filled with it upside down) and as solid as `alpha`.
 */
export function AddMirrored(
    into: CompositeTilemap,
    texture: Texture,
    left: number,
    top: number,
    rotation: number,
    scaleX: number,
    scaleY: number,
    light: ArrayLike<number>,
    scratch: Float32Array,
    alpha = 1
): void {
    const trimY = texture.trim ? texture.trim.y : 0;
    const y = MirroredTop(top, texture.orig.height, trimY, texture.frame.height);
    into.tile(texture, left, y, { cornerTints: MirroredLight(light, scratch), alpha });
    const turn = MirroredTurn(rotation, scaleX, scaleY);
    into.tileRotate(TileGD8Rotation(turn.rotation, turn.scaleX, turn.scaleY));
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
 * own layer (`EntitiesLayer`) - a tile a spawner is drawn as too (see
 * `Level.SpawnerTile`), and anything a hero can push (`Level.PushableTile`) - over the glows of lights that move
 * (`GlowsLayer`) and under those that float (`OrbsLayer`), and shots into one
 * above that (`ProjectilesLayer`); all four get the same `EffectiveZoom` factor
 * so they grow/shrink in step with the world. Those figures' layers go where the
 * level's player layer is (`Level.playerLayer`): every band's tile layers before it
 * are drawn under them, and every band's tile layers after it over them - an arch
 * or a treetop the heroes walk under - so each band is split in two (`Band`), the
 * parts over the figures added after them, lowest z first again.
 */
export default class TileMapView extends GameComponent {
    private bands: Band[] = [];
    private glowsLayer: GlowLayer | null = null;
    /** What reflective overlays mirror, drawn first each frame (see `ReflectionCapture`) - null in a level without any. */
    private reflections: ReflectionCapture | null = null;
    /** The figures' reflections, in `reflections` - drawn by `EntityRenderer`, scaled here as the figures are. */
    private mirroredFigures: CompositeTilemap | null = null;
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
    /** A tile's light upside down, for its reflection - see `AddMirrored`. */
    private mirroredLight = new Float32Array(12);

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
            [band.under, band.over].forEach(part => {
                if (part) {
                    this.camera.root.removeChild(part.root);
                    part.root.destroy({ children: true });
                }
            });
        });
        this.bands = [];
        if (this.reflections) {
            this.camera.root.removeChild(this.reflections);
            // Its tile maps go with it, the bands' reflections and the figures'.
            this.reflections.destroy({ children: true });
            this.reflections = null;
            this.mirroredFigures = null;
        }

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

        const playerLayer = this.level.playerLayer;
        const anyOver = playerLayer < this.level.tileLayers.length;
        const overlays = this.level.overlays;
        if (overlays.AnyReflective) {
            // First, so what it mirrors is drawn before any overlay reads it.
            this.reflections = new ReflectionCapture();
            this.reflections.name = ReflectionsLayer;
            this.camera.root.addChildAt(this.reflections, 0);
        }
        /** The heights with an overlay painted at them - the only bands that need an overlay layer. */
        const overlaid = new Set<number>(overlays.All.map(cell => this.level.HeightAt(cell.x, cell.y)));
        for (const z of this.level.depths) {
            const under = this.BandPart("z-" + z);
            const over = anyOver ? this.BandPart("z-" + z + " over") : null;

            const layers: CompositeTilemap[] = [];
            this.level.tileLayers.forEach((layer, index) => {
                const tileLayer = new CompositeTilemap();
                tileLayer.interactive = tileLayer.interactiveChildren = false;
                tileLayer.name = layer.name;
                const part = index < playerLayer || !over ? under : over;
                // Under the part's glows, which it was made with.
                part.root.addChildAt(tileLayer, part.root.children.length - 1);
                layers.push(tileLayer);
            });

            let overlayLayer: OverlayLayer | null = null;
            if (overlaid.has(z)) {
                overlayLayer = new OverlayLayer(TileSize);
                overlayLayer.name = "overlays";
                overlayLayer.reflections = this.reflections;
                // Just over the floor (always under the figures - see `OverlayLayerIndex`), or under every layer.
                const floor = layers[this.level.overlayLayer];
                under.root.addChildAt(overlayLayer, floor ? under.root.getChildIndex(floor) + 1 : 0);
            }
            let mirrored: CompositeTilemap | null = null;
            if (this.reflections) {
                mirrored = new CompositeTilemap();
                mirrored.name = "z-" + z + " mirrored";
                this.reflections.addChild(mirrored);
            }

            this.camera.root.addChild(under.root);
            this.bands.push({ z, layers, under, over, overlays: overlayLayer, mirrored });
        }
        if (this.reflections) {
            // Over the bands' - a hero stands in front of the wall behind them, in the water as out of it.
            this.mirroredFigures = new CompositeTilemap();
            this.mirroredFigures.name = MirroredFiguresLayer;
            this.reflections.addChild(this.mirroredFigures);
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

        this.bands.forEach(band => band.over && this.camera.root.addChild(band.over.root));

        this.game.dispatcher.emit(LEVEL_CREATED);

        this.Render();
    }

    /** An empty part of a band, holding just its glows - its tile layers go in under them. */
    private BandPart(name: string): BandPart {
        const root = new Container();
        root.name = name;
        root.interactive = root.interactiveChildren = false;
        const glows = new GlowLayer(this.glowTexture);
        root.addChild(glows);
        return { root, glows };
    }

    private Render(): void {
        const currentZ = this.camera.CurrentZ;
        const camScale = this.camera.Scale;
        const cameraZoom = this.camera.EffectiveZoom;
        const centre = this.camera.ViewRect.center;
        const heightData = this.level.heightData;
        const boundW = this.level.boundRect.width;
        const boundH = this.level.boundRect.height;
        const playerLayer = this.level.playerLayer;

        [this.glowsLayer, this.entitiesLayer, this.orbsLayer, this.projectilesLayer, this.mirroredFigures].forEach(layer => {
            if (layer) {
                layer.scale.set(camScale * cameraZoom);
            }
        });
        const overlays = this.level.overlays;
        /** How many cells that mirror are on screen this frame - with none, nothing need be drawn mirrored. */
        let reflective = 0;

        for (let i = 0, len = this.bands.length; i < len; i++) {
            const band = this.bands[i];
            const z = band.z;
            const alpha = ZBandAlpha(z, currentZ);
            const visible = alpha > 0;
            const under = band.under;
            const over = band.over;
            under.root.alpha = alpha;
            under.root.visible = visible;
            if (over) {
                over.root.alpha = alpha;
                over.root.visible = visible;
            }

            // Relative to the player's z - their own band is 1:1 here, higher
            // bands are bigger, lower bands recede - then `cameraZoom` scales
            // everything again together, so the whole view also grows a little
            // as the player's absolute z climbs instead of staying pinned.
            const zScale = ZScale(z - currentZ) * cameraZoom;
            const winW = this.camera.BaseViewWidth / zScale;
            const winH = this.camera.BaseViewHeight / zScale;
            const { x: originX, y: originY } = ViewOrigin(centre, this.camera.BaseViewWidth, this.camera.BaseViewHeight, zScale);
            under.glows.Begin();
            under.glows.scale.set(camScale * zScale);
            if (over) {
                over.glows.Begin();
                over.glows.scale.set(camScale * zScale);
            }
            const mirrored = band.mirrored;
            if (mirrored) {
                mirrored.clear();
                mirrored.scale.set(camScale * zScale);
            }
            if (band.overlays) {
                band.overlays.Begin();
                if (visible) {
                    band.overlays.scale.set(camScale * zScale);
                    this.AddOverlays(band.overlays, z, originX, originY, winW, winH);
                    reflective += band.overlays.ReflectiveCells;
                }
                band.overlays.End();
            }

            for (let l = 0, ll = band.layers.length; l < ll; l++) {
                const layer = band.layers[l];
                layer.clear();
                if (!visible) {
                    continue;
                }
                layer.scale.set(camScale * zScale);
                const glows = l < playerLayer || !over ? under.glows : over.glows;

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
                                const left = (x - originX) * TileSize - tile.pixelOffset.x;
                                const top = (y - originY) * TileSize - tile.pixelOffset.y;
                                // A spawner's tile is drawn with the figures, where it can flash when hit (see `EntityRenderer`) - only its glow is drawn here.
                                // So is a pushable thing's, wherever it's been pushed to.
                                if (!tile.spawner && !tile.pushable) {
                                    const light = texture.height > TileSize ? this.StandingLight(x, y, tile.pixelOffset, texture) : this.cornerLight;
                                    // A new options object per tile: `tile()` writes the texture's frame into it.
                                    layer.tile(texture, left, top, { cornerTints: light });
                                    if (tile.rotation || tile.scale.x < 0 || tile.scale.y < 0) {
                                        layer.tileRotate(TileGD8Rotation(tile.rotation, tile.scale.x, tile.scale.y));
                                    }
                                    if (mirrored && tile.reflects) {
                                        const worldLeft = x * TileSize - tile.pixelOffset.x;
                                        const worldTop = y * TileSize - tile.pixelOffset.y;
                                        if (overlays.ReflectsAt(worldLeft, worldLeft + texture.width, worldTop + texture.height, TileSize)) {
                                            AddMirrored(mirrored, texture, left, top, tile.rotation, tile.scale.x, tile.scale.y, light, this.mirroredLight);
                                        }
                                    }
                                }
                                if (tile.light !== undefined && tile.glows) {
                                    const lights = this.level.lights;
                                    LookOfGlow(lights.Colour(tile.light), lights.Scale(tile.light), this.glowLook);
                                    glows.Add(left + texture.width / 2, top + texture.height * GlowFlameY, this.glowLook, TileSize);
                                }
                            }
                        }
                    }
                }
            }
            under.glows.End();
            if (over) {
                over.glows.End();
            }
        }
        if (this.reflections) {
            this.reflections.active = reflective > 0;
        }
    }

    /**
     * Fills `layer` with the overlay cells at height `z` in the window from `originX`, `originY`, `winW` by `winH` cells - those the
     * heroes can see (see `Level.IsCellVisible`), each lit as the floor is.
     */
    private AddOverlays(layer: OverlayLayer, z: number, originX: number, originY: number, winW: number, winH: number): void {
        const overlays = this.level.overlays;
        const heightData = this.level.heightData;
        const boundW = this.level.boundRect.width;
        const boundH = this.level.boundRect.height;
        for (let x = Math.max(0, originX | 0), w = Math.min(boundW - 1, (originX + winW) | 0); x <= w; x++) {
            const heightColumn = heightData[x];
            for (let y = Math.max(0, originY | 0), h = Math.min(boundH - 1, (originY + winH) | 0); y <= h; y++) {
                const cell = overlays.At(x, y);
                if (!cell || ((heightColumn && heightColumn[y]) || 0) !== z || !this.level.IsCellVisible(x, y)) {
                    continue;
                }
                CellCornerLight(this.level.lightGrid, x, y, this.cornerLight);
                layer.Add(cell, (x - originX) * TileSize, (y - originY) * TileSize, this.cornerLight);
            }
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
