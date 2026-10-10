/**
 * The light a level shows from moment to moment. Its lights are baked once at load (see `Lighting.BakeLights`);
 * each frame `Update` rebuilds the grid from that bake, with the baked lights flickering, any that have been
 * switched off (a torch that was picked up) left out, and lights that move - a carried torch, a glowing shot -
 * cast where they are now. Pure - no pixi - so it runs under the plain node test runner (see SceneLights.test.ts).
 */

import { Vec2Like } from "@logic-incubator/lib/math/Geometry";
import { CastMovingLight, ComposeLighting, FlickerScale, LightBake, LightGrid, LightShape, LightValue } from "./Lighting";

/**
 * A light that moves, for one frame: where it is, in tiles (`(x + 0.5, y + 0.5)` is the centre of cell
 * `(x, y)`), and what it is. `key` is anything that stays the same for the same light from frame to frame (the
 * shot it rides on, say): a light with one isn't cast again until it has moved a little, and flickers smoothly
 * rather than jumping. `scale` multiplies its strength, 1 if left out - for a torch burning down.
 */
export type MovingLight = Vec2Like & { value: LightValue; key?: unknown; scale?: number };

/** How far a moving light goes, in tiles, before it's cast again. Its light is spread over the tile corners anyway, so the lag doesn't show. */
const RECAST_DISTANCE = 1 / 8;

/** Where a keyed moving light was last cast, what it gave, and its strength at the last `Update`. */
type Cast = { x: number; y: number; value: LightValue; shape: LightShape; seed: number; seen: boolean; scale: number };

function SameValue(a: LightValue, b: LightValue): boolean {
    return a === b || (a.brightness === b.brightness && a.tint === b.tint && a.range === b.range && a.flicker === b.flicker);
}

export default class SceneLights {
    /** Whether each baked light is lit, by its index in the bake. */
    private on: boolean[];
    /** Each baked light's strength at the last `Update`, as a multiple of its own. */
    private bakedScales: number[];
    private casts = new Map<unknown, Cast>();
    private nextSeed = 0;
    /** Reused every frame: the baked shapes then the moving ones, and their scales. */
    private shapes: LightShape[] = [];
    private scales: number[] = [];

    /** `grid` is filled in place by every `Update` - pass the one the level is drawn from. */
    constructor(private bake: LightBake, readonly grid: LightGrid) {
        this.on = bake.shapes.map(() => true);
        this.bakedScales = bake.shapes.map(() => 1);
    }

    /** How many baked lights there are. */
    get BakedCount(): number {
        return this.bake.shapes.length;
    }

    /** Switches baked light `index` (its place in the bake) off - a torch someone picked up - or back on. Takes effect at the next `Update`. */
    SetOn(index: number, on: boolean): void {
        if (index >= 0 && index < this.on.length) {
            this.on[index] = on;
        }
    }

    IsOn(index: number): boolean {
        return this.on[index] === true;
    }

    /** Baked light `index`'s strength at the last `Update`, as a multiple of its own: its flicker, or 0 while it's off. */
    Scale(index: number): number {
        return this.bakedScales[index] || 0;
    }

    /** Where baked light `index` shines from, in tiles - see `LightShape.origin`. */
    Origin(index: number): Vec2Like {
        return this.bake.shapes[index].origin;
    }

    /** Baked light `index`'s colour times its brightness. */
    Colour(index: number): ReadonlyArray<number> {
        return this.bake.shapes[index].rgb;
    }

    /** The moving light with this `key`'s strength at the last `Update`, as a multiple of its own (its flicker times its `scale`) - undefined if it wasn't one of them. */
    MovingScale(key: unknown): number | undefined {
        const cast = this.casts.get(key);
        return cast ? cast.scale : undefined;
    }

    /** The moving light with this `key`'s colour times its brightness, as of the last `Update` - undefined if it wasn't one of them. */
    MovingColour(key: unknown): ReadonlyArray<number> | undefined {
        const cast = this.casts.get(key);
        return cast ? cast.shape.rgb : undefined;
    }

    /**
     * Rebuilds `grid` for `time` seconds: every baked light that's on, at its flicker for that moment, plus
     * `moving`, cast where they are now. A keyed moving light missing from `moving` is forgotten.
     */
    Update(time: number, moving: ReadonlyArray<MovingLight>): LightGrid {
        const shapes = this.shapes;
        const scales = this.scales;
        shapes.length = 0;
        scales.length = 0;
        this.bake.shapes.forEach((shape, i) => {
            const scale = this.on[i] ? FlickerScale(shape.flicker, time, i) : 0;
            this.bakedScales[i] = scale;
            shapes.push(shape);
            scales.push(scale);
        });

        this.casts.forEach(cast => (cast.seen = false));
        moving.forEach(light => {
            const cast = this.Cast(light);
            cast.scale = FlickerScale(cast.shape.flicker, time, cast.seed) * (light.scale === undefined ? 1 : Math.max(0, light.scale));
            shapes.push(cast.shape);
            scales.push(cast.scale);
        });
        this.casts.forEach((cast, key) => {
            if (!cast.seen) {
                this.casts.delete(key);
            }
        });

        return ComposeLighting({ width: this.bake.width, height: this.bake.height, occlusion: this.bake.occlusion, shapes }, scales, this.grid);
    }

    /** The shape for a moving light this frame: the one it was last cast with, if it has a key and hasn't moved far or changed. */
    private Cast(light: MovingLight): Cast {
        const known = light.key !== undefined ? this.casts.get(light.key) : undefined;
        if (
            known && !known.seen && SameValue(known.value, light.value) &&
            Math.abs(known.x - light.x) < RECAST_DISTANCE && Math.abs(known.y - light.y) < RECAST_DISTANCE
        ) {
            known.seen = true;
            return known;
        }
        const cast: Cast = {
            x: light.x,
            y: light.y,
            value: light.value,
            shape: CastMovingLight(light, light.value, this.bake.blockers),
            // Moving lights' seeds start well past the baked lights' (their indexes), so none flicker in step.
            seed: known ? known.seed : 1000 + this.nextSeed++,
            seen: true,
            scale: 1
        };
        if (light.key !== undefined) {
            this.casts.set(light.key, cast);
        }
        return cast;
    }
}
