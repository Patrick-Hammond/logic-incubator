import {Filter, Matrix, RenderTexture, Sprite, TextureMatrix, systems} from "pixi.js";
import * as overlayVertexSrc from "./overlay-blend.vert";
import * as overlayFragmentSrc from "./overlay-blend.frag";

/**
 * "Overlay" blend mode for the WebGL renderer, which silently draws
 * BLEND_MODES.OVERLAY as NORMAL since GL blending can't branch on the backdrop.
 *
 * Goes on the top layer's filters and blends it against `backdrop`'s texture at
 * the same screen position. Only the backdrop sprite's own texture is read, not
 * its filters or anything else drawn beneath it, so effects meant to cover both
 * layers belong on a shared parent.
 */
export class OverlayBlendFilter extends Filter {
    private _backdrop: Sprite;
    private _backdropUv: TextureMatrix;
    private _backdropMatrix = new Matrix();

    constructor(backdrop: Sprite) {
        super(overlayVertexSrc, overlayFragmentSrc, {
            uBackdrop: backdrop.texture,
            uBackdropMatrix: new Matrix(),
            uBackdropClamp: new Float32Array(4)
        });

        this._backdrop = backdrop;
        this._backdropUv = new TextureMatrix(backdrop.texture, 0);
    }

    apply(filterManager: systems.FilterSystem, input: RenderTexture, output: RenderTexture, clear: boolean): void {
        const texture = this._backdrop.texture;
        this._backdropUv.texture = texture;
        this._backdropUv.update();

        // Same mapping SpriteMaskFilter uses: filter coords -> backdrop sprite's
        // normalised coords -> its frame within the (possibly atlased) base texture.
        this.uniforms.uBackdrop = texture;
        this.uniforms.uBackdropMatrix = filterManager.calculateSpriteMatrix(this._backdropMatrix, this._backdrop)
            .prepend(this._backdropUv.mapCoord);
        this.uniforms.uBackdropClamp = this._backdropUv.uClampFrame;

        filterManager.applyFilter(this, input, output, clear);
    }
}
