import {Texture} from "pixi.js";
import {Vec2, Vec2Like} from "@logic-incubator/lib/math/Geometry";
import { TileSize } from "../Constants";
import {Between} from "../FixedStep";
import {CarriedLightScale} from "../level/entities/CarriedLight";
import {AnimationFor, CharacterAnimations, LoopFrame, Pose, PoseClock, PoseOf} from "../level/entities/CharacterAnimations";
import {LightSpellScale} from "../level/entities/LightSpell";
import {MovingLight} from "../level/SceneLights";
import Hero from "../sim/Hero";
import AnimationFrames from "./helpers/AnimationFrames";
import {BoxCentre} from "./helpers/PlayerMovement";

/** How high over the floor their mage-light floats, in tiles - about their shoulder. */
const OrbHeight = 1;
/** How far their mage-light bobs up and down, in tiles, and how fast, in radians a second. */
const OrbBob = 0.06;
const OrbBobRate = 2.4;
/** A hero's animation frames per 60th of a second. */
export const HeroAnimationSpeed = 0.1;

/**
 * How one hero looks: their animation - idle while they stand, running while they move (see `Animate`) -,
 * where to draw them between steps, and the lights they carry. `DungeonMain` keeps one per hero slot, points
 * it at that slot's `Hero` as each level starts (`Reset`), and `Place`s and `Animate`s it every frame;
 * `EntityRenderer` draws it. A fallen hero carries no light.
 */
export class HeroView {
    /** What they're drawn with, a pose at a time. */
    private animations: CharacterAnimations;
    private frames = new AnimationFrames();
    /** The pose they're in, and for how long - see `Animate`. */
    private clock = new PoseClock();
    /** Where they're drawn this frame, and their mage-light's floor - see `Place`. */
    private drawPosition = new Vec2();
    private drawOrb = new Vec2();
    /** What `Light` hands out, refilled each time rather than made anew every frame. Its key is the view, so it stays the same light frame to frame. */
    private light: MovingLight = { x: 0, y: 0, value: { brightness: 0, tint: 0, range: 0 }, key: this, scale: 1 };
    /** What `SpellLight` and `OrbPosition` hand out, refilled each time. Its key is itself. */
    private spellLight: MovingLight = { x: 0, y: 0, value: { brightness: 0, tint: 0, range: 0 }, scale: 1 };
    private orbPosition = { x: 0, y: 0 };

    /** Draws `hero` with `animations`. */
    constructor(private hero: Hero, animations: CharacterAnimations) {
        this.animations = animations;
        this.spellLight.key = this.spellLight;
        this.Place(1);
    }

    /** The hero drawn. */
    get Hero(): Hero {
        return this.hero;
    }

    /** Where to draw them this frame: the top-left of their box, between their last two steps (see `Place`). */
    get DrawPosition(): Vec2Like {
        return this.drawPosition;
    }

    /** What they're doing, as far as how they're drawn goes - as of the last `Animate`. */
    get Pose(): Pose {
        return this.clock.Pose;
    }

    /**
     * The frame they're drawn with now: of their pose's animation (their idle one, should the sprite sheet not have that), as far
     * into it as they've been in that pose - `Texture.EMPTY` if the sheet has neither.
     */
    get Texture(): Texture {
        let frames = this.frames.Get(AnimationFor(this.animations, this.clock.Pose));
        if (!frames.length) {
            frames = this.frames.Get(this.animations.idle);
        }
        return frames.length ? frames[LoopFrame(frames.length, this.clock.Time, HeroAnimationSpeed)] : Texture.EMPTY;
    }

    /** The light they carry, where they're drawn (see `Level.UpdateLights`) - null without one, or once they've fallen. */
    get Light(): MovingLight | null {
        const carried = this.hero.State.carried;
        if (!carried || !this.hero.Alive) {
            return null;
        }
        const centre = BoxCentre(this.drawPosition);
        this.light.x = centre.x / TileSize;
        this.light.y = centre.y / TileSize;
        this.light.value = carried.value;
        this.light.scale = CarriedLightScale(carried);
        return this.light;
    }

    /** Their mage-light while it's lit, over the floor where it floats (see `Level.UpdateLights`) - null otherwise. */
    get SpellLight(): MovingLight | null {
        const spell = this.hero.Spell;
        if (!spell || !spell.lit || !this.hero.Alive) {
            return null;
        }
        this.spellLight.x = this.drawOrb.x / TileSize;
        this.spellLight.y = this.drawOrb.y / TileSize;
        this.spellLight.value = spell.lit.value;
        this.spellLight.scale = LightSpellScale(spell);
        return this.spellLight;
    }

    /** Where their mage-light is drawn while it's lit, in world pixels: floating, and bobbing, over the floor it lights. Null otherwise. */
    get OrbPosition(): Vec2Like | null {
        if (!this.SpellLight) {
            return null;
        }
        this.orbPosition.x = this.drawOrb.x;
        this.orbPosition.y = this.drawOrb.y - (OrbHeight + Math.sin(this.hero.State.orbTime * OrbBobRate) * OrbBob) * TileSize;
        return this.orbPosition;
    }

    /** Draws them with `animations` from now on. */
    SetAnimations(animations: CharacterAnimations): void {
        this.animations = animations;
    }

    /** Draws `hero` from now on - this slot's hero for a level just started - where they stand, idle. */
    Reset(hero: Hero): void {
        this.hero = hero;
        this.clock.Reset();
        this.Place(1);
    }

    /**
     * Moves their animation on by `frames` 60ths of a second, in the pose they're in now: running while they're moving (`Hero.Moving`),
     * idle otherwise - and idle whatever they were doing while `held` (play holding still for a talk, which leaves them as they were).
     * A new pose starts its animation from the first frame. Call each frame, with `Place`.
     */
    Animate(frames: number, held = false): void {
        this.clock.Update(PoseOf({ moving: !held && this.hero.Moving }), frames);
    }

    /**
     * Places them for drawing `alpha` (0 to 1) of the way from where their last step started to where it ended - and
     * `offset` pixels from there, if given (an online guest's hero, while a correction is drawn away). Call each frame
     * after the steps, before anything reads where they're drawn.
     */
    Place(alpha: number, offset?: Vec2Like | null): void {
        const state = this.hero.State;
        Between(state.previous, state.position, alpha, this.drawPosition);
        Between(state.previousOrb, state.orb, alpha, this.drawOrb);
        if (offset) {
            this.drawPosition.Set(this.drawPosition.x + offset.x, this.drawPosition.y + offset.y);
            this.drawOrb.Set(this.drawOrb.x + offset.x, this.drawOrb.y + offset.y);
        }
    }
}
