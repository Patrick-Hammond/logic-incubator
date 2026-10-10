import {Container, Sprite, Texture} from "pixi.js";
import {CompositeTilemap} from "@logic-incubator/lib/tilemap";
import AssetFactory from "@logic-incubator/lib/loading/AssetFactory";
import {Vec2Like} from "@logic-incubator/lib/math/Geometry";
import { TileSize } from "../Constants";
import Encounter from "../Encounter";
import {Between} from "../FixedStep";
import MonsterRoster from "../level/entities/MonsterRoster";
import {Projectile} from "../level/entities/Projectiles";
import Level from "../level/Level";
import {FootLight, LightGrid, LightToTint, SampleLight} from "../level/Lighting";
import {Camera} from "./Camera";
import GlowLayer from "./GlowLayer";
import {ViewOrigin} from "./helpers/CameraWindow";
import {GlowLook, LookOfGlow, LookOfOrbCore} from "./helpers/Glow";
import {CentreTile} from "./helpers/PlayerMovement";
import {HeroView} from "./HeroView";
import {SpriteDrawPosition} from "./helpers/SpriteDrawOffset";
import {EntitiesLayer, GlowsLayer, OrbsLayer, ProjectilesLayer, TileGD8Rotation} from "./TileMap";

/** Monsters' animation frames per ticker frame - see `AnimationSpeed` for tiles'. */
const MonsterAnimationSpeed = 0.15;
/** Multiplied into a monster's or spawner's light while it shows a hit - a tint can only darken, so red it is. */
const HitTint = 0xff4040;
/** How fast a hero blinks while invulnerable after a hit, in blinks per second. */
const BlinkRate = 12;
/** How solid a fallen hero is drawn - a ghost where they fell, until the level starts over. */
const FallenAlpha = 0.35;

/** How far inside the edges of a figure's 16 px footprint its light is sampled - see `FigureLight`. */
const FootInset = 2;

/** One sprite to draw into the entities layer: `x`/`y` on screen (already offset by the view), `feet` its bottom edge in the world, which is what the draw order sorts by, and `light` its four corners' light (see `Lighting.FootLight`). */
type Drawable = {x: number; y: number; feet: number; texture: Texture; facingX: number; light: Float32Array; alpha: number};

/** Fills `out` with the light for a figure whose one-tile footprint has its top-left at `position` (world pixels): the floor's light just inside its feet, so it shades smoothly as it walks. */
function FigureLight(grid: LightGrid, position: Vec2Like, out: Float32Array): Float32Array {
    FootLight(grid, (position.x + FootInset) / TileSize, (position.x + TileSize - FootInset) / TileSize, (position.y + TileSize - FootInset) / TileSize, out);
    return out;
}

/** Multiplies a packed RGB tint into every corner of a corner light, in place. */
function MultiplyLight(light: Float32Array, tint: number): void {
    const r = ((tint >> 16) & 0xff) / 255;
    const g = ((tint >> 8) & 0xff) / 255;
    const b = (tint & 0xff) / 255;
    for (let i = 0; i < light.length; i += 3) {
        light[i] *= r;
        light[i + 1] *= g;
        light[i + 2] *= b;
    }
}

/**
 * Draws everything that moves - the heroes, monsters and spawners into the
 * entities layer, sorted by their feet so whoever's lower on screen is in
 * front; shots into the projectiles layer as sprites, turned to face their
 * flight. Skips whatever stands where the heroes can't see (`IsCellVisible`),
 * and lights each one by the floor under its feet. The lights that move - the
 * heroes' torches, glowing shots - get a glow (see `Glow`) in the glows layer,
 * beneath the figures; mage-lights float over them, in the orbs layer.
 * Play moves in steps (see `FixedStep`), so everything is drawn between where
 * its last step started and where it ended, by the `alpha` it's given.
 */
export default class EntityRenderer {
    private glows: GlowLayer | null = null;
    private entities: CompositeTilemap | null = null;
    private orbs: GlowLayer | null = null;
    private projectiles: Container | null = null;
    private sprites: Sprite[] = [];
    private frames = new Map<string, Texture[]>();
    private drawables: Drawable[] = [];
    /** Corner-light arrays reused frame to frame, one per drawable slot, so lighting 150 monsters doesn't allocate every frame. */
    private lights: Float32Array[] = [];
    private sampled = [0, 0, 0];
    private glowLook: GlowLook = {tint: 0xffffff, alpha: 0, radius: 0};
    /** Where a monster or shot is drawn this frame, worked out into the same object each time. */
    private at: Vec2Like = {x: 0, y: 0};

    constructor(private camera: Camera, private level: Level) {}

