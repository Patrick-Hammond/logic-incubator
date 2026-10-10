/**
 * A light's glow: a soft halo over its flame - a torch on the wall, a fireball - added onto whatever is drawn
 * beneath it, so the flame itself looks bright rather than only the floor it lights. Pure - no pixi - so it runs
 * under the plain node test runner (see Glow.test.ts); `view/GlowLayer` draws it.
 */

import { LightFalloff, LightToTint } from "../../level/Lighting";

/** Side of the glow texture, in pixels. It's drawn scaled, smoothly, so it needn't be big. */
export const GlowTextureSize = 64;

/** A glow's radius at its light's own strength, in tiles. */
export const GlowRadius = 1.25;

/** How much a glow adds at its centre, for a light of brightness 1. */
export const GlowStrength = 0.3;

/** How far down a lit tile's art its glow is centred, as a share of its height: a flame burns at the top of its torch. */
export const GlowFlameY = 0.3;

/**
 * The glow texture's pixels, RGBA row by row: white, fading from opaque at the centre to nothing at the edge
 * the way light does (`LightFalloff`), with its colour already multiplied by its alpha.
 */
export function GlowPixels(size: number): Uint8Array {
    const pixels = new Uint8Array(size * size * 4);
    const half = size / 2;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const dx = x + 0.5 - half;
            const dy = y + 0.5 - half;
            const value = Math.round(LightFalloff(Math.sqrt(dx * dx + dy * dy), half) * 255);
            const i = (y * size + x) * 4;
            pixels[i] = pixels[i + 1] = pixels[i + 2] = pixels[i + 3] = value;
        }
    }
    return pixels;
}

/** How to draw one glow: its colour (a sprite tint), how strongly it adds, and its radius in tiles. */
export type GlowLook = { tint: number; alpha: number; radius: number };

/**
 * The glow for a light of colour `rgb` (its tint times its brightness, as `LightShape.rgb`) at `scale` times its
 * own strength - its flicker, or a carried torch burning down. Its colour is the light's at full saturation;
 * it adds more the brighter the light, and swells and shrinks a little as it flickers. Fills and returns `out`.
 */
export function LookOfGlow(rgb: ArrayLike<number>, scale: number, out: GlowLook): GlowLook {
    const strength = Math.max(rgb[0], rgb[1], rgb[2]);
    if (!(strength > 0) || !(scale > 0)) {
        out.alpha = 0;
        out.tint = 0xffffff;
        out.radius = 0;
        return out;
    }
    const hue = [rgb[0] / strength, rgb[1] / strength, rgb[2] / strength];
    out.tint = LightToTint(hue);
    out.alpha = Math.min(1, GlowStrength * strength * scale);
    out.radius = GlowRadius * (0.8 + 0.2 * Math.min(scale, 1.5));
    return out;
}

/** Radius of a mage-light's bright core, in tiles - see `LookOfOrbCore`. */
export const OrbCoreRadius = 0.25;

/**
 * The bright core of a light that floats in the air - a mage-light - drawn over its glow so it reads as a ball of
 * light rather than a haze: small, close to white with a touch of the light's colour, and nearly opaque.
 * Fills and returns `out`.
 */
export function LookOfOrbCore(rgb: ArrayLike<number>, scale: number, out: GlowLook): GlowLook {
    const strength = Math.max(rgb[0], rgb[1], rgb[2]);
    if (!(strength > 0) || !(scale > 0)) {
        out.alpha = 0;
        out.tint = 0xffffff;
        out.radius = 0;
        return out;
    }
    const pale = (channel: number): number => 0.6 + 0.4 * (channel / strength);
    out.tint = LightToTint([pale(rgb[0]), pale(rgb[1]), pale(rgb[2])]);
    out.alpha = Math.min(1, 0.9 * scale);
    out.radius = OrbCoreRadius * (0.85 + 0.15 * Math.min(scale, 1.5));
    return out;
}
