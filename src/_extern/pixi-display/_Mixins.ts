import {Container, DisplayObject, Graphics, Point} from "pixi.js";
import Group from "./Group";
import {Layer} from "./Layer";
import Stage from "./Stage";

// tslint:disable:no-namespace
// tslint:disable:interface-name

interface WebGLRenderer {
    _activeLayer: Layer
    _renderSessionId: number
    _lastDisplayOrder: number
    incDisplayOrder(): number
}
interface CanvasRenderer {
    _activeLayer: Layer
    _renderSessionId: number
    _lastDisplayOrder: number
    incDisplayOrder(): number
}

export interface ContainerLayer {
    containerRenderWebGL(renderer: PIXI.WebGLRenderer): void;
    containerRenderCanvas(renderer: PIXI.CanvasRenderer): void;
}

export interface Layerable {
    parentGroup: Group,

    /**
     * Object will be rendered
     *
     * please specify it to handle zOrder and zIndex
     *
     * its always null for layers
     *
     */
    parentLayer: Layer,

    _activeParentLayer: Layer,
    /**
     * zOrder is floating point number, distance between screen and object
     * Objects with largest zOrder will appear first in their Layer, if zOrder sorting is enabled
     */
    zOrder: number,

    /**
     * zIndex is integer number, the number of layer
     * Objects with least zOrder appear first in their Layer, if zIndex sorting is enabled
     */
    zIndex: number,

    /**
     * updateOrder is calculated by DisplayList, it is required for sorting inside DisplayGroup
     */
    updateOrder: number,

    /**
     * displayOrder is calculated by render, it is required for interaction
     */
    displayOrder: number,

    /**
     * Stage will look inside for elements that can be re-arranged, if this flag is true
     * Make it false for ParticleContainer
     */
    layerableChildren: boolean
}