    /** Picks up the layers `TileMapView` has just (re)built - call on every `LEVEL_CREATED`. */
    Reset(): void {
        this.glows = this.camera.root.getChildByName(GlowsLayer) as GlowLayer;
        this.entities = this.camera.root.getChildByName(EntitiesLayer) as CompositeTilemap;
        this.orbs = this.camera.root.getChildByName(OrbsLayer) as GlowLayer;
        this.projectiles = this.camera.root.getChildByName(ProjectilesLayer) as Container;
        // The old projectiles layer took its sprites with it when it was destroyed.
        this.sprites = [];
    }

    /** Draws the heroes (where each view was last `Place`d) and everything in the encounter `alpha` (0 to 1) of the way between their last two steps. */
    Render(heroes: ReadonlyArray<HeroView>, encounter: Encounter, alpha = 1): void {
        if (!this.glows || !this.entities || !this.orbs || !this.projectiles) {
            return;
        }

        // The entities layer is scaled by camera.EffectiveZoom like the heroes' own z band (see
        // TileMapView), so its window origin must be computed the exact same way - not the raw
        // ViewRect, which ignores that zoom and would drift sprites off their tiles the moment
        // EffectiveZoom moves off 1.
        const origin = ViewOrigin(this.camera.ViewRect.center, this.camera.BaseViewWidth, this.camera.BaseViewHeight, this.camera.EffectiveZoom);
        const drawables = this.drawables;
        drawables.length = 0;

        this.AddSpawners(encounter, origin);
        this.AddMonsters(encounter, origin, alpha);
        heroes.forEach(hero => this.AddHero(hero, origin));

        drawables.sort((a, b) => a.feet - b.feet);
        this.entities.clear();
        drawables.forEach(d => {
            this.entities.tile(d.texture, d.x, d.y, {cornerTints: d.light, alpha: d.alpha});
            if (d.facingX < 0) {
                this.entities.tileRotate(TileGD8Rotation(0, d.facingX, 1));
            }
        });

        this.RenderProjectiles(encounter, origin, alpha);
        this.RenderGlows(heroes, encounter, origin, alpha);
    }

    private AddSpawners(encounter: Encounter, origin: {x: number; y: number}): void {
        const name = MonsterRoster.inst.SpawnerSprite;
        const frames = name != null ? this.Frames(name) : [];
        if (!frames.length) {
            return;
        }
        encounter.spawners.forEach(state => {
            const {x, y} = state.spawner;
            if (state.destroyed || !this.level.IsCellVisible(x, y)) {
                return;
            }
            const texture = frames[0];
            const light = FigureLight(this.level.lightGrid, {x: x * TileSize, y: y * TileSize}, this.NextLight());
            if (encounter.spawnerFlash.has(state)) {
                MultiplyLight(light, HitTint);
            }
            // Drawn top-left on its own cell, over the footprint that makes it solid (see `SpawnerCells`).
            this.drawables.push({
                x: (x - origin.x) * TileSize,
                y: (y - origin.y) * TileSize,
                feet: y * TileSize + texture.height,
                texture,
                facingX: 1,
                light,
                alpha: 1
            });
        });
    }

    private AddMonsters(encounter: Encounter, origin: {x: number; y: number}, alpha: number): void {
        encounter.monsters.forEach(m => {
            const position = Between(m.previous, m.position, alpha, this.at);
            const tile = CentreTile(position);
            if (!this.level.IsCellVisible(tile.x, tile.y)) {
                return;
            }
            const frames = this.Frames(m.moving ? m.def.run : m.def.idle);
            if (!frames.length) {
                return;
            }
            const texture = frames[Math.floor(m.animTime * MonsterAnimationSpeed) % frames.length];
            const light = FigureLight(this.level.lightGrid, position, this.NextLight());
            if (m.hitFlash > 0) {
                MultiplyLight(light, HitTint);
            }
            const draw = SpriteDrawPosition(position, origin, texture);
            this.drawables.push({
                x: draw.x,
                y: draw.y,
                feet: position.y + TileSize,
                texture,
                facingX: m.facingX,
                light,
                alpha: 1
            });
        });
    }

    private AddHero(view: HeroView, origin: {x: number; y: number}): void {
        const texture = view.Texture;
        const position = view.DrawPosition;
        const draw = SpriteDrawPosition(position, origin, texture);
        const hero = view.Hero;
        const {invulnerable} = hero.Health;
        this.drawables.push({
            x: draw.x,
            y: draw.y,
            feet: position.y + TileSize,
            texture,
            facingX: hero.FacingX,
            light: FigureLight(this.level.lightGrid, position, this.NextLight()),
            alpha: !hero.Alive ? FallenAlpha : invulnerable > 0 && Math.floor(invulnerable * BlinkRate) % 2 === 0 ? 0.25 : 1
        });
    }

