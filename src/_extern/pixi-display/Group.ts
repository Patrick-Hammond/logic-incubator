// tslint:disable:no-namespace
// tslint:disable:interface-name
// tslint:disable:prefer-for-of

/**
 * A shared component for multiple DisplayObject's allows to specify rendering order for them
 *
 * @class
 * @extends EventEmitter
 * @memberof PIXI
 * @param zIndex {number} z-index for display group
 * @param sorting {boolean | Function} if you need to sort elements inside,
 * please provide function that will set displayObject.zOrder accordingly
 */
import {DisplayObject, utils} from "pixi.js";
import {Layer} from "./Layer";
import Stage from "./Stage";

export default class Group extends utils.EventEmitter {
    static _layerUpdateId = 0;

    static _lastLayerConflict = 0;

    static compareZIndex(a: DisplayObject | any, b: DisplayObject | any) {
        if(a.zIndex !== b.zIndex) {
            return a.zIndex - b.zIndex;
        }
        if(a.zOrder > b.zOrder) {
            return -1;
        }
        if(a.zOrder < b.zOrder) {
            return 1;
        }
        return a.updateOrder - b.updateOrder;
    }

    static conflict() {
        if(Group._lastLayerConflict + 5000 < Date.now()) {
            Group._lastLayerConflict = Date.now();
            console.log(`PIXI-display plugin found two layers with the same group in one stage
                that's not healthy. Please place a breakpoint here and debug it`);
        }
    }

    computedChildren: Array<DisplayObject>;

    _activeLayer: Layer = null;

    _activeStage: Stage = null;

    _activeChildren: Array<DisplayObject> = [];

    _lastUpdateId = -1;

    useRenderTexture: boolean = false;
    useDoubleBuffer: boolean = false;
    sortPriority: number = 0;
    clearColor: ArrayLike<number> = new Float32Array([0, 0, 0, 0]);

    // TODO: handle orphan groups
    // TODO: handle groups that don't want to be drawn in parent
    canDrawWithoutLayer = false;
    canDrawInParentStage = true;

    /**
     * default zIndex value for layers that are created with this Group
     * @type {number}
     */
    zIndex = 0;

    enableSort = false;

    _tempResult: Array<DisplayObject> = [];
    _tempZero: Array<DisplayObject> = [];

    useZeroOptimization: boolean = false;

    // tslint:disable-next-line:ban-types
    constructor(zIndex: number, sorting: boolean | Function) {
        super();

        this.zIndex = zIndex;

        this.enableSort = !!sorting;

        if(typeof sorting === "function") {
            this.on("sort", sorting);
        }
    }

    doSort(layer: Layer, sorted: Array<DisplayObject>) {
        if((this.listeners as any)("sort", true)) {
            for(let i = 0; i < sorted.length; i++) {
                this.emit("sort", sorted[i]);
            }
        }
        if(this.useZeroOptimization) {
            this.doSortWithZeroOptimization(layer, sorted);
        } else {
            sorted.sort(Group.compareZIndex);
        }
    }

    doSortWithZeroOptimization(layer: Layer, sorted: Array<DisplayObject>) {
        throw new Error("not implemented yet");
        // default sorting
        // const result = this._tempResult;
        // const zero = this._tempZero;
        // for (let i = 0; i < sorted.length; i++) {
        //     const elem = sorted[i];
        //     if (elem.zIndex == 0 && elem.zOrder == 0) {
        //         zero.push(elem);
        //     } else {
        //         result.push(elem);
        //     }
        // }
        // if (zero.length == 0) {
        //     sorted.sort(Group.compareZOrder);
        // } else {
        //     result.sort(Group.compareZOrder);
        //     let j = 0;
        //     for (let i = 0; i < result.length; i++) {
        //         const elem = result[i];
        //         if (elem.zIndex < 0 && elem.zIndex == 0 && elem.zOrder > 0) {
        //             sorted[j++] = result[i]++;
        //         }
        //     }
        // }
    }

    /**
     * clears temporary variables
     */
    clear() {
        this._activeLayer = null;
        this._activeStage = null;
        this._activeChildren.length = 0;
    }

    /**
     * used only by displayList before sorting takes place
     */
    addDisplayObject(stage: Stage, displayObject: DisplayObject | any) {
        this.check(stage);
        displayObject._activeParentLayer = this._activeLayer;
        if(this._activeLayer) {
            this._activeLayer._activeChildren.push(displayObject);
        } else {
            this._activeChildren.push(displayObject);
        }
    }

    /**
     * called when corresponding layer is found in current stage
     * @param stage
     * @param layer
     */
    foundLayer(stage: Stage, layer: Layer) {
        this.check(stage);
        if(this._activeLayer != null) {
            Group.conflict();
        }
        this._activeLayer = layer;
        this._activeStage = stage;
    }

    /**
     * called after stage finished the work
     * @param stage
     */
    foundStage(stage: Stage) {
        if(!this._activeLayer && !this.canDrawInParentStage) {
            this.clear();
        }
    }

    check(stage: Stage) {
        if(this._lastUpdateId < Group._layerUpdateId) {
            this._lastUpdateId = Group._layerUpdateId;
            this.clear();
            this._activeStage = stage;
        } else if(this.canDrawInParentStage) {
            let current = this._activeStage;
            while(current && current !== stage) {
                current = current._activeParentStage;
            }
            this._activeStage = current;
            if(current == null) {
                this.clear();
                return
            }
        }
    }
}
