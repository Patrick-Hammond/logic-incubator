// tslint:disable:no-namespace
// tslint:disable:interface-name
// tslint:disable:prefer-for-of

/**
 * Created by ivanp on 29.01.2017.
 */

import Group from "./Group";
import Stage from "./Stage";

export class LayerTextureCache {

    renderTexture: PIXI.RenderTexture = null;
    doubleBuffer: Array<PIXI.RenderTexture> = null;
    currentBufferIndex = 0;
    _tempRenderTarget: PIXI.RenderTarget = null;
    constructor(public layer: Layer) {
    }

    initRenderTexture(renderer?: PIXI.WebGLRenderer) {
        const width = renderer ? renderer.screen.width : 100;
        const height = renderer ? renderer.screen.height : 100;
        const resolution = renderer ? renderer.resolution : PIXI.settings.RESOLUTION;

        this.renderTexture = PIXI.RenderTexture.create(width, height, resolution);

        if(this.layer.group.useDoubleBuffer) {
            this.doubleBuffer = [
                PIXI.RenderTexture.create(width, height, resolution),
                PIXI.RenderTexture.create(width, height, resolution)
            ];
        }
    }

    getRenderTexture() {
        if(!this.renderTexture) {
            this.initRenderTexture();
        }
        return this.renderTexture;
    }

    pushTexture(renderer: PIXI.WebGLRenderer) {
        const screen = renderer.screen;

        if(!this.renderTexture) {
            this.initRenderTexture(renderer);
        }

        const rt = this.renderTexture;
        const group = this.layer.group;
        const db = this.doubleBuffer;

        if(rt.width !== screen.width ||
            rt.height !== screen.height ||
            rt.baseTexture.resolution !== renderer.resolution) {
            rt.baseTexture.resolution = renderer.resolution;
            rt.resize(screen.width, screen.height);

            if(db) {
                db[0].baseTexture.resolution = renderer.resolution;
                db[0].resize(screen.width, screen.height);
                db[1].baseTexture.resolution = renderer.resolution;
                db[1].resize(screen.width, screen.height);
            }
        }

        this._tempRenderTarget = renderer._activeRenderTarget;

        renderer.currentRenderer.flush();

        if(group.useDoubleBuffer) {
            // double-buffer logic
            let buffer = db[this.currentBufferIndex];
            if(!(buffer.baseTexture as any)._glTextures[renderer.CONTEXT_UID]) {
                renderer.bindRenderTexture(buffer, null);
                if(group.clearColor) {
                    renderer.clear(group.clearColor as any);
                }
            }
            renderer.unbindTexture(rt);
            (rt.baseTexture as any)._glTextures = (buffer.baseTexture as any)._glTextures;
            (rt.baseTexture as any)._glRenderTargets = (buffer.baseTexture as any)._glRenderTargets;

            this.currentBufferIndex = 1 - this.currentBufferIndex;
            buffer = db[this.currentBufferIndex]
            renderer.bindRenderTexture(buffer, null);
        } else {
            // simple logic
            renderer.bindRenderTexture(rt, undefined);
        }

        if(group.clearColor) {
            renderer.clear(group.clearColor as any);
        }
    }

    popTexture(renderer: PIXI.WebGLRenderer) {
        renderer.currentRenderer.flush();
        renderer.bindRenderTarget(this._tempRenderTarget);
        this._tempRenderTarget = null;
    }

    destroy() {
        if(this.renderTexture) {
            this.renderTexture.destroy();
            if(this.doubleBuffer) {
                this.doubleBuffer[0].destroy(true);
                this.doubleBuffer[1].destroy(true);
            }
        }
    }
}

export class Layer extends PIXI.Container {

    get useRenderTexture() {
        return this.group.useRenderTexture;
    }

    set useRenderTexture(value: boolean) {
        this.group.useRenderTexture = value;
    }

    get useDoubleBuffer() {
        return this.group.useDoubleBuffer;
    }

    set useDoubleBuffer(value: boolean) {
        this.group.useDoubleBuffer = value;
    }

    get clearColor() {
        return this.group.clearColor;
    }

    set clearColor(value: ArrayLike<number>) {
        this.group.clearColor = value;
    }

    get sortPriority() {
        return this.group.sortPriority;
    }

    set sortPriority(value: number) {
        this.group.sortPriority = value;
    }

