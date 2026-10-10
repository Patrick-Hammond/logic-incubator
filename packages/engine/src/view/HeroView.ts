import {AnimatedSprite, Texture} from "pixi.js";
import AssetFactory from "@logic-incubator/lib/loading/AssetFactory";
import {Vec2, Vec2Like} from "@logic-incubator/lib/math/Geometry";
import { TileSize } from "../Constants";
import {Between} from "../FixedStep";
import {CarriedLightScale} from "../level/entities/CarriedLight";
import {LightSpellScale} from "../level/entities/LightSpell";
import {MovingLight} from "../level/SceneLights";
import Hero from "../sim/Hero";
import {BoxCentre} from "./helpers/PlayerMovement";

/** How high over the floor their mage-light floats, in tiles - about their shoulder. */
const OrbHeight = 1;
/** How far their mage-light bobs up and down, in tiles, and how fast, in radians a second. */
const OrbBob = 0.06;
const OrbBobRate = 2.4;

/**
 * How one hero looks: their animation, where to draw them between steps, and the lights they carry.
 * `DungeonMain` keeps one per hero slot, points it at that slot's `Hero` as each level starts (`Reset`),
 * `Place`s it every frame and `Destroy`s it with the scene; `EntityRenderer` draws it. A fallen hero
 * carries no light.
 */
export class HeroView {
    private sprite: AnimatedSprite;
    /** The animation `sprite` is drawn with. */
    private spriteName: string;
    /** Where they're drawn this frame, and their mage-light's floor - see `Place`. */
    private drawPosition = new Vec2();
    private drawOrb = new Vec2();
    /** What `Light` hands out, refilled each time rather than made anew every frame. Its key is the view, so it stays the same light frame to frame. */
    private light: MovingLight = { x: 0, y: 0, value: { brightness: 0, tint: 0, range: 0 }, key: this, scale: 1 };
    /** What `SpellLight` and `OrbPosition` hand out, refilled each time. Its key is itself. */
    private spellLight: MovingLight = { x: 0, y: 0, value: { brightness: 0, tint: 0, range: 0 }, scale: 1 };
    private orbPosition = { x: 0, y: 0 };

    /** Draws `hero` with the animation `sprite`. */
    constructor(private hero: Hero, sprite: string) {
        this.sprite = this.CreateSprite(sprite);
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

    get Texture(): Texture {
        return this.sprite.texture;
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

    /** Stops their animation, which would otherwise keep ticking on the shared ticker for good. */
    Destroy(): void {
        this.sprite.destroy();
    }

    /** Draws them with another animation from now on - the one they already have is left alone. */
    SetSprite(name: string): void {
        if (name === this.spriteName) {
            return;
        }
        const previous = this.sprite;
        this.sprite = this.CreateSprite(name);
        // Stops the old one, which would otherwise keep ticking on the shared ticker for good.
        previous.destroy();
    }

    /** Draws `hero` from now on - this slot's hero for a level just started - where they stand. */
    Reset(hero: Hero): void {
        this.hero = hero;
        this.Place(1);
    }

    /** Places them for drawing `alpha` (0 to 1) of the way from where their last step started to where it ended. Call each frame after the steps, before anything reads where they're drawn. */
    Place(alpha: number): void {
        const state = this.hero.State;
        Between(state.previous, state.position, alpha, this.drawPosition);
        Between(state.previousOrb, state.orb, alpha, this.drawOrb);
    }

    private CreateSprite(name: string): AnimatedSprite {
        const sprite = AssetFactory.inst.CreateAnimatedSprite(name);
        sprite.play();
        sprite.animationSpeed = 0.1;
        this.spriteName = name;
        return sprite;
    }
}