    private RenderProjectiles(encounter: Encounter, origin: {x: number; y: number}, alpha: number): void {
        const projectiles = encounter.projectiles;
        while (this.sprites.length < projectiles.length) {
            const sprite = new Sprite(Texture.EMPTY);
            sprite.anchor.set(0.5);
            this.projectiles.addChild(sprite);
            this.sprites.push(sprite);
        }
        this.sprites.forEach((sprite, i) => {
            const p = projectiles[i];
            const frames = p ? this.Frames(p.sprite) : [];
            const at = p ? this.ProjectileAt(p, alpha) : this.at;
            sprite.visible = frames.length > 0 && this.level.IsCellVisible(Math.floor(at.x / TileSize), Math.floor(at.y / TileSize));
            if (!sprite.visible) {
                return;
            }
            sprite.texture = frames[0];
            sprite.position.set(at.x - origin.x * TileSize, at.y - origin.y * TileSize);
            sprite.rotation = p.spriteAngle != null ? Math.atan2(p.vy, p.vx) - p.spriteAngle : 0;
            sprite.tint = LightToTint(SampleLight(this.level.lightGrid, at.x / TileSize, at.y / TileSize, this.sampled));
        });
    }

    /**
     * A glow for each light that moves, where it is now - its strength and colour as `Level.UpdateLights` last
     * cast it, so a shot fired since has none until the next frame - and each hero's mage-light, a glow with a
     * bright core where it floats.
     */
    private RenderGlows(heroes: ReadonlyArray<HeroView>, encounter: Encounter, origin: {x: number; y: number}, alpha: number): void {
        this.glows.Begin();
        heroes.forEach(hero => {
            const carried = hero.Light;
            if (carried) {
                this.AddGlow(this.glows, carried.x * TileSize, carried.y * TileSize, carried.key, origin, LookOfGlow);
            }
        });
        encounter.projectiles.forEach(p => {
            if (!p.light || p.dead) {
                return;
            }
            const at = this.ProjectileAt(p, alpha);
            if (this.level.IsCellVisible(Math.floor(at.x / TileSize), Math.floor(at.y / TileSize))) {
                this.AddGlow(this.glows, at.x, at.y, p, origin, LookOfGlow);
            }
        });
        this.glows.End();

        this.orbs.Begin();
        heroes.forEach(hero => {
            const spell = hero.SpellLight;
            const orb = hero.OrbPosition;
            if (spell && orb) {
                this.AddGlow(this.orbs, orb.x, orb.y, spell.key, origin, LookOfGlow);
                this.AddGlow(this.orbs, orb.x, orb.y, spell.key, origin, LookOfOrbCore);
            }
        });
        this.orbs.End();
    }

    /** A glow into `layer` at world pixel `(x, y)` for the moving light with this key, looking as `look` says. */
    private AddGlow(
        layer: GlowLayer,
        x: number,
        y: number,
        key: unknown,
        origin: {x: number; y: number},
        look: (rgb: ArrayLike<number>, scale: number, out: GlowLook) => GlowLook
    ): void {
        const lights = this.level.lights;
        const colour = lights.MovingColour(key);
        if (colour) {
            look(colour, lights.MovingScale(key) || 0, this.glowLook);
            layer.Add(x - origin.x * TileSize, y - origin.y * TileSize, this.glowLook, TileSize);
        }
    }

    /** Where a shot's centre is drawn, `alpha` of the way through its last step. */
    private ProjectileAt(p: Projectile, alpha: number): Vec2Like {
        this.at.x = p.px + (p.x - p.px) * alpha;
        this.at.y = p.py + (p.y - p.py) * alpha;
        return this.at;
    }

    /** The reusable corner-light array for the drawable about to be pushed. */
    private NextLight(): Float32Array {
        const slot = this.drawables.length;
        return this.lights[slot] ?? (this.lights[slot] = new Float32Array(12));
    }

    /** Every frame of a sprite or animation, cached - none (after a one-off warning) if the sprite sheet hasn't got it. */
    private Frames(name: string): Texture[] {
        let frames = this.frames.get(name);
        if (!frames) {
            if (AssetFactory.inst.Has(name)) {
                frames = AssetFactory.inst.CreateTextures(name);
            } else {
                AssetFactory.inst.WarnMissing(name);
                frames = [];
            }
            this.frames.set(name, frames);
        }
        return frames;
    }
}
