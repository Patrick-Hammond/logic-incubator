import { ALPHA_MODES, BaseTexture, BLEND_MODES, Container, resources, SCALE_MODES, Sprite, Texture } from "pixi.js";
import { GlowLook, GlowPixels, GlowTextureSize } from "./helpers/Glow";

/** The soft round texture every glow is drawn with (see `Glow.GlowPixels`): white, so each sprite's tint colours it. Whoever makes it destroys it. */
export function CreateGlowTexture(): Texture {
    const size = GlowTextureSize;
    const resource = new resources.BufferResource(GlowPixels(size), { width: size, height: size });
    // Its pixels are premultiplied already; smooth scaling, since it's drawn far bigger than it is.
    return new Texture(new BaseTexture(resource, { width: size, height: size, scaleMode: SCALE_MODES.LINEAR, alphaMode: ALPHA_MODES.PMA }));
}

/**
 * Glows, added onto what's drawn beneath them, from a pool of sprites refilled every frame: `Begin`, then `Add`
 * each glow, then `End`, which hides the sprites left over.
 */
export default class GlowLayer extends Container {
    private sprites: Sprite[] = [];
    private used = 0;

    constructor(private texture: Texture) {
        super();
        this.interactive = this.interactiveChildren = false;
    }

    Begin(): void {
        this.used = 0;
    }

    /** A glow centred on `(x, y)`, in this layer's pixels, `pixelsPerTile` across a tile - nothing if it's too faint to see. */
    Add(x: number, y: number, look: GlowLook, pixelsPerTile: number): void {
        if (look.alpha <= 0) {
            return;
        }
        let sprite = this.sprites[this.used];
        if (!sprite) {
            sprite = new Sprite(this.texture);
            sprite.anchor.set(0.5);
            sprite.blendMode = BLEND_MODES.ADD;
            this.addChild(sprite);
            this.sprites.push(sprite);
        }
        this.used++;
        sprite.visible = true;
        sprite.position.set(x, y);
        sprite.scale.set((look.radius * 2 * pixelsPerTile) / this.texture.width);
        sprite.tint = look.tint;
        sprite.alpha = look.alpha;
    }

    End(): void {
        for (let i = this.used; i < this.sprites.length; i++) {
            this.sprites[i].visible = false;
        }
    }
}
