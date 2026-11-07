import {Graphics, Rectangle, Renderer, SCALE_MODES, Texture} from "pixi.js";
import AssetFactory from "@logic-incubator/lib/loading/AssetFactory";

/** The largest whole-number scale that fits a picture into a `box`-sized square - a fraction for one bigger than it. */
export function FitScale(texture: Texture, box: number): number {
    const longest = Math.max(texture.width, texture.height);
    return longest > box ? 1 / Math.ceil(longest / box) : Math.max(1, Math.floor(box / longest));
}

/** The picture for a sprite name, or null (with a warning, once per name) if the sprite sheet hasn't it. */
export function TextureOf(name: string | null): Texture | null {
    if (!name) {
        return null;
    }
    if (!AssetFactory.inst.Has(name)) {
        AssetFactory.inst.WarnMissing(name);
        return null;
    }
    return AssetFactory.inst.CreateTexture(name);
}

/** The orb a light spell is shown as without a picture of its own (`LightSpell.icon`): `OrbSize` pixels across, brighter to the middle - how far each ring reaches, how solid it is and how far its colour goes to white. */
const OrbSize = 16;
const OrbRings: ReadonlyArray<{reach: number; alpha: number; white: number}> = [
    {reach: 2, alpha: 1, white: 1},
    {reach: 3.5, alpha: 1, white: 0.55},
    {reach: 5.5, alpha: 1, white: 0},
    {reach: 7, alpha: 0.45, white: 0}
];

/** A light spell's icon, drawn pixel by pixel so it stays crisp enlarged: a glowing orb in its light's `tint` - see `OrbRings`. */
export function OrbTexture(renderer: Renderer, tint: number): Texture {
    const orb = new Graphics();
    const middle = (OrbSize - 1) / 2;
    for (let y = 0; y < OrbSize; y++) {
        for (let x = 0; x < OrbSize; x++) {
            const reach = Math.sqrt((x - middle) * (x - middle) + (y - middle) * (y - middle));
            const ring = OrbRings.filter(r => reach <= r.reach)[0];
            if (ring) {
                orb.beginFill(Mix(tint, 0xffffff, ring.white), ring.alpha).drawRect(x, y, 1, 1).endFill();
            }
        }
    }
    const texture = renderer.generateTexture(orb, SCALE_MODES.NEAREST, 1, new Rectangle(0, 0, OrbSize, OrbSize));
    orb.destroy();
    return texture;
}

/** `a` moved `amount` (0 to 1) of the way to `b`, a channel at a time. */
function Mix(a: number, b: number, amount: number): number {
    const channel = (shift: number) => {
        const from = (a >> shift) & 0xff;
        const to = (b >> shift) & 0xff;
        return Math.round(from + (to - from) * amount) << shift;
    };
    return channel(16) | channel(8) | channel(0);
}
