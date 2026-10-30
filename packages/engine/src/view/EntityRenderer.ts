import {Container, GD8Symmetry, Sprite, Texture} from "pixi.js";
import {CompositeTilemap} from "@logic-incubator/lib/tilemap";
import AssetFactory from "@logic-incubator/lib/loading/AssetFactory";
import {Vec2Like} from "@logic-incubator/lib/math/Geometry";
import { TileSize } from "../Constants";
import type {EncounterView} from "../Encounter";
import {Between} from "../FixedStep";
import MonsterRoster from "../level/entities/MonsterRoster";
import {Projectile} from "../level/entities/Projectiles";
import {Pushable, SlideEase, SlideSeconds} from "../level/entities/Pushables";
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

/** Where a pushable thing is drawn, sliding to the cell it was last pushed onto: from where it was drawn as it was pushed, `seconds` ago. */
type Slide = {fromX: number; fromY: number; toX: number; toY: number; seconds: number};

/** One sprite to draw into the entities layer: `x`/`y` on screen (already offset by the view), `feet` its bottom edge in the world, which is what the draw order sorts by, `turn` how it's flipped and turned (see `TileGD8Rotation` - 0 for as it is), and `light` its four corners' light (see `Lighting.FootLight`). */
type Drawable = {x: number; y: number; feet: number; texture: Texture; turn: GD8Symmetry; light: Float32Array; alpha: number};

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
 * Draws everything that moves - the heroes, monsters, spawners and whatever
 * can be pushed into the entities layer, sorted by their feet so whoever's
 * lower on screen is in front; shots into the projectiles layer as sprites, turned to face their
 * flight. Skips whatever stands where the heroes can't see (`IsCellVisible`),
 * and lights each one by the floor under its feet. The lights that move - the
 * heroes' torches, glowing shots - get a glow (see `Glow`) in the glows layer,
 * beneath the figures; mage-lights float over them, in the orbs layer.
 * Play moves in steps (see `FixedStep`), so everything is drawn between where
 * its last step started and where it ended, by the `alpha` it's given - but a
 * thing pushed, which is on its new cell at once, slides there over
 * `SlideSeconds` of the frames' own time.
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
    /** Each pushable thing's slide, once it's first drawn - kept to the level it's of, as `Reset` clears it. */
    private slides = new Map<Pushable, Slide>();

    constructor(private camera: Camera, private level: Level) {}

    /** Picks up the layers `TileMapView` has just (re)built - call on every `LEVEL_CREATED`. */
    Reset(): void {
        this.glows = this.camera.root.getChildByName(GlowsLayer) as GlowLayer;
        this.entities = this.camera.root.getChildByName(EntitiesLayer) as CompositeTilemap;
        this.orbs = this.camera.root.getChildByName(OrbsLayer) as GlowLayer;
        this.projectiles = this.camera.root.getChildByName(ProjectilesLayer) as Container;
        // The old projectiles layer took its sprites with it when it was destroyed.
        this.sprites = [];
        this.slides.clear();
    }

    /**
     * Draws the heroes (where each view was last `Place`d - but not one whose player has left) and everything in the
     * encounter `alpha` (0 to 1) of the way between their last two steps, and the level's pushable things `seconds` further
     * along their slides.
     */
    Render(heroes: ReadonlyArray<HeroView>, encounter: EncounterView, alpha = 1, seconds = 0): void {
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
        this.AddPushables(origin, seconds);
        this.AddMonsters(encounter, origin, alpha);
        heroes.forEach(hero => !hero.Hero.Gone && this.AddHero(hero, origin));

        drawables.sort((a, b) => a.feet - b.feet);
        this.entities.clear();
        drawables.forEach(d => {
            this.entities.tile(d.texture, d.x, d.y, {cornerTints: d.light, alpha: d.alpha});
            if (d.turn) {
                this.entities.tileRotate(d.turn);
            }
        });

        this.RenderProjectiles(encounter, origin, alpha);
        this.RenderGlows(heroes, encounter, origin, alpha);
    }

    private AddSpawners(encounter: EncounterView, origin: {x: number; y: number}): void {
        const name = MonsterRoster.inst.SpawnerSprite;
        const frames = name != null ? this.Frames(name) : [];
        encounter.spawners.forEach(state => {
            const {x, y} = state.spawner;
            if (state.destroyed || !this.level.IsCellVisible(x, y)) {
                return;
            }
            // Drawn as the tile it is, where it has one (see `Level.SpawnerTile`), as the tile map would draw it; else
            // as the roster's sprite, top-left on its own cell. Either way over the footprint that makes it solid.
            const tile = this.level.SpawnerTile(state.spawner);
            const texture = tile ? (tile.anim ? tile.anim.texture : tile.texture) : frames[0];
            if (!texture) {
                return;
            }
            const left = x * TileSize - (tile ? tile.pixelOffset.x : 0);
            const top = y * TileSize - (tile ? tile.pixelOffset.y : 0);
            const feet = top + texture.height;
            // It stands on the floor along its whole width, like a tall tile (see `TileMapView.StandingLight`).
            const light = this.NextLight();
            FootLight(this.level.lightGrid, (left + FootInset) / TileSize, (left + texture.width - FootInset) / TileSize, (feet - FootInset) / TileSize, light);
            if (encounter.spawnerFlash.has(state)) {
                MultiplyLight(light, HitTint);
            }
            this.drawables.push({
                x: left - origin.x * TileSize,
                y: top - origin.y * TileSize,
                feet,
                texture,
                turn: tile ? TileGD8Rotation(tile.rotation, tile.scale.x, tile.scale.y) : 0,
                light,
                alpha: 1
            });
        });
    }

    /** Each thing a hero can push, drawn as the tile it is, as `AddSpawners` draws a spawner's - sliding to where it was pushed. */
    private AddPushables(origin: {x: number; y: number}, seconds: number): void {
        this.level.pushables.forEach(pushable => {
            const tile = this.level.PushableTile(pushable);
            const texture = tile && (tile.anim ? tile.anim.texture : tile.texture);
            if (!tile || !texture || !pushable.cells.some(cell => this.level.IsCellVisible(cell.x, cell.y))) {
                return;
            }
            const at = this.Slid(pushable, seconds);
            const left = at.x * TileSize - tile.pixelOffset.x;
            const top = at.y * TileSize - tile.pixelOffset.y;
            const feet = top + texture.height;
            const light = this.NextLight();
            FootLight(this.level.lightGrid, (left + FootInset) / TileSize, (left + texture.width - FootInset) / TileSize, (feet - FootInset) / TileSize, light);
            this.drawables.push({
                x: left - origin.x * TileSize,
                y: top - origin.y * TileSize,
                feet,
                texture,
                turn: TileGD8Rotation(tile.rotation, tile.scale.x, tile.scale.y),
                light,
                alpha: 1
            });
        });
    }

    /** The cell, in tiles and maybe between two, that `pushable` is drawn at this frame, `seconds` on from the last: on its own, or sliding to it since it was pushed. */
    private Slid(pushable: Pushable, seconds: number): Vec2Like {
        let slide = this.slides.get(pushable);
        if (!slide) {
            slide = {fromX: pushable.x, fromY: pushable.y, toX: pushable.x, toY: pushable.y, seconds: SlideSeconds};
            this.slides.set(pushable, slide);
        }
        if (slide.toX !== pushable.x || slide.toY !== pushable.y) {
            // From wherever it's drawn now, should it be pushed again before it's got there.
            const drawn = this.Sliding(slide);
            slide.fromX = drawn.x;
            slide.fromY = drawn.y;
            slide.toX = pushable.x;
            slide.toY = pushable.y;
            slide.seconds = 0;
        } else {
            slide.seconds += seconds;
        }
        return this.Sliding(slide);
    }

    /** Where `slide` has got to, into `at`. */
    private Sliding(slide: Slide): Vec2Like {
        const k = SlideEase(slide.seconds / SlideSeconds);
        this.at.x = slide.fromX + (slide.toX - slide.fromX) * k;
        this.at.y = slide.fromY + (slide.toY - slide.fromY) * k;
        return this.at;
    }

    private AddMonsters(encounter: EncounterView, origin: {x: number; y: number}, alpha: number): void {
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
                turn: TileGD8Rotation(0, m.facingX, 1),
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
            turn: TileGD8Rotation(0, hero.FacingX, 1),
            light: FigureLight(this.level.lightGrid, position, this.NextLight()),
            // One who is away (online, their player's connection gone) is drawn as faint as the fallen: out of play.
            alpha: !hero.Alive || hero.Away ? FallenAlpha : invulnerable > 0 && Math.floor(invulnerable * BlinkRate) % 2 === 0 ? 0.25 : 1
        });
    }

    private RenderProjectiles(encounter: EncounterView, origin: {x: number; y: number}, alpha: number): void {
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
    private RenderGlows(heroes: ReadonlyArray<HeroView>, encounter: EncounterView, origin: {x: number; y: number}, alpha: number): void {
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