    isLayer = true;
    group: Group = null;
    _activeChildren: Array<PIXI.DisplayObject> = [];
    _tempChildren: Array<PIXI.DisplayObject> = null;
    _activeStageParent: Stage = null;
    _sortedChildren: Array<PIXI.DisplayObject> = [];
    _tempLayerParent: Layer = null;

    textureCache: LayerTextureCache;
    insertChildrenBeforeActive = true;
    insertChildrenAfterActive = true;
    constructor(group: Group = null) {
        super();
        if(group != null) {
            this.group = group;
            (this as any).zIndex = group.zIndex;
        } else {
            this.group = new Group(0, false);
        }
        this._tempChildren = this.children;
    }

    beginWork(stage: Stage) {
        const active = this._activeChildren;
        this._activeStageParent = stage;
        this.group.foundLayer(stage, this);
        const groupChildren = this.group._activeChildren;
        active.length = 0;
        for(let i = 0; i < groupChildren.length; i++) {
            (groupChildren[i] as any)._activeParentLayer = this;
            active.push(groupChildren[i]);
        }
        groupChildren.length = 0;
    }

    endWork() {
        const children = this.children;
        const active = this._activeChildren;
        const sorted = this._sortedChildren;

        for(let i = 0; i < active.length; i++) {
            this.emit("display", active[i])
        }

        sorted.length = 0;
        if(this.insertChildrenBeforeActive) {
            for(let i = 0; i < children.length; i++) {
                sorted.push(children[i]);
            }
        }
        for(let i = 0; i < active.length; i++) {
            sorted.push(active[i]);
        }
        if(!this.insertChildrenBeforeActive &&
            this.insertChildrenAfterActive) {
            for(let i = 0; i < children.length; i++) {
                sorted.push(children[i]);
            }
        }

        if(this.group.enableSort) {
            this.doSort();
        }
    }

    getRenderTexture() {
        if(!this.textureCache) {
            this.textureCache = new LayerTextureCache(this);
        }
        return this.textureCache.getRenderTexture();
    }

    // tslint:disable-next-line:no-empty
    updateDisplayLayers() {}

    /**
     * you can override this method for this particular layer, if you want
     */
    doSort() {
        this.group.doSort(this, this._sortedChildren);
    }

    _preRender(renderer: PIXI.WebGLRenderer | PIXI.CanvasRenderer | any): boolean {
        if((this as any)._activeParentLayer && (this as any)._activeParentLayer !== renderer._activeLayer) {
            return false;
        }

        if(!this.visible) {
            (this as any).displayOrder = 0;
            return false;
        }

        (this as any).displayOrder = renderer.incDisplayOrder();

        // if the object is not visible or the alpha is 0 then no need to render this element
        if(this.worldAlpha <= 0 || !this.renderable) {
            return false;
        }

        // we are making a hack with swapping children, it can go wrong easily
        // this is special "recover" if that allows stage to recover just after failed frame

        if(this.children !== this._sortedChildren &&
            this._tempChildren !== this.children) {
            this._tempChildren = this.children;
        }

        // just a temporary feature - getBounds() for filters will work with that
        // TODO: make a better hack for getBounds()

        this._boundsID++;
        this.children = this._sortedChildren;

        this._tempLayerParent = renderer._activeLayer;
        renderer._activeLayer = this;
        return true;
    }

    _postRender(renderer: PIXI.WebGLRenderer | PIXI.CanvasRenderer | any) {
        this.children = this._tempChildren;
        renderer._activeLayer = this._tempLayerParent;
        this._tempLayerParent = null;
    }

    renderWebGL(renderer: PIXI.WebGLRenderer) {
        if(!this._preRender(renderer)) {
            return;
        }

        if(this.group.useRenderTexture) {
            if(!this.textureCache) {
                this.textureCache = new LayerTextureCache(this);
            }
            this.textureCache.pushTexture(renderer);
        }

        (this as any).containerRenderWebGL(renderer);
        this._postRender(renderer);

        if(this.group.useRenderTexture) {
            this.textureCache.popTexture(renderer);
        }
    }

    renderCanvas(renderer: PIXI.CanvasRenderer) {
        if(this._preRender(renderer)) {
            (this as any).containerRenderCanvas(renderer);
            this._postRender(renderer);
        }
    }

    destroy(options?: any) {
        if(this.textureCache) {
            this.textureCache.destroy();
            this.textureCache = null;
        }
        super.destroy(options);
    }
}