export function ApplyMixins() {
    (Object as any).assign(PIXI.DisplayObject.prototype, {
        parentLayer: null,
        _activeParentLayer: null,
        parentGroup: null,
        zOrder: 0,
        zIndex: 0,
        updateOrder: 0,
        displayOrder: 0,
        layerableChildren: true
    });

    if(PIXI.particles && PIXI.particles.ParticleContainer) {
        // tslint:disable-next-line:quotemark
        PIXI.particles.ParticleContainer.prototype['layerableChildren'] = false;
    } else if((PIXI as any).ParticleContainer) {
        (PIXI as any).ParticleContainer.prototype.layerableChildren = false;
    }

    (Object as any).assign(PIXI.Container.prototype, {
        renderWebGL(renderer: PIXI.WebGLRenderer | any): void {
            if(this._activeParentLayer && this._activeParentLayer !== renderer._activeLayer) {
                return;
            }

            if(!this.visible) {
                this.displayOrder = 0;
                return;
            }

            this.displayOrder = renderer.incDisplayOrder();

            // if the object is not visible or the alpha is 0 then no need to render this element
            if(this.worldAlpha <= 0 || !this.renderable) {
                return;
            }

            this.containerRenderWebGL(renderer);
        },
        renderCanvas(renderer: PIXI.CanvasRenderer | any): void {
            if(this._activeParentLayer && this._activeParentLayer !== renderer._activeLayer) {
                return;
            }

            if(!this.visible) {
                this.displayOrder = 0;
                return;
            }

            this.displayOrder = renderer.incDisplayOrder();

            // if the object is not visible or the alpha is 0 then no need to render this element
            if(this.worldAlpha <= 0 || !this.renderable) {
                return;
            }

            this.containerRenderCanvas(renderer);
        },
        containerRenderWebGL: PIXI.Container.prototype.renderWebGL,
        containerRenderCanvas: PIXI.Container.prototype.renderCanvas
    });

    (Object as any).assign(PIXI.WebGLRenderer.prototype, {
        _lastDisplayOrder: 0,
        _activeLayer: null,

        incDisplayOrder() {
            return ++this._lastDisplayOrder;
        },

        _oldRender: PIXI.WebGLRenderer.prototype.render,

        render(
            displayObject: PIXI.DisplayObject, renderTexture?: PIXI.RenderTexture, clear?: boolean,
            transform?: PIXI.Transform, skipUpdateTransform?: boolean) {
            if(!renderTexture) {
                this._lastDisplayOrder = 0;
            }
            this._activeLayer = null;
            if((displayObject as Stage).isStage) {
                (displayObject as Stage).updateStage()
            }
            this._oldRender(displayObject, renderTexture, clear, transform, skipUpdateTransform);
        }
    });

    (Object as any).assign(PIXI.CanvasRenderer.prototype, {
        _lastDisplayOrder: 0,
        _activeLayer: null,

        incDisplayOrder() {
            return ++this._lastDisplayOrder;
        },

        _oldRender: PIXI.CanvasRenderer.prototype.render,

        render(
            displayObject: PIXI.DisplayObject, renderTexture?: PIXI.RenderTexture, clear?: boolean,
            transform?: PIXI.Transform, skipUpdateTransform?: boolean) {
            if(!renderTexture) {
                this._lastDisplayOrder = 0;
            }
            this._activeLayer = null;
            if((displayObject as Stage).isStage) {
                (displayObject as Stage).updateStage()
            }
            this._oldRender(displayObject, renderTexture, clear, transform, skipUpdateTransform);
        }
    });

    (Object as any).assign(PIXI.interaction.InteractionManager.prototype, {
        _queue: [[] as Array<DisplayObject>, [] as Array<DisplayObject>],
        /**
         * This is private recursive copy of processInteractive
         */
        _displayProcessInteractive(
            point: Point, displayObject: DisplayObject | any,
            hitTestOrder: number, interactive: boolean, outOfMask: boolean): number {
            if(!displayObject || !displayObject.visible) {
                return 0;
            }

            // Took a little while to rework this function correctly! But now it is done and nice and optimised. ^_^
            //
            // This function will now loop through all objects and then only hit test the objects it HAS to, not all of them. MUCH faster..
            // An object will be hit test if the following is true:
            //
            // 1: It is interactive.
            // 2: It belongs to a parent that is interactive AND one of the parents children have not already been hit.
            //
            // As another little optimisation once an interactive object has been hit we can carry on through the scenegraph,
            // but we know that there will be no more hits! So we can avoid extra hit tests
            // A final optimisation is that an object is not hit test directly if a child has already been hit.

            let hit = 0;
            let interactiveParent = interactive = displayObject.interactive || interactive;

            // if the displayobject has a hitArea, then it does not need to hitTest children.
            if(displayObject.hitArea) {
                interactiveParent = false;
            }

            if(displayObject._activeParentLayer) {
                outOfMask = false;
            }

            // it has a mask! Then lets hit test that before continuing..
            const mask: Graphics = (displayObject as any)._mask;
            if(hitTestOrder < Infinity && mask) {
                if(!mask.containsPoint(point)) {
                    outOfMask = true;
                }
            }

            // it has a filterArea! Same as mask but easier, its a rectangle
            if(hitTestOrder < Infinity && displayObject.filterArea) {
                if(!displayObject.filterArea.contains(point.x, point.y)) {
                    outOfMask = true;
                }
            }

            // ** FREE TIP **! If an object is not interactive or has no buttons in it
            // (such as a game scene!) set interactiveChildren to false for that displayObject.
            // This will allow pixi to completely ignore and bypass checking the displayObjects children.
            const children: Array<DisplayObject> = (displayObject as Container).children;
            if(displayObject.interactiveChildren && children) {
                for(let i = children.length - 1; i >= 0; i--) {
                    const child = children[i];

                    // time to get recursive.. if this function will return if something is hit..
                    const hitChild = this._displayProcessInteractive(point, child, hitTestOrder, interactiveParent, outOfMask);
                    if(hitChild) {
                        // its a good idea to check if a child has lost its parent.
                        // this means it has been removed whilst looping so its best
                        if(!child.parent) {
                            continue;
                        }

                        hit = hitChild;
                        hitTestOrder = hitChild;
                    }
                }
            }

            // no point running this if the item is not interactive or does not have an interactive parent.
            if(interactive) {
                if(!outOfMask) {
                    // if we are hit testing (as in we have no hit any objects yet)
                    // We also don't need to worry about hit testing if once of the displayObjects children has already been hit!
                    if(hitTestOrder < displayObject.displayOrder) {
                        // pixi v4
                        if(displayObject.hitArea) {
                            displayObject.worldTransform.applyInverse(point, this._tempPoint);
                            if(displayObject.hitArea.contains(this._tempPoint.x, this._tempPoint.y)) {
                                hit = displayObject.displayOrder;
                            }
                        } else if((displayObject as any).containsPoint) {
                            if((displayObject as any).containsPoint(point)) {
                                hit = displayObject.displayOrder;
                            }
                        }
                    }

                    if(displayObject.interactive) {
                        this._queueAdd(displayObject, hit === Infinity ? 0 : hit);
                    }
                } else {
                    if(displayObject.interactive) {
                        this._queueAdd(displayObject, 0);
                    }
                }
            }

            return hit;

        },

        processInteractive(
            strangeStuff: PIXI.interaction.InteractionEvent | Point, displayObject: DisplayObject,
            // tslint:disable-next-line:ban-types
            func: Function, hitTest: boolean, interactive: boolean) {
            // older versions
            let interactionEvent: PIXI.interaction.InteractionEvent = null;
            let point: Point = null;
            if((strangeStuff as PIXI.interaction.InteractionEvent).data &&
                (strangeStuff as PIXI.interaction.InteractionEvent).data.global) {
                interactionEvent = strangeStuff as PIXI.interaction.InteractionEvent;
                point = interactionEvent.data.global;
            } else {
                point = strangeStuff as Point;
            }
            this._startInteractionProcess();
            this._displayProcessInteractive(point, displayObject, hitTest ? 0 : Infinity, false);
            this._finishInteractionProcess(interactionEvent, func);
        },

        _startInteractionProcess() {
            // move it to constructor
            this._eventDisplayOrder = 1;
            if(!this._queue) {
                // move it to constructor
                this._queue = [[], []];
            }
            this._queue[0].length = 0;
            this._queue[1].length = 0;
        },

        _queueAdd(displayObject: DisplayObject, order: number) {
            const queue = this._queue;
            if(order < this._eventDisplayOrder) {
                queue[0].push(displayObject);
            } else {
                if(order > this._eventDisplayOrder) {
                    this._eventDisplayOrder = order;
                    const q = queue[1];
                    for(let i = 0, l = q.length; i < l; i++) {
                        queue[0].push(q[i]);
                    }
                    queue[1].length = 0;
                }
                queue[1].push(displayObject);
            }
        },
        // tslint:disable-next-line:ban-types
        _finishInteractionProcess(event: PIXI.interaction.InteractionEvent, func: Function) {
            const queue = this._queue;
            let q = queue[0];
            for(let i = 0, l = q.length; i < l; i++) {
                if(event) {
                    // v4.3
                    if(func) {
                        func(event, q[i], false);
                    }
                } else {
                    // old
                    func(q[i], false);
                }
            }
            q = queue[1];
            for(let i = 0, l = q.length; i < l; i++) {
                if(event) {
                    // v4.3
                    if(!event.target) {
                        event.target = q[i];
                    }
                    if(func) {
                        func(event, q[i], true);
                    }
                } else {
                    // old
                    func(q[i], true);
                }
            }
        }
    });
}
