// tslint:disable:prefer-for-of

import {Constant} from "./Constant";
import {RectTileLayer} from "./RectTileLayer";
import {TileRenderer} from "./renderers/TileRenderer";

export default class CompositeRectTileLayer extends PIXI.Container {

    z: number;
    zIndex: number;
    modificationMarker = 0;
    shadowColor = new Float32Array([0.0, 0.0, 0.0, 0.5]);
    _globalMat: PIXI.Matrix = null;

    texPerChild: number;

    constructor(zIndex?: number, bitmaps?: Array<PIXI.Texture>, texPerChild?: number) {
        super();
        this.initialize.apply(this, arguments);
    }

    updateTransform() {
        super.displayObjectUpdateTransform()
    }

    initialize(zIndex?: number, bitmaps?: Array<PIXI.Texture>, texPerChild?: number) {
        if(texPerChild as any === true) {
            // old format, ignore it!
            texPerChild = 0;
        }
        this.z = this.zIndex = zIndex;
        this.texPerChild = texPerChild || Constant.boundCountPerBuffer * Constant.maxTextures;
        if(bitmaps) {
            this.setBitmaps(bitmaps);
        }
    }

    setBitmaps(bitmaps: Array<PIXI.Texture>) {
        const texPerChild = this.texPerChild;
        const len1 = this.children.length;
        const len2 = Math.ceil(bitmaps.length / texPerChild);
        let i: number;
        for(i = 0; i < len1; i++) {
            (this.children[i] as RectTileLayer).textures = bitmaps.slice(i * texPerChild, (i + 1) * texPerChild);
        }
        for(i = len1; i < len2; i++) {
            const layer = new RectTileLayer(this.zIndex, bitmaps.slice(i * texPerChild, (i + 1) * texPerChild));
            layer.compositeParent = true;
            layer.offsetX = Constant.boundSize;
            layer.offsetY = Constant.boundSize;
            this.addChild(layer);
        }
    }

    clear() {
        for(let i = 0; i < this.children.length; i++) {
            (this.children[i] as RectTileLayer).clear();
        }
        this.modificationMarker = 0;
    }

    addRect(textureIndex: number, u: number, v: number, x: number, y: number, tileWidth: number, tileHeight: number) {
        const childIndex: number = textureIndex / this.texPerChild >> 0;
        const textureId: number = textureIndex % this.texPerChild;

        if(this.children[childIndex] && (this.children[childIndex] as RectTileLayer).textures) {
            (this.children[childIndex] as RectTileLayer).addRect(textureId, u, v, x, y, tileWidth, tileHeight);
        }
    }

    addFrame(texture_: PIXI.Texture | string | number, x: number, y: number, animX?: number, animY?: number) {
        let texture: PIXI.Texture;
        let layer: RectTileLayer = null;
        let ind: number = 0;
        const children = this.children;

        if(typeof texture_ === "number") {
            const childIndex = texture_ / this.texPerChild >> 0;
            layer = children[childIndex] as RectTileLayer;

            if(!layer) {
                layer = children[0] as RectTileLayer;
                if(!layer) {
                    return false;
                }
                ind = 0;
            } else {
                ind = texture_ % this.texPerChild;
            }

            texture = layer.textures[ind];
        } else {
            if(typeof texture_ === "string") {
                texture = PIXI.Texture.fromImage(texture_);
            } else {
                texture = texture_ as PIXI.Texture;
            }

            for(let i = 0; i < children.length; i++) {
                const child = children[i] as RectTileLayer;
                const tex = child.textures;
                for(let j = 0; j < tex.length; j++) {
                    if(tex[j].baseTexture === texture.baseTexture) {
                        layer = child;
                        ind = j;
                        break;
                    }
                }
                if(layer) {
                    break;
                }
            }

            if(!layer) {
                for(let i = 0; i < children.length; i++) {
                    const child = children[i] as RectTileLayer;
                    if(child.textures.length < this.texPerChild) {
                        layer = child;
                        ind = child.textures.length;
                        child.textures.push(texture);
                        break;
                    }
                }
                if(!layer) {
                    layer = new RectTileLayer(this.zIndex, texture);
                    layer.compositeParent = true;
                    layer.offsetX = Constant.boundSize;
                    layer.offsetY = Constant.boundSize;
                    children.push(layer);
                    ind = 0;
                }
            }
        }

        layer.addRect(ind, texture.frame.x, texture.frame.y, x, y, texture.frame.width, texture.frame.height, animX, animY);
        return true;
    }

    renderCanvas(renderer: PIXI.CanvasRenderer) {
        if(!this.visible || this.worldAlpha <= 0 || !this.renderable) {
            return;
        }
        const plugin = renderer.plugins.tilemap;
        if(!plugin.dontUseTransform) {
            const wt = this.worldTransform;
            renderer.context.setTransform(
                wt.a,
                wt.b,
                wt.c,
                wt.d,
                wt.tx * renderer.resolution,
                wt.ty * renderer.resolution
            );
        }
        const layers = this.children;
        for(let i = 0; i < layers.length; i++) {
            (layers[i] as RectTileLayer).renderCanvasCore(renderer);
        }
    }

    renderWebGL(renderer: PIXI.WebGLRenderer) {
        if(!this.visible || this.worldAlpha <= 0 || !this.renderable) {
            return;
        }
        const gl = renderer.gl;
        const plugin = renderer.plugins.tilemap;
        const shader = plugin.getShader();
        renderer.setObjectRenderer(plugin);
        renderer.bindShader(shader);
        // TODO: dont create new array, please
        this._globalMat = this._globalMat || new PIXI.Matrix();
        renderer._activeRenderTarget.projectionMatrix.copy(this._globalMat).append(this.worldTransform);
        shader.uniforms.projectionMatrix = this._globalMat.toArray(true);
        shader.uniforms.shadowColor = this.shadowColor;
        const af = shader.uniforms.animationFrame = plugin.tileAnim;
        // shader.syncUniform(shader.uniforms.animationFrame);
        const layers = this.children;
        for(let i = 0; i < layers.length; i++) {
            (layers[i] as RectTileLayer).renderWebGLCore(renderer, plugin);
        }
    }

    isModified(anim: boolean) {
        const layers = this.children;
        if(this.modificationMarker !== layers.length) {
            return true;
        }
        for(let i = 0; i < layers.length; i++) {
            if((layers[i] as RectTileLayer).isModified(anim)) {
                return true;
            }
        }
        return false;
    }

    clearModify() {
        const layers = this.children;
        this.modificationMarker = layers.length;
        for(let i = 0; i < layers.length; i++) {
            (layers[i] as RectTileLayer).clearModify();
        }
    }
}

PIXI.WebGLRenderer.registerPlugin("tilemap", TileRenderer);
